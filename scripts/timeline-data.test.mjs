import assert from "node:assert/strict"
import test from "node:test"
import { csvRows, releasePrices, timelineRows } from "../server/timeline.mjs"

test("Epoch CSV retains quoted names, commas, line breaks and empty values", () => {
  assert.deepEqual(csvRows('\uFEFFModel,Organization,eci\r\n"A ""quoted"", model","Lab\nResearch",\r\n'),
    [{ Model: 'A "quoted", model', Organization: "Lab\nResearch", eci: "" }])
})

test("prices belong to the exact release; conflicting tariffs are left missing", () => {
  const row = { release: { slug: "gemini-current" }, price1mInputTokens: 2, price1mOutputTokens: 10 }
  assert.deepEqual(releasePrices([row], "gemini-current"), { inputPrice: 2, outputPrice: 10 })
  assert.equal(releasePrices([row], "gemini-old"), null)
  assert.equal(releasePrices([row, { ...row, price1mInputTokens: 4 }], "gemini-current"), null)
  assert.deepEqual(releasePrices([{ ...row, price1mInputTokens: 0, price1mOutputTokens: 0 }], "gemini-current"),
    { inputPrice: 0, outputPrice: 0 })
})

test("unscored new models stay unscored and dated versions never borrow another version's price", () => {
  const scores = [{ Model: "Gemini Test (May)", "Display name": "Gemini Test (May)", Organization: "Google DeepMind",
    date: "2026-05-01", eci: "150", eci_ci_low: "148", eci_ci_high: "152" }]
  const releases = [{ name: "Gemini Test", releaseDate: "2026-06-01", creator: { name: "Google" } }]
  const prices = new Map([["gemini test", { inputPrice: 2, outputPrice: 10 }]])
  const rows = timelineRows(scores, releases, prices, Date.parse("2026-11-17"))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].eci, 150)
  assert.equal(rows[0].inputPrice, null)
  assert.equal(rows[1].eci, null)
  assert.equal(rows[1].inputPrice, 2)
})
