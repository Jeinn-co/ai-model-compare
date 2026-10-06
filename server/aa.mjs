import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { providerOf, shownModels } from "./bench.mjs"

const BASE = "https://artificialanalysis.ai/models/releases"
const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "aa-cache.json")
// AA pages are large and slow; reuse a fetch for this long before asking again.
const TTL_MS = 6 * 60 * 60 * 1000
const EFFORT_BY_LEVEL = { 10: "Minimal", 20: "Low", 30: "Medium", 40: "High", 50: "Extra High", 60: "Max" }

async function page(url) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "ai-model-compare" },
        signal: AbortSignal.timeout(40_000),
      })
      if (!response.ok) throw new Error(`${url}: ${response.status}`)
      // The data sits in an escaped JSON payload inside the HTML.
      return (await response.text()).replaceAll('\\"', '"').replaceAll("\\\\", "\\")
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

// End index (exclusive) of the JSON object that opens at `start`, or -1.
function objectEnd(text, start) {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === "\\") i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}" && --depth === 0) return i + 1
  }
  return -1
}

// Every JSON object whose text starts with `prefix` (a RegExp source).
function objects(text, prefix) {
  const out = []
  for (const match of text.matchAll(new RegExp(prefix, "g"))) {
    const end = objectEnd(text, match.index)
    if (end === -1) continue
    try {
      out.push(JSON.parse(text.slice(match.index, end)))
    } catch {
      // A malformed fragment is skipped rather than guessed at.
    }
  }
  return out
}

// AA names Claude models "Claude Opus 5.5"; the chart uses CursorBench's "Opus 5.5".
const displayName = (name) => name.replace(/^Claude /, "")

// AA lists every release back to 2023; only those from roughly the last eight months are
// drawn, so the window moves with time instead of pinning a date.
const RECENT_DAYS = 240

// Releases to show, as [{ slug, model }], picked from AA's full release list.
// A release appears either as a release object (slug, name, releaseDate) or only
// through its variants' `release` field, so both are read; a release counts once
// any of them carries an index score.
export function pickReleases(html) {
  const releases = new Map()
  for (const item of objects(html, '\\{"(?:id":"[0-9a-f-]+","slug|slug)":"[a-z0-9-]+"')) {
    const release = item.release ?? (item.releaseDate && item.name ? item : null)
    if (!release?.slug || !release.name) continue
    const entry = releases.get(release.slug) ??
      { slug: release.slug, model: displayName(release.name), scored: false, date: null }
    if (item.intelligenceIndex != null) entry.scored = true
    if (item.releaseDate && (!entry.date || item.releaseDate > entry.date)) entry.date = item.releaseDate
    releases.set(release.slug, entry)
  }
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10)
  const scored = [...releases.values()].filter(
    (release) => release.scored && release.date && release.date >= since && providerOf(release.model),
  )
  const shown = shownModels(scored.map((release) => release.model))
  return scored.filter((release) => shown.has(release.model)).map(({ slug, model }) => ({ slug, model }))
}

// One row per effort of a release, from its own variant objects only. A variant
// without an index score or a cost per task is left out, never filled from a neighbour.
export function releaseRows(html, release) {
  const rows = new Map()
  for (const variant of objects(html, '\\{"id":"[0-9a-f-]+","slug":"')) {
    if (variant.release?.slug !== release.slug || rows.has(variant.slug)) continue
    const level = variant.effort?.level
    // A reasoning variant AA lists without an effort level (Gemini 3.1 Pro Preview) is
    // drawn as one point with no effort; a non-reasoning variant is left out.
    if (level == null && variant.isReasoning !== true) continue
    const effort = level == null ? null : EFFORT_BY_LEVEL[level]
    if (level != null && !effort) continue
    const score = variant.intelligenceIndex
    // The x axis is cost: a variant AA scored but did not cost (Opus 4.7, Grok 4.20)
    // cannot be placed and is left out rather than given a guessed cost.
    const cost = variant.intelligenceIndexCostPerTask?.cost?.total
    if (score == null || !(cost > 0)) continue
    // The other three AA model-page cards; missing ones stay off the row.
    const speed = variant.medianOutputSpeed
    const verbosity = variant.canonicalIntelligenceIndexTokenCount?.output
    const latency = variant.timeToFirstAnswerToken?.total
    rows.set(variant.slug, {
      rank: 0,
      label: effort ? `${release.model} ${effort}` : release.model,
      model: release.model,
      effort,
      score,
      cost,
      ...(speed > 0 ? { speed } : {}),
      ...(verbosity > 0 ? { verbosity } : {}),
      ...(latency > 0 ? { latency } : {}),
      provider: providerOf(release.model),
    })
  }
  return [...rows.values()]
}

async function readCache() {
  try {
    const data = JSON.parse(await readFile(CACHE, "utf8"))
    return data?.fetchedAt && data.releases ? data : null
  } catch {
    return null
  }
}

function payload(data, changed) {
  const rows = Object.values(data.releases).flat()
  rows.sort((a, b) => b.score - a.score)
  rows.forEach((row, index) => (row.rank = index + 1))
  return { changed, fetchedAt: data.fetchedAt, source: BASE, rows }
}

export async function loadAa() {
  const cached = await readCache()
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < TTL_MS) return payload(cached, false)
  try {
    const picked = pickReleases(await page(BASE))
    if (picked.length === 0) throw new Error("no releases")
    const releases = {}
    // A few pages at a time: there are about thirty, each close to 1 MB.
    const queue = [...picked]
    const worker = async () => {
      for (let release = queue.shift(); release; release = queue.shift()) {
        try {
          releases[release.slug] = releaseRows(await page(`${BASE}/${release.slug}`), release)
        } catch {
          // Keep the last good rows for a release whose page failed this time; a
          // release that never loaded is left out rather than failing the chart.
          if (cached?.releases?.[release.slug]) releases[release.slug] = cached.releases[release.slug]
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    if (Object.keys(releases).length === 0) throw new Error("no release page loaded")
    const data = { fetchedAt: new Date().toISOString(), releases }
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(CACHE, JSON.stringify(data))
    return payload(data, true)
  } catch (error) {
    if (cached) return payload(cached, false)
    throw error
  }
}
