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

test("unverified Gemini prices render blank and sort last in both directions", () => {
  for (const key of ["input", "output"]) {
    for (const dir of [1, -1]) {
      const module = { exports: {} }
      runInNewContext(outputText, { module, exports: module.exports, require: (id) => {
        if (id === "react") return { useState: () => [{ key, dir }, () => {}] }
        if (id === "./bench") return { providerById: () => ({ color: "#3186ff" }) }
        return require(id)
      } })
      const markup = renderToStaticMarkup(React.createElement(module.exports.default, {
        t: (english) => english, aaRows: [],
      }))
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
