import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { objects, page } from "./aa.mjs"
import { providerOf, shownModels } from "./bench.mjs"

const PAGE = "https://www.tbench.ai/leaderboard"
const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "tbench-cache.json")
// The leaderboard's own effort names, in the chart's wording. "none" is a run with
// reasoning off; it stays an effort so the chart orders it before Minimal.
const EFFORTS = { none: "None", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max" }

// The benchmark version from the leaderboard title ("Terminal-Bench 4.0"), or null.
export function versionFromHtml(text) {
  const match = text.match(/"title":"Terminal-Bench (\d+(?:\.\d+)*)"/) ?? text.match(/Terminal-Bench (\d+(?:\.\d+)*)/)
  return match ? match[1] : null
}

// One row per leaderboard entry, from the rows embedded in the page. Cost and tokens are
// whole-run totals, so they are divided by the trial count (every task, five trials each).
// An entry without a cost (Muse Spark 1.3 lists $0) cannot be placed on the cost axis and
// is left out rather than given a guessed cost.
export function rowsFromHtml(text) {
  const rows = new Map()
  for (const entry of objects(text, '\\{"id":"[0-9a-f-]+","leaderboard_id":"')) {
    const model = entry.metadata?.model_display?.label
    const raw = entry.metadata?.reasoning_effort
    const { accuracy, n_trials: trials, total_cost_usd: total, total_tokens: tokens } = entry.metrics ?? {}
    const provider = model ? providerOf(model) : null
    if (!provider || !Number.isFinite(accuracy) || !(trials > 0) || !(total > 0)) continue
    const effort = raw in EFFORTS ? EFFORTS[raw] : (raw ?? null)
    const label = effort ? `${model} ${effort}` : model
    // The page repeats some entries; the first one (higher rank) wins.
    if (rows.has(label)) continue
    const ci = entry.metrics.accuracy_ci95_half_width
    const agent = entry.metadata.agent_display?.label
    rows.set(label, {
      rank: 0,
      label,
      model,
      effort,
      score: accuracy,
      cost: total / trials,
      provider,
      ...(tokens > 0 ? { tokens: tokens / trials } : {}),
      ...(ci > 0 ? { ci } : {}),
      ...(agent ? { agent } : {}),
    })
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

export async function loadTbench() {
  const cached = await readCache()
  try {
    const text = await page(PAGE)
    const rows = rowsFromHtml(text)
    if (rows.length === 0) throw new Error("empty")
    const version = versionFromHtml(text)
    if (cached && isDeepStrictEqual(cached.rows, rows) && cached.version === version) {
      return { changed: false, fetchedAt: cached.fetchedAt, source: PAGE, version, rows }
    }
    const data = { fetchedAt: new Date().toISOString(), version, rows }
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(CACHE, JSON.stringify(data))
    return { changed: true, fetchedAt: data.fetchedAt, source: PAGE, version, rows }
  } catch (error) {
    if (cached) return { changed: false, fetchedAt: cached.fetchedAt, source: PAGE, version: cached.version ?? null, rows: cached.rows }
    throw error
  }
}
