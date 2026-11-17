import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { runInNewContext } from "node:vm"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const require = createRequire(import.meta.url)
const retirementScope = { exports: {} }
runInNewContext(ts.transpileModule(await readFile(new URL("../src/model-retirements.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: retirementScope.exports })
const source = await readFile(new URL("../src/TimelineChart.tsx", import.meta.url), "utf8")
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
} }).outputText
const scope = { exports: {} }
runInNewContext(output, { exports: scope.exports, require: (id) => {
  if (id.endsWith(".css")) return {}
  if (id === "./bench") return { niceCeil: (value) => Math.ceil(value), tickValues: (low, high) => [low, high] }
  if (id === "./model-retirements") return retirementScope.exports
  return require(id)
} })
const { default: TimelineChart, timelineValue, nearestTimelinePoint, timelineGuides } = scope.exports
const row = { id: "example", name: "Example model", provider: "Example", releasedAt: "2026-11-12",
  eci: 150, eciLow: 148, eciHigh: 152, inputPrice: 2, outputPrice: 10 }

test("the whole price line activates the block while the closest tick remains active", () => {
  const points = [
    { id: "first", metric: "cost", kind: "input", value: 2, x: 100, y: 120 },
    { id: "first", metric: "cost", kind: "mean", value: 6, x: 100, y: 70 },
    { id: "first", metric: "cost", kind: "output", value: 10, x: 100, y: 20 },
    { id: "second", metric: "score", kind: "eci", value: 150, x: 112, y: 75 },
  ]
  assert.equal(nearestTimelinePoint(points, 102, 22).kind, "output")
  assert.equal(nearestTimelinePoint(points, 102, 72).kind, "mean")
  assert.equal(nearestTimelinePoint(points, 100, 132).kind, "input")
  assert.equal(nearestTimelinePoint(points, 110, 75).id, "second")
  assert.equal(nearestTimelinePoint(points, 100, 45).id, "first")
  assert.equal(nearestTimelinePoint(points, 100, 96).kind, "input")
  assert.equal(nearestTimelinePoint(points, 108, 96).id, "first")
  assert.equal(nearestTimelinePoint(points, 100, 0), null)
  assert.equal(nearestTimelinePoint(points, 160, 50), null)
})

test("overlapping price lines select the closest tick when both segments are equally close", () => {
  const points = [
    { id: "first", metric: "cost", kind: "input", value: 2, x: 100, y: 120 },
    { id: "first", metric: "cost", kind: "output", value: 10, x: 100, y: 20 },
    { id: "second", metric: "cost", kind: "input", value: 3, x: 100, y: 100 },
    { id: "second", metric: "cost", kind: "output", value: 9, x: 100, y: 40 },
  ]
  assert.equal(nearestTimelinePoint(points, 100, 98).id, "second")
})

test("all three prices get guides, with only the closest point active", () => {
  const points = [
    { id: "first", metric: "cost", kind: "input", value: 2, x: 100, y: 120 },
    { id: "first", metric: "cost", kind: "mean", value: 6, x: 100, y: 70 },
    { id: "first", metric: "cost", kind: "output", value: 10, x: 100, y: 20 },
    { id: "other", metric: "cost", kind: "output", value: 20, x: 110, y: 10 },
  ]
  const guides = timelineGuides(points, points[1])
  assert.equal(guides.length, 3)
  assert.deepEqual(Array.from(guides.filter((guide) => guide.active), (guide) => guide.kind), ["mean"])
  assert.ok(guides.every((guide) => guide.id === "first"))
  const equal = points.slice(0, 3).map((point) => ({ ...point, value: 0, y: 120 }))
  assert.equal(timelineGuides(equal, equal[1]).length, 1)
  assert.equal(timelineGuides(equal, equal[1])[0].active, true)
})

test("cost uses the arithmetic mean and does not turn missing or invalid prices into zero", () => {
  assert.equal(timelineValue(row, "cost"), 6)
  assert.equal(timelineValue({ ...row, inputPrice: 0, outputPrice: 0 }, "cost"), 0)
  assert.equal(timelineValue({ ...row, inputPrice: null }, "cost"), null)
  assert.equal(timelineValue({ ...row, outputPrice: Number.NaN }, "cost"), null)
  assert.equal(timelineValue({ ...row, outputPrice: -1 }, "cost"), null)
  assert.equal(timelineValue({ ...row, eci: null }, "score"), null)
})

test("the mean tick is geometrically centered between the input and output ticks on a linear price axis", () => {
  const html = renderToStaticMarkup(React.createElement(TimelineChart, { rows: [row], metric: "cost", language: "en" }))
  const tickY = (price) => Number(html.match(new RegExp(`data-price="${price}"[^>]*y1="([\\d.]+)"`))[1])
  assert.ok(Math.abs(tickY("mean") - (tickY("input") + tickY("output")) / 2) < 0.00001)
  assert.match(html, /Input \$2; Mean \$6; Output \$10/)
})

test("invalid calendar dates and missing metrics are not plotted", () => {
  const html = renderToStaticMarkup(React.createElement(TimelineChart, {
    rows: [{ ...row, id: "date", releasedAt: "2026-02-30" }, { ...row, id: "price", inputPrice: null }],
    metric: "cost", language: "en",
  }))
  assert.match(html, /No models have data/)
  assert.ok(!html.includes('data-price="mean"'))
})

test("retired models keep accessible controls and data but render at half opacity", () => {
  const html = renderToStaticMarkup(React.createElement(TimelineChart, {
    rows: [{ ...row, id: "claude opus 4", name: "Claude Opus 4", provider: "Anthropic" }],
    metric: "cost", language: "en",
  }))
  assert.match(html, /role="button" tabindex="0"[^>]*opacity="0\.5"/)
  assert.match(html, /Official API retired 2026-06-15/)
  assert.match(html, /data-price="mean"/)
})

test("switching the metric preserves release-date positions when other models lack a score or price", () => {
  const rows = [
    { ...row, id: "cost-only", name: "Cost only", releasedAt: "2024-01-01", eci: null },
    { ...row, releasedAt: "2025-05-01" },
    { ...row, id: "score-only", name: "Score only", releasedAt: "2026-11-01", inputPrice: null },
  ]
  const chart = (metric) => renderToStaticMarkup(React.createElement(TimelineChart, { rows, metric, language: "en" }))
  const score = chart("score"), cost = chart("cost")
  const mark = (html) => html.match(/<g[^>]*aria-label="Example model;[^"]*"[^>]*>([\s\S]*?)<\/g>/)[1]
  const scoreX = Number(mark(score).match(/data-score="eci" cx="([\d.]+)"/)[1])
  const costX = Number(mark(cost).match(/<line x1="([\d.]+)"[^>]*class="timeline-price-line"/)[1])
  assert.equal(scoreX, costX)
  const dateLabels = (html) => [...html.matchAll(/<text[^>]*class="tick">([^<]*(?:2024|2025|2026)[^<]*)<\/text>/g)].map((match) => match[1])
  assert.deepEqual(dateLabels(score), dateLabels(cost))
})
