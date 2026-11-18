import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { buildPersonal, displayModel, loadPersonal } from "../server/personal.mjs"

const previous = JSON.parse(await readFile(new URL("../public/data/personal-choices.json", import.meta.url), "utf8"))
const role = (codex, claude, gemini) => ({ codex, claude, gemini })
const pick = (model, effort = "high") => ({ model, effort })
const agent = { schema_version: 1, roles: Object.fromEntries(Object.keys(previous.roles).map((id) => [id,
  role(pick("gpt-6.2-sol"), pick("claude-opus-5-5"), pick(id === "security" ? "gemini-4-carbon" : "gemini-4-argon"))])) }
const usage = {
  schema_version: 1,
  daily: [{ provider: "codex", model: "GPT-6.2 Sol", label: "GPT-6.2-Sol", effort: "high" },
    { provider: "gemini", model: "Gemini 4 Hydrogen", effort: "high" }],
  cliDefaults: [{ provider: "codex", model: "gpt-6.2-sol", effort: "high" }],
  excludedGeminiPicks: ["gemini-4-argon"],
  optionalGeminiEffort: "xhigh",
}

test("Notion model IDs become the names the report and page already use", () => {
  assert.equal(displayModel("claude-opus-5-5"), "Opus 5.5")
  assert.equal(displayModel("claude-sonnet-5-5"), "Sonnet 5.5")
  assert.equal(displayModel("gpt-6.2-sol"), "GPT-6.2-Sol")
  assert.equal(displayModel("gpt-6-astra"), "GPT-6-Astra")
  assert.equal(displayModel("gemini-4-argon"), "Gemini 4 Argon")
  assert.equal(displayModel("gemini-3.8-flash"), "Gemini 3.8 Flash")
  assert.equal(displayModel("something-new"), "something-new")
})

test("roles take their models from the s-agent block and keep their names", () => {
  const next = buildPersonal([agent, usage], previous)
  assert.deepEqual(next.roles.planner, { ...previous.roles.planner,
    models: { anth: ["Opus 5.5", "high"], oai: ["GPT-6.2-Sol", "high"], gemini: ["Gemini 4 Argon", "high"] } })
  assert.deepEqual(next.roles.security.models.gemini, ["Gemini 4 Carbon", "high"])
  assert.deepEqual(next.daily, usage.daily)
  assert.deepEqual(next.cliDefaults, usage.cliDefaults)
})

test("a half-edited page is rejected as a whole", () => {
  assert.throws(() => buildPersonal([agent], previous), /both/)
  assert.throws(() => buildPersonal([agent, { ...usage, daily: [usage.daily[0]] }], previous), /gemini/)
  const missing = structuredClone(agent)
  delete missing.roles.reviewer.claude
  assert.throws(() => buildPersonal([missing, usage], previous), /reviewer lacks claude/)
})

test("code blocks are read across pages and non-JSON blocks are skipped", async () => {
  const code = (value) => ({ type: "code", code: { rich_text: [{ plain_text: value }] } })
  const pages = [
    { results: [{ type: "paragraph" }, code(JSON.stringify(agent)), code("npx skills add x")], has_more: true, next_cursor: "c2" },
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
