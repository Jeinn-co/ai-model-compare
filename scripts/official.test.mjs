import assert from "node:assert/strict"
import test from "node:test"
import { claudeModels, codexModels, keepOfficial } from "../server/official.mjs"

test("Claude current models come from the API ID row, not the legacy list", () => {
  const page = "| Claude API ID | `claude-fable-5-1` | `claude-opus-5-5` | `claude-haiku-5-5` |\n" +
    "Legacy models (still available): [Claude Opus 5](x), `claude-opus-5`"
  assert.deepEqual([...claudeModels(page)], ["Fable 5.1", "Opus 5.5", "Haiku 5.5"])
})

test("Codex current models come from the model card slugs", () => {
  const page = '<Card slug="gpt-6-astra" />\n<Card slug="gpt-6.1-sol" />\nGPT-5.5 retires from Codex'
  assert.deepEqual([...codexModels(page)], ["GPT-6 Astra", "GPT-6.1 Sol"])
})

test("providers without an official list pass through", () => {
  const rows = [{ model: "Opus 5", provider: "claude" }, { model: "Grok 4.7", provider: "grok" }]
  assert.deepEqual(keepOfficial(rows, { claude: new Set(["Opus 5.5"]) }), [rows[1]])
})

test("LMArena rows are matched by their name without the bracket", () => {
  const rows = [{ name: "Opus 5.5 (High)", provider: "claude" }, { name: "Opus 5 (High)", provider: "claude" }]
  assert.deepEqual(keepOfficial(rows, { claude: new Set(["Opus 5.5"]) }), [rows[0]])
})
