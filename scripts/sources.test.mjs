import assert from "node:assert/strict"
import test from "node:test"
import { arcRows } from "../server/arc.mjs"
import { arenaRows } from "../server/arena.mjs"
import { rowsFromHtml, versionFromHtml } from "../server/tbench.mjs"

const entry = (label, effort, metrics, agent = "Claude Code") =>
  JSON.stringify({
    id: "7b805dbb-e77a-4d0a-892e-165f922f786c",
    leaderboard_id: "9f966760-00f1-424e-90f5-c964fb6f6091",
    rank: 1,
    metadata: { agent_display: { url: "https://x.test", label: agent }, model_display: { url: "https://x.test", label }, reasoning_effort: effort },
    metrics,
  })

test("Terminal-Bench rows are per task, keep the agent, and skip uncosted or unsupported entries", () => {
  const page = `"title":"Terminal-Bench 4.0" ${[
    entry("Opus 5.5", "max", { accuracy: 64.85, n_trials: 330, total_cost_usd: 4718.65, total_tokens: 8034082467, accuracy_ci95_half_width: 3.11 }),
    entry("Opus 5.5", "max", { accuracy: 60, n_trials: 330, total_cost_usd: 1 }),
    entry("GLM-5.3-Flash", "none", { accuracy: 35.76, n_trials: 330, total_cost_usd: 118.8 }),
    entry("Muse Spark 1.3", "xhigh", { accuracy: 14.55, n_trials: 330, total_cost_usd: 0 }, "Muse Code"),
    entry("Qwen3.8-Max-0902", "max", { accuracy: 26.97, n_trials: 330, total_cost_usd: 4636.5 }),
  ].join(",")}`
  // The page embeds the rows as escaped JSON, which page() unescapes before parsing.
  const rows = rowsFromHtml(page)
  assert.equal(versionFromHtml(page), "4.0")
  assert.deepEqual(rows.map((row) => row.label), ["Opus 5.5 Max", "GLM-5.3-Flash None"])
  assert.equal(rows[0].cost.toFixed(2), "14.30")
  assert.equal(rows[0].agent, "Claude Code")
  assert.equal(rows[0].ci, 3.11)
  assert.equal(rows[1].effort, "None")
  assert.deepEqual(rows.map((row) => row.rank), [1, 2])
})

test("LMArena rows keep LMArena's name and rank and drop unsupported families", () => {
  const item = (model_name, rank) => ({ model_name, rank, rating: 1500, rating_lower: 1495, rating_upper: 1505, vote_count: 10, leaderboard_publish_date: "2026-10-22" })
  const rows = arenaRows("text", [item("Claude Opus 5.5 (High)", 2), item("Qwen3.8-Max", 15), item("Grok 4.20 (Reasoning, 0309)", 40)])
  assert.deepEqual(rows.map((row) => [row.name, row.provider, row.rank]), [["Opus 5.5 (High)", "claude", 2], ["Grok 4.20 (Reasoning, 0309)", "grok", 40]])
})

test("ARC-AGI-2 rows map efforts, keep recent supported releases, and skip uncosted ones", () => {
  const now = Date.parse("2026-10-29T00:00:00Z")
  const item = (modelDisplayName, modelReleaseDate, score, costPerTask, extra = {}) =>
    ({ datasetId: "v2_Semi_Private", modelDisplayName, modelReleaseDate, score, costPerTask, display: true, ...extra })
  const rows = arcRows([
    item("Claude Opus 5.5 (XHigh)", "2026-09-22T00:00:00.000Z", 0.925, 0.671),
    item("GPT-6 Astra (None)", "2026-09-02T00:00:00.000Z", 0.5, 0.37),
    item("Claude Opus 4.6 (High)", "2026-02-05T00:00:00.000Z", 0.7, 1),
    item("Grok 4.7 (Low)", "2026-09-21T00:00:00.000Z", 0.167, 0),
    item("Kimi K3 (Max)", "2026-09-01T00:00:00.000Z", 0.5, 1),
    item("GPT-6.1 Sol (Max)", "2026-09-29T00:00:00.000Z", 0.942, 0.25, { display: false }),
  ], now)
  assert.deepEqual(rows.map((row) => [row.label, row.effort, row.score]), [
    ["Opus 5.5 Extra High", "Extra High", 92.5],
    ["GPT-6 Astra None", "None", 50],
  ])
})
