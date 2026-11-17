import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { objects, page } from "./aa.mjs"

const SCORES = "https://epoch.ai/data/eci_scores.csv"
const PRICES = "https://artificialanalysis.ai/models"
const RELEASES = `${PRICES}/releases`
const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "timeline-cache.json")
const SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "timeline.json")
const TTL_MS = 6 * 60 * 60 * 1000
const PREFIX = '\\{"(?:id":"[0-9a-f-]+","slug|slug)":"[a-z0-9-]+"'
const keyOf = (name) => name.toLowerCase().replace(/[‐‑–—]/g, "-").replace(/\s+/g, " ").trim()
const numeric = (value) => (typeof value === "number" || typeof value === "string" && value.trim() !== "") &&
  Number.isFinite(Number(value)) ? Number(value) : null

export function csvRows(text) {
  const records = [], fields = []
  let field = "", quoted = false
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else if (ch == null) throw new Error("Unclosed CSV field")
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ",") { fields.push(field); field = "" }
    else if (ch === "\n" || ch == null) {
      fields.push(field.replace(/\r$/, ""))
      if (fields.some(Boolean)) records.push([...fields])
      fields.length = 0
      field = ""
    } else field += ch
  }
  const headings = records.shift()?.map((name) => name.replace(/^\uFEFF/, "")) ?? []
  return records.map((values) => Object.fromEntries(headings.map((name, i) => [name, values[i] ?? ""])))
}

function providerOf(name) {
  if (/anthropic/i.test(name)) return "Anthropic"
  if (/openai/i.test(name)) return "OpenAI"
  if (/google|deepmind/i.test(name)) return "Google DeepMind"
  if (/meta/i.test(name)) return "Meta"
  if (/xai|spacex/i.test(name)) return "xAI"
  return null
}

export function releasePrices(items, slug) {
  const variants = items.filter((item) => item.release?.slug === slug &&
    numeric(item.price1mInputTokens) != null && numeric(item.price1mOutputTokens) != null)
  const prices = new Set(variants.map((item) => `${item.price1mInputTokens}/${item.price1mOutputTokens}`))
  // shortcut: conflicting tariffs stay missing; add a provider selector before comparing them.
  if (prices.size !== 1 || variants.some((item) => item.price1mInputTokens < 0 || item.price1mOutputTokens < 0)) return null
  return { inputPrice: Number(variants[0].price1mInputTokens), outputPrice: Number(variants[0].price1mOutputTokens) }
}

export function timelineRows(scores, releases, prices, now = Date.now()) {
  const since = new Date(now - 730 * 86_400_000).toISOString().slice(0, 10)
  const rows = new Map()
  for (const score of scores) {
    const provider = providerOf(score.Organization ?? "")
    if (!provider || !/^\d{4}-\d{2}-\d{2}$/.test(score.date) || score.date < since || numeric(score.eci) == null) continue
    const name = score["Display name"] || score.Model
    const id = keyOf(score.Model)
    const price = prices.get(id)
    rows.set(id, { id, name, provider, releasedAt: score.date, eci: numeric(score.eci),
      eciLow: numeric(score.eci_ci_low), eciHigh: numeric(score.eci_ci_high),
      inputPrice: price?.inputPrice ?? null, outputPrice: price?.outputPrice ?? null })
  }
  for (const release of releases) {
    const id = keyOf(release.name)
    const price = prices.get(id)
    const provider = providerOf(release.creator?.name ?? "")
    if (rows.has(id) || !provider || !price || !/^\d{4}-\d{2}-\d{2}$/.test(release.releaseDate) || release.releaseDate < since) continue
    rows.set(id, { id, name: release.name, provider, releasedAt: release.releaseDate,
      eci: null, eciLow: null, eciHigh: null, ...price })
  }
  return [...rows.values()].sort((a, b) => a.releasedAt.localeCompare(b.releasedAt) || a.name.localeCompare(b.name))
}

async function previousData() {
  for (const file of [CACHE, SNAPSHOT]) {
    try {
      const data = JSON.parse(await readFile(file, "utf8"))
      if (data.fetchedAt && data.scoreSource === SCORES && data.priceSource === PRICES && data.rows?.length) return data
    } catch { /* The next snapshot may still be available. */ }
  }
  return null
}

export async function loadTimeline({ force = false } = {}) {
  const previous = await previousData()
  if (!force && previous && Date.now() - Date.parse(previous.fetchedAt) < TTL_MS) return previous
  try {
    const [scoreText, priceHtml, releasesHtml] = await Promise.all([page(SCORES), page(PRICES), page(RELEASES)])
    const scores = csvRows(scoreText)
    if (!scores.length || !("eci" in scores[0])) throw new Error("Epoch returned no ECI scores")
    const priceItems = objects(priceHtml, PREFIX)
    const releases = new Map()
    for (const item of objects(releasesHtml, PREFIX)) {
      if (item.slug && item.name && item.releaseDate && providerOf(item.creator?.name ?? "")) releases.set(item.slug, item)
    }
    if (!releases.size || !priceItems.length) throw new Error("AA returned no model metadata")
    const relevant = new Set(scores.map((score) => keyOf(score.Model)))
    const prices = new Map()
    for (const release of releases.values()) {
      const price = releasePrices(priceItems, release.slug)
      if (price) prices.set(keyOf(release.name), price)
    }
    const since = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10)
    const queue = [...releases.values()].filter((release) => release.releaseDate >= since &&
      relevant.has(keyOf(release.name)) && !prices.has(keyOf(release.name)))
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let release = queue.shift(); release; release = queue.shift()) {
        try {
          const items = objects(await page(`${RELEASES}/${release.slug}`), PREFIX)
          const price = releasePrices(items, release.slug)
          if (price) prices.set(keyOf(release.name), price)
        } catch { /* An unverified price stays missing. */ }
      }
    }))
    const rows = timelineRows(scores, [...releases.values()], prices)
    if (!rows.some((row) => row.eci != null) || !rows.some((row) => row.inputPrice != null)) throw new Error("Timeline lacks scores or prices")
    const data = { fetchedAt: new Date().toISOString(), source: SCORES, scoreSource: SCORES, priceSource: PRICES, rows }
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(CACHE, JSON.stringify(data))
    return data
  } catch (error) {
    if (previous) return previous
    throw error
  }
}

export function timelinePlugin() {
  return {
    name: "model-release-timeline",
    configureServer(server) {
      server.middlewares.use("/api/timeline", async (_request, response) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8")
        try { response.end(JSON.stringify(await loadTimeline())) }
        catch (error) { response.statusCode = 502; response.end(JSON.stringify({ error: error.message })) }
      })
    },
  }
}
