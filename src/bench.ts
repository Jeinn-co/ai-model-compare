import { version } from "../package.json"
import { models as geminiModels } from "../public/data/gemini-models.json"

export type ProviderId = "claude" | "codex" | "grok" | "muse" | "gemini" | "cursor"

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
  // Per-task columns: tokens on CursorBench and Terminal-Bench, steps on CursorBench only.
  tokens?: number
  steps?: number
  // Terminal-Bench only: the 95% confidence half-width of the score and the agent harness
  // that ran it (Gemini runs in mini-SWE-agent).
  ci?: number
  agent?: string
}

export type YAxis = "score" | "speed" | "verbosity" | "latency" | "tokens" | "steps"

export const Y_AXES: readonly YAxis[] = ["score", "speed", "verbosity", "latency", "tokens", "steps"]

// The Y axes each source has figures for. AA's Verbosity (output tokens for the whole
// index) and CursorBench's Tokens (per task) are measured differently, so they stay apart.
export const SOURCE_AXES: Record<SourceId, readonly YAxis[]> = {
  aa: ["score", "speed", "verbosity", "latency"],
  cursorbench: ["score", "tokens", "steps"],
  tbench: ["score", "tokens"],
  arc: ["score"],
}

export const PROVIDERS: readonly {
  id: ProviderId
  name: string
  creator: string
  color: string
}[] = [
  // Official colours that do not clash with each other: Claude #D97757 (product and
  // company), OpenAI green #10A37F (Codex's own mark is blue-violet, which would clash),
  // xAI black, Meta AI violet #9553FF (Meta's corporate blue would clash with Gemini),
  // Gemini blue #3186FF (from the Gemini mark).
  { id: "claude", name: "Claude Code", creator: "Anthropic", color: "#d97757" },
  { id: "codex", name: "Codex", creator: "OpenAI", color: "#10a37f" },
  { id: "gemini", name: "Gemini", creator: "Google DeepMind", color: "#3186ff" },
  { id: "grok", name: "Grok", creator: "xAI", color: "var(--brand-grok)" },
  { id: "muse", name: "Muse", creator: "Meta", color: "#9553ff" },
  { id: "cursor", name: "Cursor", creator: "Cursor", color: "var(--brand-cursor)" },
]

export function compareCreators(a: string, b: string) {
  const position = (name: string) => {
    const index = PROVIDERS.findIndex((provider) => provider.creator === name)
    return index < 0 ? PROVIDERS.length : index
  }
  return position(a) - position(b) || a.localeCompare(b)
}

export type SourceId = "cursorbench" | "aa" | "tbench" | "arc"

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
  tbench: {
    id: "tbench",
    name: "Terminal-Bench",
    eyebrow: "Terminal-Bench",
    url: "https://www.tbench.ai/leaderboard",
    unit: "%",
    scoreName: "Terminal-Bench resolution rate",
  },
  arc: {
    id: "arc",
    name: "ARC-AGI-2",
    eyebrow: "ARC-AGI-2",
    url: "https://arcprize.org/leaderboard",
    unit: "%",
    scoreName: "ARC-AGI-2 score",
  },
  cursorbench: {
    id: "cursorbench",
    name: "CursorBench",
    eyebrow: "CursorBench",
    url: "https://cursor.com/cursorbench",
    unit: "%",
    scoreName: "CursorBench score",
  },
}

// The source's labels with the benchmark version the data was fetched under
// ("CursorBench 4.0", "Terminal-Bench 4.0"). AA reports none; without one the labels stay plain.
export function sourceMeta(id: SourceId, version: string | null) {
  const meta = SOURCES[id]
  if (!version) return meta
  return { ...meta, eyebrow: `${meta.name} ${version}`, scoreName: meta.scoreName.replace(meta.name, `${meta.name} ${version}`) }
}

export const APP_VERSION = version

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
  Fable: "var(--brand-fable)", Opus: "#d97757", Sonnet: "#eaa284",
  Astra: "var(--brand-astra)", Sol: "#10a37f", Terra: "#45c39f", Luna: "#93dcc4",
  Grok: "var(--brand-grok)", "Grok Build": "var(--brand-grok-build)",
  "Muse Spark": "#9553ff", "Muse Glimmer": "#c3a3ff",
  "Gemini Carbon": "var(--brand-gemini-carbon)", "Gemini Argon": "var(--brand-gemini-argon)", "Gemini Neon": "#1c65d8", "Gemini Hydrogen": "#2475e8", "Gemini Pro Preview": "#1f6ae6", "Gemini Flash": "#3186ff", "Gemini Flash-Lite": "#8dbcff",
  Composer: "var(--brand-cursor)",
}

// Share of the chart surface mixed in per step behind the newest version of a line:
// older models recede in both light and dark themes while keeping their CLI's hue.
const FADE = [0, 0.35, 0.55, 0.7, 0.8]

function fade(color: string, behind: number) {
  const t = FADE[Math.min(Math.max(behind, 0), FADE.length - 1)]
  if (!t) return color
  return `color-mix(in srgb, ${color} ${Math.round((1 - t) * 100)}%, var(--surface))`
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

// Gemini lines follow gemini-models.json, which lists Google's tiers strongest first, so a new
// Gemini model sorts itself once the catalog has it. Lines the catalog no longer carries follow.
const GEMINI_LINES = [...new Set([...geminiModels.map((model) => modelLine(model.model).line),
  "Gemini Flash-Lite", "Gemini Pro Preview"])]

// Menu order: by line first (Fable, Opus, Sonnet; GPT Astra, Sol, Terra, Luna; Grok, Grok
// Build; Muse Spark, Glimmer; Gemini as above), then newest version first within a line.
// Pro comes last for Gemini so both Gemini 3.1 models sit at the bottom. The order does
// not reshuffle when scores move.
const LINE_ORDER = [
  "Fable", "Opus", "Sonnet", "Haiku",
  "Astra", "Sol", "Terra", "Luna",
  "Grok", "Grok Build",
  "Muse Wonder", "Muse Spark", "Muse Spark Open", "Muse Glimmer", "Muse Ember",
  ...GEMINI_LINES,
  "Composer",
]

export const modelLineRank = (line: string) => (LINE_ORDER.includes(line) ? LINE_ORDER.indexOf(line) : LINE_ORDER.length)

export function compareModels(a: string, b: string) {
  const x = modelLine(a)
  const y = modelLine(b)
  return modelLineRank(x.line) - modelLineRank(y.line) || x.line.localeCompare(y.line) || y.version - x.version || b.localeCompare(a)
}

// Ticked by default: the newest version of the line each CLI is mostly run with, so
// Opus 5.6 takes over from Opus 5.5 as soon as the source lists it. A CLI with none of
// these lines in a source gets the first model of its menu instead.
export const DEFAULT_LINES = new Set(["Opus", "Sol", "Grok", "Muse Spark", "Gemini Hydrogen", "Gemini Flash", "Composer"])

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
