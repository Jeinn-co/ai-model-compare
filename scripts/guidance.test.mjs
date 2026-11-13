import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import test from "node:test"
import { runInNewContext } from "node:vm"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const require = createRequire(import.meta.url)
const source = await readFile(new URL("../src/Guidance.tsx", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
})

const dataSource = await readFile(new URL("../src/guidance-data.ts", import.meta.url), "utf8")
const catalog = JSON.parse(await readFile(new URL("../public/data/gemini-models.json", import.meta.url), "utf8"))
const dataCode = ts.transpileModule(dataSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

function renderGuidance({ sort = null, models = catalog, aaRows = [], language = "en" } = {}) {
  const data = { exports: {} }
  runInNewContext(dataCode, { exports: data.exports, require: (id) =>
    id.endsWith("gemini-models.json") ? { default: models } : require(id) })
  const module = { exports: {} }
  runInNewContext(outputText, { module, exports: module.exports, require: (id) => {
    if (id === "react") return { useState: () => [sort, () => {}] }
    if (id === "./bench") return { providerById: () => ({ color: "#3186ff" }) }
    if (id === "./guidance-data") return data.exports
    return require(id)
  } })
  return renderToStaticMarkup(React.createElement(module.exports.default, {
    t: (english, chinese) => language === "zh" ? chinese : english, aaRows,
  }))
}

test("unverified Gemini prices render blank and sort last in both directions", () => {
  const models = structuredClone(catalog)
  for (const model of models.models.slice(1)) {
    delete model.pricePerMillionTokens
    delete model.introductoryPricePerMillionTokens
  }
  for (const key of ["input", "output"]) {
    for (const dir of [1, -1]) {
      const markup = renderGuidance({ sort: { key, dir }, models })
      const body = [...markup.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].at(-1)[1]
      const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1])
      assert.equal(rows.length, 12)
      const missing = rows.slice(-3)
      for (const [i, model] of ["Gemini 4 Carbon", "Gemini 4 Argon", "Gemini 3.8 Flash"].entries()) {
        assert.ok(missing[i].includes(model))
        assert.ok(missing[i].includes('<td class="num">—</td>'))
      }
      const hydrogen = rows.find((row) => row.includes("Gemini 4 Hydrogen"))
      assert.ok(hydrogen.includes("$1.50") && hydrogen.includes("$7.50"))
    }
  }
})

test("a catalog-only model addition reaches both existing tables and uses source scores", () => {
  // Synthetic data proves that adding a model needs no presentation change.
  const models = structuredClone(catalog)
  models.models.push({ id: "gemini-fixture", model: "Gemini Fixture", efforts: ["high"],
    defaultEffort: "high", useCases: ["Fixture task", "測試任務"] })
  const aaRows = [{ model: "Gemini Fixture", effort: "High", score: 42, cost: 1, provider: "gemini" }]
  const markup = renderGuidance({ models, aaRows })
  const bodies = [...markup.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)]
  assert.ok(bodies[0][1].includes("Gemini Fixture"))
  assert.ok(bodies.at(-1)[1].includes("Gemini Fixture"))
  assert.ok(bodies.at(-1)[1].includes("42.0"))
  const gemini = [...bodies[0][1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].at(-1)[1]
  const fixtureGuidance = [...gemini.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/g)]
    .find((match) => match[2].includes("Gemini Fixture"))
  assert.ok(fixtureGuidance && !fixtureGuidance[1].includes("guidance-pick"))
  const missing = renderGuidance({ models })
  const fixtureRow = [...missing.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((m) => m[1]).findLast((row) => row.includes("Gemini Fixture"))
  assert.ok(fixtureRow.includes('<td class="num">—</td>'))
})

test("Gemini guidance shows regular rates and keeps introductory offers in the price table", () => {
  for (const language of ["en", "zh"]) {
    const markup = renderGuidance({ language })
    const bodies = [...markup.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)]
    const body = bodies[0][1]
    const priceTable = bodies.at(-1)[1]
    const gemini = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].at(-1)[1]
    const rows = [...gemini.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(match => match[1])
    for (const model of ["Gemini 4 Hydrogen", "Gemini 4 Carbon", "Gemini 4 Argon", "Gemini 3.8 Flash"]) {
      const row = rows.find(row => row.includes(model + (language === "zh" ? "：" : ":")))
      assert.ok(row && row.includes("guidance-money"), model)
      assert.ok(!row.includes("introductory") && !row.includes("推廣期"))
      const priceRow = [...priceTable.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => match[1]).find(row => row.includes(model))
      if (model.includes("Carbon") || model.includes("Argon")) {
        for (const value of ["$4.00", "$20.00"]) assert.ok(row.includes(value))
        for (const value of ["$2.00", "$10.00", "2026-11-30"]) assert.ok(priceRow.includes(value))
      } else if (model.includes("Flash")) {
        for (const value of ["$1.50", "$7.50"]) assert.ok(row.includes(value))
        for (const value of ["$0.75", "$3.75", "2026-12-31"]) assert.ok(priceRow.includes(value))
      } else {
        for (const value of ["$1.50", "$7.50"]) assert.ok(row.includes(value))
      }
    }
  }
})
