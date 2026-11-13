import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { GEMINI_MODELS, modelName, hydrogenCostPerTask } from "../server/gemini.mjs"
import { releaseRows } from "../server/aa.mjs"
import { rowsFromHtml as cursorRows } from "../server/bench.mjs"
import { arcRows } from "../server/arc.mjs"
import { arenaRows } from "../server/arena.mjs"
import { rowsFromHtml as terminalRows } from "../server/tbench.mjs"
import { runSnapshot } from "./snapshot.mjs"

test("Hydrogen catalog and rate math include thinking and cached input without inventing usage", () => {
  const model = GEMINI_MODELS.find((m) => m.id === "gemini-4-hydrogen")
  assert.deepEqual(model.efforts, ["low", "medium", "high", "xhigh"])
  assert.equal(model.defaultEffort, "high")
  assert.equal(hydrogenCostPerTask({ input: 1e6, output: 1e6 }), 9)
  assert.equal(hydrogenCostPerTask({ input: 1e6, cachedInput: 1e6, output: 1e6 }), 7.575)
  assert.equal(hydrogenCostPerTask({ input: 2e6, output: 2e6, tasks: 2 }), 9)
  assert.equal(hydrogenCostPerTask({ input: 1e6 }), null)
  assert.equal(hydrogenCostPerTask({ input: 1, cachedInput: 2, output: 1 }), null)
  assert.equal(hydrogenCostPerTask({ input: 1, output: 1, tasks: 0 }), null)
})

test("all loaders recognize Hydrogen names; AA keeps efforts separate and rejects unknown prices", () => {
  for (const alias of ["Gemini 4 Hydrogen", "gemini-4-hydrogen", "Google Gemini 4 Hydrogen", "gemini-4-hydrogen-preview"]) {
    assert.equal(modelName(alias), "Gemini 4 Hydrogen")
  }
  const release = { slug: "gemini-4-hydrogen", model: "Gemini 4 Hydrogen" }
  // Synthetic parser fixtures only: these numbers are not published evaluations.
  const variant = { id: "7b805dbb-e77a-4d0a-892e-165f922f786c", release,
    intelligenceIndex: 1, intelligenceIndexCostPerTask: { cost: { total: 9 } },
    price1mInputTokens: 1.5, price1mOutputTokens: 7.5, cacheHitPrice: 0.075 }
  const page = [20, 30, 40, 50].map((level) => JSON.stringify({ id: variant.id, slug: `hydrogen-${level}`, ...variant, effort: { level } })).join("")
  const rows = releaseRows(page, release)
  assert.deepEqual(rows.map((r) => r.effort), ["Low", "Medium", "High", "Extra High"])
  assert.ok(rows.every((r) => r.provider === "gemini" && r.cost === 9))
  assert.deepEqual(releaseRows(JSON.stringify({ id: variant.id, slug: "missing", ...variant, effort: { level: 40 }, intelligenceIndex: null }), release), [])
  assert.deepEqual(releaseRows(JSON.stringify({ id: variant.id, slug: "wrong-price", ...variant, effort: { level: 40 }, price1mInputTokens: null }), release), [])
  const table = "<table><tr><th>Model</th></tr><tr><td>1</td><td>gemini-4-hydrogen-xhigh</td><td>1</td><td>x</td><td>x</td><td>9</td><td>2</td><td>3</td></tr></table>"
  assert.equal(cursorRows(table)[0].label, "Gemini 4 Hydrogen Extra High")
  assert.equal(arcRows([{ datasetId: "v2_Semi_Private", modelDisplayName: "gemini-4-hydrogen (XHigh)",
    modelReleaseDate: "2026-11-12", score: 0.01, costPerTask: 9 }], Date.parse("2026-11-13"))[0].label,
  "Gemini 4 Hydrogen Extra High")
  assert.equal(arenaRows("text", [{ model_name: "gemini-4-hydrogen", rating: 1 }])[0].provider, "gemini")
  const terminal = { id: variant.id, leaderboard_id: variant.id, metadata: { model_display: { label: "gemini-4-hydrogen" },
    reasoning_effort: "xhigh" }, metrics: { accuracy: 1, n_trials: 2, total_cost_usd: 18 } }
  assert.equal(terminalRows(JSON.stringify(terminal))[0].label, "Gemini 4 Hydrogen Extra High")
})

test("snapshots publish the model catalog without fabricated rows, and dry runs preserve files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hydrogen-snapshot-"))
  const out = pathToFileURL(`${dir}/`)
  const payload = { fetchedAt: "2026-11-13T00:00:00Z", source: "fixture", models: GEMINI_MODELS,
    rows: [{ model: "fixture", score: 1, cost: 1 }] }
  const options = { out, sources: { aa: async () => payload }, official: async () => ({}) }
  await runSnapshot(options)
  const written = JSON.parse(await readFile(join(dir, "aa.json"), "utf8"))
  assert.ok(written.models.some((m) => m.id === "gemini-4-hydrogen"))
  assert.ok(!written.rows.some((r) => r.model === "Gemini 4 Hydrogen"))
  await writeFile(join(dir, "aa.json"), JSON.stringify(written))
  const before = await readFile(join(dir, "aa.json"), "utf8")
  await runSnapshot({ ...options, dryRun: true, sources: { aa: async () => ({ ...payload, rows: [{ score: 2 }] }) } })
  assert.equal(await readFile(join(dir, "aa.json"), "utf8"), before)
})
