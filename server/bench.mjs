import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadAa } from "./aa.mjs"

const PAGE = "https://cursor.com/cursorbench"
const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "bench-cache.json")
// Bump when rowsFromHtml reads new columns, so an unchanged table is parsed again.
const PARSER = "2"
const EFFORTS = ["Extra High", "Minimal", "Medium", "High", "Low", "Max"]

function decode(value) {
  return value
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function splitLabel(label) {
  for (const effort of EFFORTS) {
    const suffix = ` ${effort}`
    if (label.endsWith(suffix)) return { model: label.slice(0, -suffix.length), effort }
  }
  return { model: label, effort: null }
}

const GPT_MODEL = /^GPT-(\d+(?:\.\d+)?) (Astra|Sol|Terra|Luna)$/

export function providerOf(model) {
  if (/^(Opus|Sonnet|Fable) /.test(model)) return "claude"
  if (GPT_MODEL.test(model)) return "codex"
  if (model.startsWith("Grok ")) return "grok"
  if (model.startsWith("Muse ")) return "muse"
  if (model.startsWith("Gemini ")) return "gemini"
  return null
}

// Every model of the five CLIs' providers is shown, every listed version of every
// line; older versions are greyed in the chart and can be unticked in the menu.
// Shared by the CursorBench and AA sources (AA also limits by release date).
export function shownModels(models) {
  return new Set(models.filter((model) => providerOf(model) !== null))
}

export function selectRows(rows) {
  const shown = shownModels(rows.map((row) => row.model))
  return rows.filter((row) => shown.has(row.model))
}

export function rowsFromHtml(html) {
  const table = html.match(/<table[\s\S]*?<\/table>/)
  if (!table) return []
  const rows = []
  for (const tr of [...table[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].slice(1)) {
    const cells = [...tr[0].matchAll(/>([^<]+)</g)]
      .map((match) => decode(match[1]).trim())
      .filter(Boolean)
    if (cells.length < 8) continue
    const rank = Number(cells[0])
    const score = Number(cells[2])
    const cost = Number(cells[5])
    if (![rank, score, cost].every(Number.isFinite)) continue
    const { model, effort } = splitLabel(cells[1])
    const provider = providerOf(model)
    if (!provider) continue
    const tokens = Number(cells[6].replace(/,/g, ""))
    const steps = Number(cells[7].replace(/,/g, ""))
    rows.push({
      rank,
      label: cells[1],
      model,
      effort,
      score,
      cost,
      provider,
      ...(tokens > 0 ? { tokens } : {}),
      ...(steps > 0 ? { steps } : {}),
    })
  }
  return rows
}

async function readCache() {
  try {
    const data = JSON.parse(await readFile(CACHE, "utf8"))
    if (!data?.fetchedAt || !Array.isArray(data.rows)) return null
    return data
  } catch {
    return null
  }
}

function tableHash(html) {
  const table = html.match(/<table[\s\S]*?<\/table>/)
  if (!table) return ""
  const text = [...table[0].matchAll(/>([^<]+)</g)]
    .map((match) => decode(match[1]).trim())
    .filter(Boolean)
    .join("\n")
  return createHash("sha256").update(`${PARSER}
${text}`).digest("hex")
}

// The benchmark version the page currently shows ("4.0"), from its <h1> or, failing that,
// the chart's "CursorBench 4.0 score" label. Null when neither is found, so the page shows
// plain "CursorBench" rather than a stale number.
export function versionFromHtml(html) {
  const match =
    html.match(/<h1[^>]*>\s*CursorBench\s+(\d+(?:\.\d+)*)\s*</) ?? html.match(/CursorBench\s+(\d+(?:\.\d+)*)\s+score/)
  return match ? match[1] : null
}

export async function loadBench() {
  const cached = await readCache()
  try {
    const response = await fetch(PAGE, { headers: { "user-agent": "ai-model-compare" } })
    if (!response.ok) throw new Error(String(response.status))
    const html = await response.text()
    const hash = tableHash(html)
    const version = versionFromHtml(html)
    if (cached?.tableHash === hash && Array.isArray(cached.shown)) {
      return { changed: false, fetchedAt: cached.fetchedAt, source: PAGE, version, rows: cached.shown }
    }
    const rows = rowsFromHtml(html)
    if (rows.length === 0) throw new Error("empty")
    const shown = selectRows(rows)
    const payload = {
      fetchedAt: new Date().toISOString(),
      source: PAGE,
      version,
      tableHash: hash,
      rows,
      shown,
    }
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(CACHE, JSON.stringify(payload))
    return { changed: true, fetchedAt: payload.fetchedAt, source: PAGE, version, rows: shown }
  } catch (error) {
    const version = cached?.version ?? null
    if (cached?.shown) return { changed: false, fetchedAt: cached.fetchedAt, source: PAGE, version, rows: cached.shown }
    if (cached?.rows) return { changed: false, fetchedAt: cached.fetchedAt, source: PAGE, version, rows: selectRows(cached.rows) }
    throw error
  }
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader("content-type", "application/json; charset=utf-8")
  res.setHeader("cache-control", "no-store")
  res.end(JSON.stringify(body))
}

export function benchPlugin() {
  const handle = (req, res, next) => {
    const url = req.url ?? ""
    if (!url.startsWith("/api/bench")) return next()
    const source = new URL(url, "http://localhost").searchParams.get("source")
    const load = source === "aa" ? loadAa : loadBench
    load().then(
      (payload) => send(res, 200, payload),
      (error) => send(res, 502, { error: error instanceof Error ? error.message : "fetch failed" }),
    )
  }
  return {
    name: "bench-source",
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}
