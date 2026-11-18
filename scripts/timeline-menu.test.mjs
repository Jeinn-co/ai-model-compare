import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { runInNewContext } from "node:vm"
import test from "node:test"
import ts from "typescript"

const require = createRequire(new URL("../src/bench.ts", import.meta.url))
const bench = { exports: {} }
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
runInNewContext(compile(await readFile(new URL("../src/bench.ts", import.meta.url), "utf8")), {
  exports: bench.exports, require,
})
const source = await readFile(new URL("../src/Timeline.tsx", import.meta.url), "utf8")
const ast = ts.createSourceFile("Timeline.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const grouping = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "groupsOf")
const scope = { modelLine: bench.exports.modelLine, modelLineRank: bench.exports.modelLineRank }
runInNewContext(compile(grouping.getText(ast)), scope)
const snapshot = JSON.parse(await readFile(new URL("../public/data/timeline.json", import.meta.url), "utf8"))

test("new visitors select exactly the five requested models, including unscored Hydrogen", async () => {
  const defaults = { exports: {} }
  runInNewContext(compile(await readFile(new URL("../src/timeline-data.ts", import.meta.url), "utf8")), { exports: defaults.exports })
  const ids = Array.from(defaults.exports.DEFAULT_TIMELINE_MODELS)
  assert.deepEqual(ids, ["claude opus 5.5", "gpt-6.1 sol", "gemini 4 hydrogen", "grok 4.6", "muse wonder"])
  const selected = snapshot.rows.filter((row) => ids.includes(row.id))
  assert.equal(selected.length, 5)
  assert.ok(selected.every((row) => row.inputPrice !== null && row.outputPrice !== null))
  assert.equal(selected.find((row) => row.id === "gemini 4 hydrogen").eci, null)
  assert.match(source, /Array\.isArray\(saved\.hiddenModels\) \? strings\(saved\.hiddenModels\) : null/)
})

test("creator chips and the chart key follow the main page's provider order", () => {
  const creators = ["Meta", "xAI", "OpenAI", "Google DeepMind", "Anthropic"]
  assert.deepEqual(creators.sort(bench.exports.compareCreators), ["Anthropic", "OpenAI", "Google DeepMind", "xAI", "Meta"])
})

test("every creator keeps its known series in tier order, including unscored new models", () => {
  const expected = {
    Anthropic: ["Claude Fable", "Claude Opus", "Claude Sonnet", "Claude Haiku"],
    "Google DeepMind": ["Gemini Carbon", "Gemini Argon", "Gemini Hydrogen", "Gemini Flash", "Gemini Flash-Lite"],
    Meta: ["Muse Wonder", "Muse Spark", "Muse Spark Open", "Muse Ember"],
    OpenAI: ["Astra", "Sol", "Terra", "Luna"],
    xAI: ["Grok"],
  }
  for (const [provider, lines] of Object.entries(expected)) {
    const groups = scope.groupsOf(snapshot.rows.filter((row) => row.provider === provider))
    assert.deepEqual(Array.from(groups.slice(0, lines.length), (group) => group.line), lines)
  }
})

test("models within a series run newest first, even before the newest is scored", () => {
  const row = { provider: "Google DeepMind", releasedAt: "2026-11-12", eci: null }
  const groups = scope.groupsOf([
    { ...row, name: "Gemini 3.7 Flash", releasedAt: "2026-06-01", eci: 158 },
    { ...row, name: "Gemini 4 Hydrogen" },
    { ...row, name: "Gemini 3.9 Flash" },
    { ...row, name: "Gemini 3.8 Flash", releasedAt: "2026-09-01", eci: 159 },
  ])
  assert.equal(groups[0].line, "Gemini Hydrogen")
  assert.equal(groups[0].items[0].eci, null)
  assert.deepEqual(Array.from(groups[1].items, (item) => item.name), ["Gemini 3.9 Flash", "Gemini 3.8 Flash", "Gemini 3.7 Flash"])
})

test("GPT-6.2 Sol, released after GPT-6.1 Sol, heads the Sol series", () => {
  const groups = scope.groupsOf([
    { provider: "OpenAI", name: "GPT-6.1 Sol", releasedAt: "2026-09-29", eci: 160 },
    { provider: "OpenAI", name: "GPT-6 Sol", releasedAt: "2026-09-22", eci: 155 },
    { provider: "OpenAI", name: "GPT-6.2 Sol", releasedAt: "2026-11-17", eci: null },
  ])
  assert.deepEqual(Array.from(groups[0].items, (item) => item.name), ["GPT-6.2 Sol", "GPT-6.1 Sol", "GPT-6 Sol"])
})

test("missing models are listed visibly and marked in the model menu", () => {
  assert.match(source, /<section className="timeline-missing"/)
  assert.match(source, /missing\.map\(\(row\)/)
  assert.match(source, /timeline-menu-missing/)
  assert.doesNotMatch(source, /<details className="timeline-missing"/)
})

test("Mini and Nano case variants stay in one series each", () => {
  const row = { provider: "OpenAI", releasedAt: "2026-07-01", eci: 140 }
  const groups = scope.groupsOf(["GPT-5 mini", "GPT-5.4 Mini", "GPT-5 nano", "GPT-5.4 Nano"]
    .map((name) => ({ ...row, name })))
  assert.equal(groups.length, 2)
  assert.ok(groups.every((group) => group.items.length === 2))
})
