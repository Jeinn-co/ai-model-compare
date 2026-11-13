import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import test from "node:test"

const fixture = await readFile(new URL("./fixtures/arena-latest.parquet", import.meta.url))
const stale = { fetchedAt: "2026-11-09T00:00:00Z", arenas: {
  text: [{ arena: "text", name: "Old text", score: 1 }],
  webdev: [{ arena: "webdev", name: "Old webdev", score: 1 }],
} }

async function isolated(t) {
  const root = await mkdtemp(join(tmpdir(), "arena-fetch-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cache = join(root, "cache.json"), published = join(root, "published.json")
  let code = await readFile(new URL("../server/arena.mjs", import.meta.url), "utf8")
  for (const name of ["gemini", "bench"]) {
    code = code.replace(`"./${name}.mjs"`, JSON.stringify(new URL(`../server/${name}.mjs`, import.meta.url).href))
  }
  code = code.replace('"hyparquet"', JSON.stringify(import.meta.resolve("hyparquet")))
    .replace(/const CACHE = .*/, `const CACHE = ${JSON.stringify(cache)}`)
    .replace(/const PUBLISHED = .*/, `const PUBLISHED = ${JSON.stringify(published)}`)
  const file = join(root, "arena.mjs")
  await writeFile(file, code)
  return { api: await import(pathToFileURL(file).href), cache, published }
}

test("published Parquet is parsed, filtered to overall, and sorted without the query API", async (t) => {
  const { api } = await isolated(t)
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/resolve/main/text/latest-00000-of-00001.parquet")
    return new Response(fixture)
  })
  const rows = await api.loadArenaRows("text")
  assert.deepEqual(rows.map(row => row.name), ["GPT-6.1 Sol (Max)", "Gemini 4 Hydrogen (High)"])
  assert.equal(rows[1].score, 10)
})

test("old parser caches are retried and full failure preserves their timestamp without writes", async (t) => {
  const { api, cache } = await isolated(t)
  const previous = { ...stale, fetchedAt: new Date().toISOString() }
  const original = JSON.stringify(previous)
  await writeFile(cache, original)
  let requests = 0
  t.mock.method(globalThis, "fetch", async () => { requests++; throw Error("offline") })
  const data = await api.loadArena()
  assert.equal(requests, 2)
  assert.equal(data.changed, false)
  assert.equal(data.fetchedAt, previous.fetchedAt)
  assert.equal(await readFile(cache, "utf8"), original)
})

test("published fallback retains its timestamp when no source can refresh", async (t) => {
  const { api, published } = await isolated(t)
  await writeFile(published, JSON.stringify({ fetchedAt: stale.fetchedAt, rows: Object.values(stale.arenas).flat() }))
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }))
  const data = await api.loadArena()
  assert.equal(data.changed, false)
  assert.equal(data.fetchedAt, stale.fetchedAt)
  assert.deepEqual(data.rows.map(row => row.name), ["Old text", "Old webdev"])
})

test("partial recovery keeps the old arena and conservatively retains the prior timestamp", async (t) => {
  const { api, cache } = await isolated(t)
  await writeFile(cache, JSON.stringify(stale))
  t.mock.method(globalThis, "fetch", async (url) => url.includes("/text/")
    ? new Response("unavailable", { status: 503 }) : new Response(fixture))
  const data = await api.loadArena()
  assert.equal(data.changed, true)
  assert.equal(data.fetchedAt, stale.fetchedAt)
  assert.equal(data.rows[0].name, "Old text")
  assert.ok(data.rows.some(row => row.arena === "webdev" && row.name === "Gemini 4 Hydrogen (High)"))
})

test("complete failure without any backup rejects instead of producing empty fresh data", async (t) => {
  const { api } = await isolated(t)
  t.mock.method(globalThis, "fetch", async () => new Response("bad parquet"))
  await assert.rejects(api.loadArena(), /no arena loaded/)
})
