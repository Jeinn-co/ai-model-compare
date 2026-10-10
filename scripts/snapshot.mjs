// Writes the chart data for the static site: public/data/<source>.json, one per source.
// The GitHub Pages workflow checks both sources every six hours. Unchanged chart data
// leaves the published snapshot (including its update time) untouched. A failed source
// keeps its last valid snapshot; without one, the run fails.
import { appendFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { loadAa } from "../server/aa.mjs"
import { loadBench } from "../server/bench.mjs"

const OUT = new URL("../public/data/", import.meta.url)
const SOURCES = { aa: loadAa, cursorbench: loadBench }

async function readSnapshot(file) {
  try {
    const snapshot = JSON.parse(await readFile(file, "utf8"))
    return snapshot?.fetchedAt && snapshot.source && Array.isArray(snapshot.rows) && snapshot.rows.length
      ? snapshot : null
  } catch {
    return null
  }
}

// A newer fetch time alone does not change the chart. Object property order also
// does not matter, but every row value and the benchmark version do.
function chartData({ source, version = null, rows }) {
  return { source, version, rows }
}

export async function runSnapshot({ out = OUT, sources = SOURCES } = {}) {
  await mkdir(out, { recursive: true })
  let failed = 0
  let changed = false
  const checkedAt = new Date().toISOString()
  const results = []
  console.log(`Checking sources at ${checkedAt}`)
  for (const [id, load] of Object.entries(sources)) {
    const file = new URL(`${id}.json`, out)
    const previous = await readSnapshot(file)
    try {
      const { fetchedAt, source, version, rows } = await load()
      if (!fetchedAt || !source || !Array.isArray(rows) || !rows.length) throw new Error("invalid or empty snapshot")
      const next = { fetchedAt, source, ...(version ? { version } : {}), rows }
      if (previous && isDeepStrictEqual(chartData(previous), chartData(next))) {
        results.push({ id, status: "unchanged", updatedAt: previous.fetchedAt })
        console.log(`${id}: unchanged; last updated ${previous.fetchedAt}`)
        continue
      }
      await writeFile(file, JSON.stringify(next))
      changed = true
      results.push({ id, status: "updated", updatedAt: fetchedAt })
      console.log(`${id}: ${rows.length} rows, fetched ${fetchedAt}${version ? `, version ${version}` : ""}`)
    } catch (error) {
      if (previous) {
        results.push({ id, status: "fetch failed; keeping previous data", updatedAt: previous.fetchedAt })
        console.warn(`${id}: ${error.message}; keeping the previous snapshot`)
      } else {
        results.push({ id, status: "fetch failed; no valid previous data", updatedAt: null })
        console.error(`${id}: ${error.message}; no previous snapshot to keep`)
        failed++
      }
    }
  }
  return { changed, failed, checkedAt, results }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === await realpath(resolve(process.argv[1]))) {
  const { changed, failed, checkedAt, results } = await runSnapshot()
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = results.map(({ id, status, updatedAt }) => `| ${id} | ${status} | ${updatedAt ?? "—"} |`).join("\n")
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `## Source check\n\nChecked at ${checkedAt} (UTC).\n\n| Source | Result | Last data update (UTC) |\n| --- | --- | --- |\n${rows}\n\nChart data changed: **${changed}**.\n`)
  }
  process.exitCode = failed ? 1 : 0
}
