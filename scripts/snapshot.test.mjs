import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { promisify } from "node:util"
import { runSnapshot } from "./snapshot.mjs"

const row = { rank: 1, label: "Opus 5.5 High", model: "Opus 5.5", effort: "High", score: 80, cost: 1, provider: "claude" }
const old = { fetchedAt: "2026-10-10T00:00:00.000Z", source: "https://example.com", rows: [row] }
const fresh = { ...old, fetchedAt: "2026-10-11T00:00:00.000Z" }
const execFileAsync = promisify(execFile)

async function setup(t, previous = { aa: old, cursorbench: old }) {
  const dir = await mkdtemp(join(tmpdir(), "ai-model-compare-snapshot-"))
  t.after(() => rm(dir, { recursive: true, force: true }))
  for (const [id, value] of Object.entries(previous)) {
    await writeFile(join(dir, `${id}.json`), typeof value === "string" ? value : JSON.stringify(value, null, 2))
  }
  return { dir, out: pathToFileURL(`${dir}/`) }
}

test("both sources are checked, but timestamp-only changes leave both files untouched", async (t) => {
  const { dir, out } = await setup(t)
  const before = await readFile(join(dir, "aa.json"), "utf8")
  const checked = []
  const sources = Object.fromEntries(["aa", "cursorbench"].map((id) => [id, async () => {
    checked.push(id)
    return fresh
  }]))
  const result = await runSnapshot({ out, sources })
  assert.deepEqual(checked, ["aa", "cursorbench"])
  assert.equal(result.changed, false)
  assert.equal(result.failed, 0)
  for (const id of checked) assert.equal(await readFile(join(dir, `${id}.json`), "utf8"), before)
})

for (const id of ["aa", "cursorbench"]) {
  test(`a ${id} change alone requests deployment and preserves the other source`, async (t) => {
    const { dir, out } = await setup(t)
    const other = id === "aa" ? "cursorbench" : "aa"
    const before = await readFile(join(dir, `${other}.json`), "utf8")
    const next = { ...fresh, changed: false, rows: [{ ...row, score: 81 }] }
    const sources = { [id]: async () => next, [other]: async () => fresh }
    const result = await runSnapshot({ out, sources })
    assert.equal(result.changed, true)
    assert.equal(result.failed, 0)
    assert.equal(JSON.parse(await readFile(join(dir, `${id}.json`), "utf8")).rows[0].score, 81)
    assert.equal(await readFile(join(dir, `${other}.json`), "utf8"), before)
  })
}

test("a benchmark version change requests deployment even if rows are identical", async (t) => {
  const { dir, out } = await setup(t, { cursorbench: { ...old, version: "4.0" } })
  const result = await runSnapshot({ out, sources: { cursorbench: async () => ({ ...fresh, version: "5.0" }) } })
  assert.equal(result.changed, true)
  assert.equal(JSON.parse(await readFile(join(dir, "cursorbench.json"), "utf8")).version, "5.0")
})

test("JSON property order does not trigger deployment", async (t) => {
  const { out } = await setup(t)
  const reordered = { ...fresh, rows: [Object.fromEntries(Object.entries(row).reverse())] }
  const result = await runSnapshot({ out, sources: { aa: async () => reordered } })
  assert.equal(result.changed, false)
})

test("a failed source keeps its snapshot and the other source is still checked", async (t) => {
  const { dir, out } = await setup(t)
  const before = await readFile(join(dir, "aa.json"), "utf8")
  let checkedOther = false
  const result = await runSnapshot({ out, sources: {
    aa: async () => { throw new Error("upstream unavailable") },
    cursorbench: async () => { checkedOther = true; return fresh },
  } })
  assert.equal(checkedOther, true)
  assert.equal(result.changed, false)
  assert.equal(result.failed, 0)
  assert.equal(await readFile(join(dir, "aa.json"), "utf8"), before)
})

test("one failed source does not hide a change in the other source", async (t) => {
  const { out } = await setup(t)
  const result = await runSnapshot({ out, sources: {
    aa: async () => { throw new Error("upstream unavailable") },
    cursorbench: async () => ({ ...fresh, rows: [{ ...row, cost: 2 }] }),
  } })
  assert.equal(result.changed, true)
  assert.equal(result.failed, 0)
})

test("the first successful snapshot requests deployment", async (t) => {
  const { out } = await setup(t, {})
  const result = await runSnapshot({ out, sources: { aa: async () => fresh } })
  assert.equal(result.changed, true)
  assert.equal(result.failed, 0)
})

for (const previous of [undefined, "invalid JSON", { ...old, rows: [] }]) {
  test(`a failed fetch with ${previous === undefined ? "no" : "invalid"} previous snapshot fails the run`, async (t) => {
    const { out } = await setup(t, previous === undefined ? {} : { aa: previous })
    const result = await runSnapshot({ out, sources: { aa: async () => { throw new Error("upstream unavailable") } } })
    assert.equal(result.changed, false)
    assert.equal(result.failed, 1)
  })
}

test("empty fetched data is never published over a valid snapshot", async (t) => {
  const { dir, out } = await setup(t)
  const before = await readFile(join(dir, "aa.json"), "utf8")
  const result = await runSnapshot({ out, sources: { aa: async () => ({ ...fresh, rows: [] }) } })
  assert.equal(result.changed, false)
  assert.equal(result.failed, 0)
  assert.equal(await readFile(join(dir, "aa.json"), "utf8"), before)
})

for (const changed of [false, true]) {
  test(`CLI checks both sources and emits changed=${changed} to Actions without installed packages`, async (t) => {
    const { dir } = await setup(t, {})
    await mkdir(join(dir, "scripts"))
    await mkdir(join(dir, "server"))
    await mkdir(join(dir, "public", "data"), { recursive: true })
    await copyFile(new URL("./snapshot.mjs", import.meta.url), join(dir, "scripts", "snapshot.mjs"))
    for (const [id, exported] of [["aa", "loadAa"], ["cursorbench", "loadBench"]]) {
      const next = changed && id === "cursorbench" ? { ...fresh, rows: [{ ...row, score: 81 }] } : fresh
      await writeFile(join(dir, "public", "data", `${id}.json`), JSON.stringify(old))
      await writeFile(join(dir, "server", id === "aa" ? "aa.mjs" : "bench.mjs"),
        `export async function ${exported}() { return ${JSON.stringify(next)} }`)
    }
    const output = join(dir, "output")
    const summary = join(dir, "summary")
    const { stdout } = await execFileAsync(process.execPath, [join(dir, "scripts", "snapshot.mjs")], {
      cwd: dir,
      env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    })
    assert.equal(await readFile(output, "utf8"), `changed=${changed}\n`)
    assert.match(stdout, /Checking sources at/)
    const report = await readFile(summary, "utf8")
    assert.match(report, /\| aa \| unchanged \|/)
    assert.ok(report.includes(`| cursorbench | ${changed ? "updated" : "unchanged"} |`))
    assert.ok(report.includes(`Chart data changed: **${changed}**`))
  })
}
