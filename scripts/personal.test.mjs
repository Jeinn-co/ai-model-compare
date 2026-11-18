import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { buildPersonal, loadPersonal } from "../server/personal.mjs"

const previous = JSON.parse(await readFile(new URL("../public/data/personal-choices.json", import.meta.url), "utf8"))
const pair = (model, effort = "high") => [model, effort]
const usage = {
  schema_version: 1,
  daily: [{ provider: "codex", model: "GPT-6.2 Sol", label: "GPT-6.2-Sol", effort: "high" },
    { provider: "gemini", model: "Gemini 4 Hydrogen", effort: "high" }],
  roles: Object.fromEntries(Object.keys(previous.roles).map((id) => [id,
    { claude: pair("Opus 5.5"), codex: pair("GPT-6.2-Sol"), gemini: pair("Gemini 4 Hydrogen", "high ~ xhigh") }])),
  excludedGeminiPicks: ["gemini-4-argon"],
  optionalGeminiEffort: "xhigh",
}
const sAgent = { schema_version: 1, roles: { planner: { codex: { model: "gpt-6.2-sol", effort: "high" } } } }

test("the My usage block is published as written, keeping role names and descriptions", () => {
  const next = buildPersonal([sAgent, usage], previous)
  assert.deepEqual(next.roles.planner, { ...previous.roles.planner,
    models: { anth: ["Opus 5.5", "high"], oai: ["GPT-6.2-Sol", "high"], gemini: ["Gemini 4 Hydrogen", "high ~ xhigh"] } })
  assert.deepEqual(next.daily, usage.daily)
  assert.deepEqual(Object.keys(next), ["daily", "roles", "excludedGeminiPicks", "optionalGeminiEffort"])
})

test("a half-edited block is rejected as a whole", () => {
  assert.throws(() => buildPersonal([sAgent], previous), /no My usage/)
  assert.throws(() => buildPersonal([{ ...usage, daily: [usage.daily[0]] }], previous), /gemini/)
  const missing = structuredClone(usage)
  delete missing.roles.reviewer.claude
  assert.throws(() => buildPersonal([missing], previous), /roles\.reviewer\.claude/)
})

test("code blocks are read across pages and non-JSON blocks are skipped", async () => {
  const code = (value) => ({ type: "code", code: { rich_text: [{ plain_text: value }] } })
  const pages = [
    { results: [{ type: "paragraph" }, code(JSON.stringify(sAgent)), code("npx skills add x")], has_more: true, next_cursor: "c2" },
    { results: [code(JSON.stringify(usage))], has_more: false },
  ]
  const urls = []
  const fetchImpl = async (url, { headers }) => {
    urls.push(url)
    assert.equal(headers.authorization, "Bearer secret")
    return { ok: true, json: async () => pages.shift() }
  }
  const next = await loadPersonal(previous, "secret", fetchImpl)
  assert.equal(next.daily[0].model, "GPT-6.2 Sol")
  assert.match(urls[1], /start_cursor=c2/)
  await assert.rejects(loadPersonal(previous, "bad", async () => ({ ok: false, status: 401 })), /HTTP 401/)
})
