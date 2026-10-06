// Writes the chart data for the static site: public/data/<source>.json, one per source.
// The GitHub Pages workflow runs it every six hours. A source that fails keeps the file
// already there (the workflow first downloads the live copy), so a blocked fetch never
// blanks the site; with no earlier file to fall back on, the run fails.
import { access, mkdir, writeFile } from "node:fs/promises"
import { loadAa } from "../server/aa.mjs"
import { loadBench } from "../server/bench.mjs"

const OUT = new URL("../public/data/", import.meta.url)
const SOURCES = { aa: loadAa, cursorbench: loadBench }

await mkdir(OUT, { recursive: true })
let failed = 0
for (const [id, load] of Object.entries(SOURCES)) {
  const file = new URL(`${id}.json`, OUT)
  try {
    const { fetchedAt, source, rows } = await load()
    if (!rows?.length) throw new Error("no rows")
    await writeFile(file, JSON.stringify({ fetchedAt, source, rows }))
    console.log(`${id}: ${rows.length} rows, fetched ${fetchedAt}`)
  } catch (error) {
    try {
      await access(file)
      console.warn(`${id}: ${error.message}; keeping the previous snapshot`)
    } catch {
      console.error(`${id}: ${error.message}; no previous snapshot to keep`)
      failed++
    }
  }
}
process.exit(failed ? 1 : 0)
