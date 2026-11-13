import { parquetReadObjects } from "hyparquet"
import { modelName } from "./gemini.mjs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { providerOf } from "./bench.mjs"

// LMArena's own published leaderboard (arena.ai sits behind a Cloudflare challenge, so it
// is read from the dataset LMArena publishes on Hugging Face).
const SOURCE = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset"
const PARSER_VERSION = 2
const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "arena-cache.json")
const TTL_MS = 6 * 60 * 60 * 1000
// Text is the original Chatbot Arena; WebDev is the coding one.
export const ARENAS = ["text", "webdev"]
export function arenaRows(arena, items) {
  const rows = []
  for (const item of items) {
    // LMArena's own name, with "Claude " dropped as on the chart. The bracket holds an effort,
    // a build date or both ("Opus 5.5 (High)", "Grok 4.20 (Reasoning, 0309)"), so it is kept.
    const name = modelName(item.model_name.replace(/^Claude /, ""))
    const provider = providerOf(name.replace(/\s*\(.*\)$/, ""))
    if (!provider || !Number.isFinite(item.rating)) continue
    rows.push({
      arena,
      rank: Number(item.rank),
      name,
      provider,
      score: item.rating,
      lower: item.rating_lower,
      upper: item.rating_upper,
      votes: Number(item.vote_count),
      date: item.leaderboard_publish_date,
    })
  }
  return rows
}

export async function loadArenaRows(arena) {
  // The dataset query API can fail while the published source file remains available.
  const response = await fetch(`${SOURCE}/resolve/main/${arena}/latest-00000-of-00001.parquet`, {
    signal: AbortSignal.timeout(40_000),
  })
  if (!response.ok) throw new Error(`LMArena ${arena}: HTTP ${response.status}`)
  const items = await parquetReadObjects({ file: await response.arrayBuffer() })
  const rows = arenaRows(arena, items.filter((item) => item.category === "overall"))
  if (!rows.length) throw new Error(`LMArena ${arena}: empty leaderboard`)
  return rows.sort((a, b) => a.rank - b.rank)
}

async function readCache() {
  try {
    const data = JSON.parse(await readFile(CACHE, "utf8"))
    return data?.fetchedAt && data.arenas ? data : null
  } catch {
    return null
  }
}

const PUBLISHED = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "arena.json")

async function publishedSnapshot() {
  try {
    const data = JSON.parse(await readFile(PUBLISHED, "utf8"))
    if (!data?.fetchedAt || !Array.isArray(data.rows) || !data.rows.length) return null
    return { fetchedAt: data.fetchedAt,
      arenas: Object.fromEntries(ARENAS.map((arena) => [arena, data.rows.filter((row) => row.arena === arena)])) }
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
  if (cached?.parserVersion === PARSER_VERSION && Date.now() - Date.parse(cached.fetchedAt) < TTL_MS) return payload(cached, false)
  const previous = cached ?? await publishedSnapshot()
  const arenas = {}
  let fresh = 0
  for (const arena of ARENAS) {
    try {
      arenas[arena] = await loadArenaRows(arena)
      fresh++
    } catch {
      // Keep the last good rows for an arena that failed this time. CI has no cache, so fall
      // back to the live snapshot the Pages workflow downloads into public/data first.
      const kept = previous?.arenas?.[arena] ?? []
      if (kept.length) arenas[arena] = kept
    }
  }
  if (!Object.values(arenas).some((rows) => rows.length)) {
    throw new Error("no arena loaded")
  }
  if (!fresh) return payload(previous, false)
  const data = { parserVersion: PARSER_VERSION,
    fetchedAt: fresh === ARENAS.length ? new Date().toISOString() : previous?.fetchedAt ?? new Date().toISOString(), arenas }
  await mkdir(dirname(CACHE), { recursive: true })
  await writeFile(CACHE, JSON.stringify(data))
  return payload(data, true)
}
