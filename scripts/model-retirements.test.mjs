import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { runInNewContext } from "node:vm"
import test from "node:test"
import ts from "typescript"

const scope = { exports: {} }
const source = await readFile(new URL("../src/model-retirements.ts", import.meta.url), "utf8")
runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: scope.exports })
const { modelRetirement } = scope.exports
const on = "2026-11-17"

test("confirmed API retirements include their effective date and official notice", () => {
  for (const row of [
    { provider: "Anthropic", id: "claude opus 4" },
    { provider: "OpenAI", id: "o1" },
    { provider: "Google DeepMind", id: "gemini 3 pro" },
    { provider: "xAI", id: "grok 4" },
  ]) {
    const retirement = modelRetirement(row, on)
    assert.ok(retirement.retiredAt <= on)
    assert.match(retirement.source, /^https:\/\/(platform\.claude\.com|developers\.openai\.com|aistudio\.google\.com|docs\.x\.ai)\//)
  }
})

test("an announced future shutdown is not already retired", () => {
  const row = { provider: "Anthropic", id: "claude sonnet 4.5" }
  assert.equal(modelRetirement(row, on), null)
  assert.equal(modelRetirement(row, "2026-11-30").retiredAt, "2026-11-30")
  assert.equal(modelRetirement({ provider: "OpenAI", id: "gpt-5" }, on), null)
})

test("release dates, routing changes, missing ECI, and missing listings do not imply retirement", () => {
  for (const row of [
    { provider: "Anthropic", id: "claude opus 4.5" },
    { provider: "Google DeepMind", id: "gemini 3.7 flash" },
    { provider: "Google DeepMind", id: "gemini 4 hydrogen" },
    { provider: "Google DeepMind", id: "gemini 2.5 flash (jun 2025)" },
    { provider: "Meta", id: "llama 4 scout" },
    { provider: "Meta", id: "muse spark" },
    { provider: "Unknown", id: "grok 4" },
  ]) assert.equal(modelRetirement(row, on), null)
})
