import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = await readFile(new URL("../src/language.ts", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })

test("language prefers saved choice and falls back safely when storage is blocked", () => {
  const scope = {
    exports: {},
    navigator: { language: "zh-TW" },
    localStorage: { getItem: () => "en" },
  }
  runInNewContext(outputText, scope)
  const { initialLanguage } = scope.exports
  assert.equal(initialLanguage(), "en")
  scope.localStorage.getItem = () => "invalid"
  assert.equal(initialLanguage(), "zh")
  scope.localStorage.getItem = () => { throw new Error("blocked") }
  assert.equal(initialLanguage(), "zh")
  scope.navigator.language = "en-US"
  assert.equal(initialLanguage(), "en")
})
