import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { RECENT_DAYS } from "./aa.mjs"
import { providerOf, shownModels } from "./bench.mjs"

const PAGE = "https://arcprize.org/leaderboard"
// The file the leaderboard page itself loads: one pre-joined row per model and effort.
const DATA = "https://arcprize.org/media/data/leaderboard/v2.json"
const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "arc-cache.json")
// ARC's effort names in the chart's wording. "None" (reasoning off) stays an effort, so the
// chart draws it first on its model's line instead of as a stray end point.
const EFFORTS = { None: "None", Minimal: "Minimal", Low: "Low", Medium: "Medium", High: "High", XHigh: "Extra High", Max: "Max" }

// "Claude Opus 5.5 (XHigh)" -> Opus 5.5, Extra High. An unknown bracket is kept as the effort.
export function splitName(name) {
  const match = name.match(/^(.*?)(?:\s*\(([^)]*)\))?$/)
  const model = match[1].replace(/^Claude /, "")
  const raw = match[2] ?? null
  return { model, effort: raw == null ? null : raw in EFFORTS ? EFFORTS[raw] : raw }
}

// ARC-AGI-2 rows of the supported families released in the same window as AA. Every row
// ARC shows carries a cost per task; one without is left out rather than guessed.
export function arcRows(evaluations, now = Date.now()) {
  const since = new Date(now - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10)
  const rows = new Map()
  for (const item of evaluations) {
    if (item.datasetId !== "v2_Semi_Private" || item.display === false) continue
    if (!item.modelReleaseDate || item.modelReleaseDate.slice(0, 10) < since) continue
    const { model, effort } = splitName(item.modelDisplayName)
    const provider = providerOf(model)
    if (!provider || !Number.isFinite(item.score) || !(item.costPerTask > 0)) continue
    const label = effort ? `${model} ${effort}` : model
    if (rows.has(label)) continue
    rows.set(label, { rank: 0, label, model, effort, score: item.score * 100, cost: item.costPerTask, provider })
  }
  const shown = shownModels([...rows.values()].map((row) => row.model))
  const list = [...rows.values()].filter((row) => shown.has(row.model))
  list.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
  list.forEach((row, index) => (row.rank = index + 1))
  return list
}

async function readCache() {
  try {
    const data = JSON.parse(await readFile(CACHE, "utf8"))
    return data?.fetchedAt && Array.isArray(data.rows) ? data : null
  } catch {
    return null
  }
}

export async function loadArc() {
  const cached = await readCache()
  try {
    const response = await fetch(DATA, { headers: { "user-agent": "ai-model-compare" }, signal: AbortSignal.timeout(40_000) })
    if (!response.ok) throw new Error(String(response.status))
    const body = await response.json()
    const rows = arcRows(body.evaluations ?? [])
    if (rows.length === 0) throw new Error("empty")
    if (cached && isDeepStrictEqual(cached.rows, rows)) {
      return { changed: false, fetchedAt: cached.fetchedAt, source: PAGE, rows }
    }
    const data = { fetchedAt: new Date().toISOString(), rows }
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(CACHE, JSON.stringify(data))
    return { changed: true, fetchedAt: data.fetchedAt, source: PAGE, rows }
  } catch (error) {
    if (cached) return { changed: false, fetchedAt: cached.fetchedAt, source: PAGE, rows: cached.rows }
    throw error
  }
}
