export type ProviderId = "claude" | "codex" | "grok" | "muse" | "gemini"

export type Row = {
  rank: number
  label: string
  model: string
  effort: string | null
  score: number
  cost: number
  provider: ProviderId
  // AA model-page cards; omitted on CursorBench and when AA did not publish them.
  speed?: number
  verbosity?: number
  latency?: number
  // CursorBench per-task columns; omitted on AA.
  tokens?: number
  steps?: number
}

export type YAxis = "score" | "speed" | "verbosity" | "latency" | "tokens" | "steps"

export const Y_AXES: readonly { id: YAxis; name: string; label: string }[] = [
  { id: "score", name: "Score", label: "Score" },
  { id: "speed", name: "Speed", label: "Speed" },
  { id: "verbosity", name: "Verbosity", label: "Verbosity" },
  { id: "latency", name: "Latency", label: "Latency" },
  { id: "tokens", name: "Tokens", label: "Tokens per task" },
  { id: "steps", name: "Steps", label: "Steps per task" },
]

// The Y axes each source has figures for. AA's Verbosity (output tokens for the whole
// index) and CursorBench's Tokens (per task) are measured differently, so they stay apart.
export const SOURCE_AXES: Record<SourceId, readonly YAxis[]> = {
  aa: ["score", "speed", "verbosity", "latency"],
  cursorbench: ["score", "tokens", "steps"],
}

export const PROVIDERS: readonly {
  id: ProviderId
  name: string
  color: string
}[] = [
  // Official colours that do not clash with each other: Claude #D97757 (product and
  // company), OpenAI green #10A37F (Codex's own mark is blue-violet, which would clash),
  // xAI black, Meta AI violet #9553FF (Meta's corporate blue would clash with Gemini),
  // Gemini blue #3186FF (from the Gemini mark).
  { id: "claude", name: "Claude Code", color: "#d97757" },
  { id: "codex", name: "Codex", color: "#10a37f" },
  { id: "grok", name: "Grok", color: "#000000" },
  { id: "muse", name: "Muse", color: "#9553ff" },
  { id: "gemini", name: "Gemini", color: "#3186ff" },
]

export type SourceId = "cursorbench" | "aa"

export const SOURCES: Record<
  SourceId,
  { id: SourceId; name: string; eyebrow: string; url: string; unit: string; scoreName: string }
> = {
  aa: {
    id: "aa",
    name: "Artificial Analysis",
    eyebrow: "AA Intelligence Index",
    url: "https://artificialanalysis.ai/models/releases",
    unit: "",
    scoreName: "Artificial Analysis Intelligence Index",
  },
  cursorbench: {
    id: "cursorbench",
    name: "CursorBench",
    eyebrow: "CursorBench 4.0",
    url: "https://cursor.com/cursorbench",
    unit: "%",
    scoreName: "CursorBench 4.0 score",
  },
}

export const APP_VERSION = "1.0.0"

export const REPO_URL = "https://github.com/Jeinn-co/ai-model-compare"

export function providerById(id: ProviderId) {
  const found = PROVIDERS.find((item) => item.id === id)
  if (!found) throw new Error(id)
  return found
}

// A model's line and version: "GPT-6.1 Sol" -> Sol 6.1, "Opus 5.5" -> Opus 5.5,
// "Grok 4.20 0309 v2" -> Grok 4.2, "Gemini 3.5 Flash-Lite" -> Gemini Flash-Lite 3.5,
// "Muse Spark" -> Muse Spark 0. Versions compare as decimals, so Grok 4.20 (March)
// sits below Grok 4.7 (September); build dates and "v2" tags are not part of the line.
export function modelLine(model: string) {
  const gpt = model.match(/^GPT-(\d+(?:\.\d+)?) (\w+)$/)
  if (gpt) return { line: gpt[2], version: parseFloat(gpt[1]) }
  const tokens = model.split(/\s+/)
  const at = tokens.findIndex((token) => /^\d+(?:\.\d+)?$/.test(token))
  const version = at >= 0 ? parseFloat(tokens[at]) : 0
  const line = tokens.filter((token, i) => i !== at && !/^\d+$/.test(token) && !/^v\d+$/i.test(token)).join(" ")
  return { line, version }
}

// How many versions behind the newest of its line each older model is (Opus 5 is 1
// behind Opus 5.5, GPT-5.6 Sol is 2 behind GPT-6.1 Sol). Older ones get grey so the
// newest of every line stands out.
export function previousGenerations(models: readonly string[]) {
  const versions = new Map<string, Set<number>>()
  for (const model of models) {
    const { line, version } = modelLine(model)
    versions.set(line, (versions.get(line) ?? new Set()).add(version))
  }
  const behind = new Map<string, number>()
  for (const model of models) {
    const { line, version } = modelLine(model)
    const newer = [...(versions.get(line) ?? [])].filter((value) => value > version).length
    if (newer > 0) behind.set(model, newer)
  }
  return behind
}

// One hue per CLI (its chip colour), one shade per line within it: darkest for the
// flagship line, lightest for the small one. A colour tells you the CLI at a glance.
const LINE_COLOR: Record<string, string> = {
  Fable: "#a8492a", Opus: "#d97757", Sonnet: "#eaa284",
  Astra: "#0a6e56", Sol: "#10a37f", Terra: "#45c39f", Luna: "#93dcc4",
  Grok: "#000000", "Grok Build": "#6b6b6b",
  "Muse Spark": "#9553ff", "Muse Glimmer": "#c3a3ff",
  "Gemini Argon": "#1554c7", "Gemini Pro Preview": "#1f6ae6", "Gemini Flash": "#3186ff", "Gemini Flash-Lite": "#8dbcff",
}

// Share of white mixed in per step behind the newest version of a line: the older, the
// paler, so faded lines still read as their CLI's colour.
const FADE = [0, 0.35, 0.55, 0.7, 0.8]

function fade(hex: string, behind: number) {
  const t = FADE[Math.min(Math.max(behind, 0), FADE.length - 1)]
  if (!t) return hex
  const channel = (i: number) => {
    const value = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
    return Math.round(value + (255 - value) * t).toString(16).padStart(2, "0")
  }
  return `#${channel(0)}${channel(1)}${channel(2)}`
}

export function seriesColor(model: string, provider: ProviderId, behind = 0) {
  return fade(LINE_COLOR[modelLine(model).line] ?? providerById(provider).color, behind)
}

export function formatScore(score: number, unit = "%") {
  return `${score.toFixed(1)}${unit}`
}

export function formatSpeed(value: number | undefined) {
  if (value == null || !(value > 0)) return null
  return `${value.toFixed(1)}/s`
}

export function formatVerbosity(value: number | undefined) {
  if (value == null || !(value > 0)) return null
  if (value >= 1e6) return `${Math.round(value / 1e6)}M`
  if (value >= 1e3) return `${Math.round(value / 1e3)}K`
  return `${Math.round(value)}`
}

export function formatLatency(value: number | undefined) {
  if (value == null || !(value > 0)) return null
  return `${value.toFixed(1)}s`
}

export const formatTokens = formatVerbosity

export function formatSteps(value: number | undefined) {
  if (value == null || !(value > 0)) return null
  return `${Math.round(value)}`
}

export function yValue(row: Row, axis: YAxis) {
  if (axis === "score") return row.score
  const value = row[axis]
  return value != null && value > 0 ? value : null
}

export function formatY(value: number, axis: YAxis, unit = "") {
  if (axis === "score") return formatScore(value, unit)
  if (axis === "speed") return formatSpeed(value) ?? ""
  if (axis === "verbosity") return formatVerbosity(value) ?? ""
  if (axis === "tokens") return formatTokens(value) ?? ""
  if (axis === "steps") return formatSteps(value) ?? ""
  return formatLatency(value) ?? ""
}

export function yAxisLabel(axis: YAxis) {
  if (axis === "score") return "Score"
  return Y_AXES.find((item) => item.id === axis)?.label ?? "Score"
}

export function formatCost(cost: number) {
  return `$${cost.toFixed(2)}`
}

export function formatCostTick(value: number) {
  if (value === 0) return "$0"
  const digits = value >= 10 ? 0 : value < 1 ? 2 : 1
  return `$${value.toFixed(digits).replace(/\.0$/, "")}`
}

export function niceCeil(value: number) {
  if (value <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(value))
  const scaled = value / pow
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  const nice = steps.find((step) => step >= scaled - 1e-9) ?? 10
  return nice * pow
}

export function tickValues(min: number, max: number, count: number) {
  const span = max - min
  if (span <= 0) return [min]
  const raw = span / Math.max(1, count - 1)
  const pow = 10 ** Math.floor(Math.log10(raw))
  const err = raw / pow
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * pow
  const start = Math.ceil((min - step * 1e-6) / step) * step
  const ticks: number[] = []
  for (let value = start; value <= max + step * 1e-6; value += step) {
    ticks.push(Number(value.toFixed(6)))
  }
  return ticks
}

// Menu order: by line first (Fable, Opus, Sonnet; GPT Astra, Sol, Terra, Luna; Grok, Grok
// Build; Muse Spark, Glimmer; Gemini Argon, Flash, Flash-Lite, Pro), then newest version
// first within a line. Pro comes last for Gemini so both Gemini 3.1 models sit at the
// bottom. The order does not reshuffle when scores move.
const LINE_ORDER = [
  "Fable", "Opus", "Sonnet",
  "Astra", "Sol", "Terra", "Luna",
  "Grok", "Grok Build",
  "Muse Spark", "Muse Glimmer",
  "Gemini Argon", "Gemini Flash", "Gemini Flash-Lite", "Gemini Pro Preview",
]

const rank = (line: string) => (LINE_ORDER.includes(line) ? LINE_ORDER.indexOf(line) : LINE_ORDER.length)

export function compareModels(a: string, b: string) {
  const x = modelLine(a)
  const y = modelLine(b)
  return rank(x.line) - rank(y.line) || x.line.localeCompare(y.line) || y.version - x.version || b.localeCompare(a)
}

// Ticked by default: the newest version of the line each CLI is mostly run with, so
// Opus 5.6 takes over from Opus 5.5 as soon as the source lists it. A CLI with none of
// these lines in a source gets the first model of its menu instead.
export const DEFAULT_LINES = new Set(["Opus", "Sol", "Grok", "Muse Spark", "Gemini Flash"])

export function defaultTicked(rows: readonly Row[]) {
  const byProvider = new Map<ProviderId, string[]>()
  for (const row of rows) {
    const models = byProvider.get(row.provider) ?? []
    if (!models.includes(row.model)) models.push(row.model)
    byProvider.set(row.provider, models)
  }
  const ticked = new Set<string>()
  for (const models of byProvider.values()) {
    const sorted = [...models].sort(compareModels)
    const preferred = sorted.find((model) => DEFAULT_LINES.has(modelLine(model).line))
    ticked.add(preferred ?? sorted[0])
  }
  return ticked
}
