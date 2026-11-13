import assert from "node:assert/strict"
import test from "node:test"
import { releaseRows } from "../server/aa.mjs"

const release = { slug: "gpt-6-1-sol", model: "GPT-6.1 Sol" }
const variant = {
  id: "7b805dbb-e77a-4d0a-892e-165f922f786c",
  slug: "gpt-6-1-sol-high",
  release,
  effort: { level: 40 },
  intelligenceIndex: 50,
  intelligenceIndexCostPerTask: { cost: { total: 0.6 } },
}

test("AA reads current speed and numeric answer latency without borrowing from other variants", () => {
  const page = JSON.stringify({ ...variant, outputSpeed: 58.4, timeToFirstAnswerToken: 28.5 })
    + JSON.stringify({ ...variant, slug: "gpt-6-1-sol-low", effort: { level: 20 } })
  const [high, low] = releaseRows(page, release)
  assert.equal(high.speed, 58.4)
  assert.equal(high.latency, 28.5)
  assert.equal(low.speed, undefined)
  assert.equal(low.latency, undefined)
})

test("AA still reads the previous metric format", () => {
  const [row] = releaseRows(JSON.stringify({
    ...variant, medianOutputSpeed: 60, timeToFirstAnswerToken: { total: 12 },
  }), release)
  assert.equal(row.speed, 60)
  assert.equal(row.latency, 12)
})

test("AA headline metrics populate all four axes without borrowing from another effort", () => {
  const high = { ...variant, headline: { outputSpeed: 65, timeToFirstAnswerToken: 41 },
    outputSpeed: 1, timeToFirstAnswerToken: 2,
    canonicalIntelligenceIndexTokenCount: { output: 123456 } }
  const low = { ...variant, slug: "gpt-6-1-sol-low", effort: { level: 20 } }
  const rows = releaseRows(JSON.stringify(high) + JSON.stringify(low), release)
  assert.equal(rows[0].score, 50)
  assert.equal(rows[0].speed, 65)
  assert.equal(rows[0].verbosity, 123456)
  assert.equal(rows[0].latency, 41)
  assert.equal(rows[1].speed, undefined)
  assert.equal(rows[1].verbosity, undefined)
  assert.equal(rows[1].latency, undefined)
})
