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
  assert.equal(data.isApiDefaultEffort("Unknown model", "Medium"), false)
  assert.equal(data.isApiDefaultEffort("GPT-6.1 Sol", null), false)
  data.PRICES.find(row => row.model === "GPT-6.1 Sol").effort = "high"
  assert.equal(data.isApiDefaultEffort("GPT-6.1 Sol", "High"), true)
  assert.equal(data.isApiDefaultEffort("GPT-6.1 Sol", "Medium"), false)
})

test("only default efforts get an outer ring on every axis, including when another point is selected", () => {
  const { render } = harness()
  const rows = [row("Opus 5.5", "Medium", "claude"), row("Opus 5.5", "High", "claude"),
    row("Gemini 4 Hydrogen", "High", "gemini"), row("Gemini 4 Hydrogen", "Low", "gemini"),
    row("GPT-6.1 Sol", "Medium", "codex"), row("GPT-6 Astra", "High", "codex")]
  for (const axis of ["score", "speed", "verbosity", "latency", "tokens", "steps"]) {
    for (const language of ["en", "zh"]) {
      const html = render(rows, axis, "Opus 5.5 High", language)
      const points = [...html.matchAll(/<g([^>]*class="point-hit"[^>]*)>([\s\S]*?)<\/g>/g)]
      assert.equal(points.length, rows.length)
      assert.equal(points.filter(point => point[2].includes('class="point-default"')).length, 3)
      const opusHigh = points.find(point => point[1].includes("Opus 5.5 High:"))
      assert.ok(opusHigh[1].includes('aria-pressed="true"'))
      assert.ok(!opusHigh[2].includes('class="point-default"'))
      const hydrogen = points.find(point => point[1].includes("Gemini 4 Hydrogen High:"))
      assert.ok(hydrogen[1].includes(language === "zh" ? "API 預設 effort" : "API default effort"))
      assert.match(hydrogen[2], /class="point-default" r="7.5" fill="none"/)
      assert.ok(hydrogen[2].includes('aria-hidden="true"'))
    }
  }
})

test("a selected default point retains a separate outer ring beyond its larger center", () => {
  const { render } = harness()
  const html = render([row("Gemini 4 Hydrogen", "High", "gemini")], "score", "Gemini 4 Hydrogen High")
  assert.match(html, /class="point-default" r="9.5"/)
  assert.match(html, /class="point" r="7.5"/)
})

test("regular choices are larger than other points and xhigh remains unmarked", () => {
  const { data, render } = harness()
  for (const model of ["Opus 5.5", "GPT-6.1 Sol"]) {
    assert.equal(data.isDailyChoice(model, "High"), true)
    assert.equal(data.isDailyChoice(model, "Extra High"), false)
  }
  assert.equal(data.isDailyChoice("Gemini 4 Carbon", "High"), false)
  assert.equal(data.isDailyChoice("Gemini 4 Hydrogen", "High"), false)
  const html = render([row("Opus 5.5", "High", "claude"), row("Opus 5.5", "Medium", "claude"),
    row("Gemini 4 Hydrogen", "Extra High", "gemini")], "score")
  const points = [...html.matchAll(/<g([^>]*class="point-hit"[^>]*)>([\s\S]*?)<\/g>/g)]
  const regular = points.find(point => point[1].includes("Opus 5.5 High:"))
  const apiDefault = points.find(point => point[1].includes("Opus 5.5 Medium:"))
  const xhigh = points.find(point => point[1].includes("Gemini 4 Hydrogen Extra High:"))
  assert.match(regular[2], /class="point" r="7"/)
  assert.ok(regular[1].includes("My regular choice"))
  assert.match(apiDefault[2], /class="point" r="5.5"/)
  assert.match(apiDefault[2], /class="point-default" r="7.5"/)
  assert.match(xhigh[2], /class="point" r="5.5"/)
})

test("a regular choice that matches the API default keeps both its larger dot and outer ring", () => {
  const { data, render } = harness()
  // Simulate choosing the model's API-default medium as the regular effort.
  data.DAILY_CHOICES.find(choice => choice.model === "Opus 5.5").effort = "medium"
  const selected = row("Opus 5.5", "Medium", "claude")
  for (const axis of ["score", "speed", "verbosity", "latency", "tokens", "steps"]) {
    for (const active of [null, selected.label]) {
      const html = render([selected], axis, active)
      assert.ok(html.includes("API default effort") && html.includes("My regular choice"))
      assert.match(html, active ? /class="point" r="9"/ : /class="point" r="7"/)
      assert.match(html, active ? /class="point-default" r="11"/ : /class="point-default" r="9"/)
    }
  }
})
