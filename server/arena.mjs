import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { providerOf } from "./bench.mjs"

// LMArena's own published leaderboard (arena.ai sits behind a Cloudflare challenge, so it
// is read from the dataset LMArena publishes on Hugging Face, through its JSON API).
const SOURCE = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset"
const API = "https://datasets-server.huggingface.co/filter"
const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "arena-cache.json")
const TTL_MS = 6 * 60 * 60 * 1000
// Text is the original Chatbot Arena; WebDev is the coding one.
export const ARENAS = ["text", "webdev"]
const PAGE_SIZE = 100

async function json(params) {
  const url = `${API}?${new URLSearchParams({ dataset: "lmarena-ai/leaderboard-dataset", split: "latest", ...params })}`
  let lastError
  // The API answers "temporary internal issue" now and then, and "index is loading" (up to a
  // minute) on the first query of an arena in a while; a retry with backoff goes through.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      const body = await response.json()
      if (!response.ok || body.error) throw new Error(body.error ?? String(response.status))
      return body
    } catch (error) {
      lastError = error
      await new Promise((done) => setTimeout(done, 2000 * 2 ** attempt))
    }
  }
  throw lastError
}

export function arenaRows(arena, items) {
  const rows = []
  for (const item of items) {
    // LMArena's own name, with "Claude " dropped as on the chart. The bracket holds an effort,
    // a build date or both ("Opus 5.5 (High)", "Grok 4.20 (Reasoning, 0309)"), so it is kept.
    const name = item.model_name.replace(/^Claude /, "")
    const provider = providerOf(name.replace(/\s*\(.*\)$/, ""))
    if (!provider || !Number.isFinite(item.rating)) continue
    rows.push({
      arena,
      rank: item.rank,
      name,
      provider,
      score: item.rating,
      lower: item.rating_lower,
      upper: item.rating_upper,
      votes: item.vote_count,
      date: item.leaderboard_publish_date,
    })
  }
  return rows
}

async function loadArenaRows(arena) {
  const items = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const body = await json({
      config: arena,
      where: `"category"='overall'`,
      orderby: `"rank"`,
      offset: String(offset),
      length: String(PAGE_SIZE),
    })
    items.push(...body.rows.map((entry) => entry.row))
    if (body.rows.length < PAGE_SIZE || items.length >= body.num_rows_total) break
  }
  return arenaRows(arena, items)
}

async function readCache() {
  try {
    const data = JSON.parse(await readFile(CACHE, "utf8"))
    return data?.fetchedAt && data.arenas ? data : null
  } catch {
    return null
  }
}

const payload = (data, changed) => ({
  changed,
  fetchedAt: data.fetchedAt,
  source: SOURCE,
  rows: ARENAS.flatMap((arena) => data.arenas[arena] ?? []),
})

export async function loadArena() {
  const cached = await readCache()
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < TTL_MS) return payload(cached, false)
  const arenas = {}
  for (const arena of ARENAS) {
    try {
      arenas[arena] = await loadArenaRows(arena)
    } catch {
      // Keep the last good rows for an arena that failed this time.
      if (cached?.arenas?.[arena]) arenas[arena] = cached.arenas[arena]
    }
  }
  if (!Object.values(arenas).some((rows) => rows.length)) {
    if (cached) return payload(cached, false)
    throw new Error("no arena loaded")
  }
  const data = { fetchedAt: new Date().toISOString(), arenas }
  await mkdir(dirname(CACHE), { recursive: true })
  await writeFile(CACHE, JSON.stringify(data))
  return payload(data, true)
}
