import assert from "node:assert/strict"
import test from "node:test"
import { languageScope } from "./language-fixture.mjs"

test("language prefers saved choice and falls back safely when storage is blocked", () => {
  const scope = languageScope({
    navigator: { language: "zh-TW" },
    localStorage: { getItem: () => "en" },
  })
  const { initialLanguage } = scope.exports
  assert.equal(initialLanguage(), "en")
  scope.localStorage.getItem = () => "invalid"
  assert.equal(initialLanguage(), "zh")
  scope.localStorage.getItem = () => { throw new Error("blocked") }
  assert.equal(initialLanguage(), "zh")
  scope.navigator.language = "en-US"
  assert.equal(initialLanguage(), "en")
})

test("independent translators keep each language and interpolate runtime values", () => {
  const { createTranslator } = languageScope().exports
  const english = createTranslator("en"), chinese = createTranslator("zh")
  assert.equal(english("choose_provider_models", { provider: "Fixture" }), "Choose Fixture models")
  assert.equal(chinese("choose_provider_models", { provider: "Fixture" }), "選擇 Fixture 模型")
  assert.equal(english("model"), "Model")
  assert.equal(chinese.language, "zh")
})
