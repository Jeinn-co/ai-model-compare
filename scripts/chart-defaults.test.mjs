import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { runInNewContext } from "node:vm"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const require = createRequire(import.meta.url)
const sources = Object.fromEntries(await Promise.all(["bench.ts", "guidance-data.ts", "Chart.tsx"].map(async (name) => {
  const source = await readFile(new URL(`../src/${name}`, import.meta.url), "utf8")
  return [name, ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
  } }).outputText]
})))
const catalog = JSON.parse(await readFile(new URL("../public/data/gemini-models.json", import.meta.url), "utf8"))
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

function harness() {
  const bench = { exports: {} }, data = { exports: {} }, chart = { exports: {} }
  runInNewContext(sources["bench.ts"], { exports: bench.exports, require: () => pkg })
  runInNewContext(sources["guidance-data.ts"], { exports: data.exports, require: () => ({ default: catalog }) })
  runInNewContext(sources["Chart.tsx"], { module: chart, exports: chart.exports, require: (id) => {
    if (id === "./bench") return bench.exports
    if (id === "./guidance-data") return data.exports
    if (id === "react") return { useEffect: () => {}, useState: (initial) => [initial(), () => {}] }
    return require(id)
  } })
  return { data: data.exports, render(rows, axis, active = null, language = "en") {
    return renderToStaticMarkup(React.createElement(chart.exports.default, {
      t: (en, zh) => language === "zh" ? zh : en, rows, previous: new Map(), unit: "",
      scoreName: "AA", scoreLabel: "Score", yAxis: axis, active, onHover: () => {}, onPick: () => {},
    }))
  } }
}

// Synthetic measurements exercise rendering; these are not published benchmark scores.
const row = (model, effort, provider) => ({ model, effort, provider, label: `${model} ${effort ?? ""}`,
  rank: 1, score: 50, cost: 2, speed: 60, verbosity: 1000, latency: 10, tokens: 100, steps: 5 })

test("API defaults use the table's model/effort records, not personal picks or guesses", () => {
  const { data } = harness()
  assert.equal(data.isApiDefaultEffort("Opus 5.5", "Medium"), true)
  assert.equal(data.isApiDefaultEffort("Opus 5.5", "High"), false)
  assert.equal(data.isApiDefaultEffort("Gemini 4 Hydrogen", "High"), true)
  assert.equal(data.isApiDefaultEffort("Gemini 4 Carbon", "Medium"), true)
  assert.equal(data.isApiDefaultEffort("Gemini 4 Argon", "High"), false)
  assert.equal(data.isApiDefaultEffort("GPT-6 Astra", "High"), false)
  assert.equal(data.isApiDefaultEffort("GPT-6 Astra", "Medium"), true)
  assert.equal(data.isApiDefaultEffort("Unknown model", "Medium"), false)
  assert.equal(data.isApiDefaultEffort("GPT-6.1 Sol", null), false)
  data.PRICES.find(row => row.model === "GPT-6.1 Sol").effort = "high"
  assert.equal(data.isApiDefaultEffort("GPT-6.1 Sol", "High"), true)
  assert.equal(data.isApiDefaultEffort("GPT-6.1 Sol", "Medium"), false)
})

test("regular choices remain limited to the confirmed My usage entries", () => {
  const { data } = harness()
  for (const model of ["Opus 5.5", "GPT-6.1 Sol", "Gemini 4 Hydrogen"]) {
    assert.equal(data.isDailyChoice(model, "High"), true)
    assert.equal(data.isDailyChoice(model, "Extra High"), false)
  }
})

test("regular, default and combined markers have distinct shapes on every axis in both languages", () => {
  const { data, render } = harness()
  data.DAILY_CHOICES.find(choice => choice.model === "GPT-6.1 Sol").effort = "medium"
  const rows = [row("Opus 5.5", "High", "claude"), row("Opus 5.5", "Medium", "claude"),
    row("GPT-6.1 Sol", "Medium", "codex"), row("GPT-6 Astra", "High", "codex")]
  for (const axis of ["score", "speed", "verbosity", "latency", "tokens", "steps"]) {
    for (const language of ["en", "zh"]) {
      const html = render(rows, axis, null, language)
      const points = [...html.matchAll(/<g([^>]*class="point-hit"[^>]*)>([\s\S]*?)<\/g>/g)]
      const point = label => points.find(p => p[1].includes(label + ":"))
      const regular = point("Opus 5.5 High"), defaults = point("Opus 5.5 Medium")
      const both = point("GPT-6.1 Sol Medium"), ordinary = point("GPT-6 Astra High")
      assert.match(regular[2], /class="point" r="7" fill="(?!#ffffff)/)
      assert.ok(!regular[2].includes("point-default"))
      assert.match(defaults[2], /class="point" r="5.5" fill="#ffffff"/)
      assert.ok(defaults[2].includes('stroke-width="1.5"'))
      assert.ok(!defaults[2].includes("point-default"))
      assert.match(both[2], /class="point-default" r="9" fill="none"/)
      assert.match(both[2], /class="point" r="7" fill="(?!#ffffff)/)
      assert.ok(both[1].includes(language === "zh" ? "API 預設 effort" : "API default effort"))
      assert.ok(both[1].includes(language === "zh" ? "我的固定常用" : "My regular choice"))
      assert.match(ordinary[2], /class="point" r="5.5" fill="(?!#ffffff)/)
    }
  }
})

test("hovering preserves hollow and combined shapes with only modest enlargement", () => {
  const { data, render } = harness()
  const defaults = row("Opus 5.5", "Medium", "claude")
  let html = render([defaults], "score", defaults.label)
  assert.match(html, /class="point" r="6.5" fill="#ffffff"/)
  data.DAILY_CHOICES.find(choice => choice.model === "Opus 5.5").effort = "medium"
  html = render([defaults], "score", defaults.label)
  assert.match(html, /class="point-default" r="10"/)
  assert.match(html, /class="point" r="8" fill="(?!#ffffff)/)
})
