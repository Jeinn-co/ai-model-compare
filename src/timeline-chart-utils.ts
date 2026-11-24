import type { TimelineMetric, TimelineRow } from "./timeline-data"

const COLORS = ["#d97757", "#10a37f", "#3186ff", "#9553ff", "var(--brand-grok)", "#dc2626", "#0891b2", "#b45309"]
const finite = (value: number | null): value is number => value !== null && Number.isFinite(value)

export function timelineValue(row: TimelineRow, metric: TimelineMetric) {
  if (metric === "score") return finite(row.eci) ? row.eci : null
  return finite(row.inputPrice) && row.inputPrice >= 0 && finite(row.outputPrice) && row.outputPrice >= 0
    ? (row.inputPrice + row.outputPrice) / 2 : null
}

export type TimelinePoint = { id: string; metric: TimelineMetric; kind: "input" | "mean" | "output" | "eci"; value: number; x: number; y: number }

export function nearestTimelinePoint(points: TimelinePoint[], x: number, y: number) {
  const models = new Map<string, TimelinePoint[]>()
  for (const point of points) {
    const group = models.get(point.id) ?? []
    group.push(point)
    models.set(point.id, group)
  }
  let nearest: TimelinePoint | null = null
  let distance = 18
  let pointDistance = Infinity
  for (const group of models.values()) {
    const top = Math.min(...group.map((point) => point.y))
    const bottom = Math.max(...group.map((point) => point.y))
    const gap = Math.hypot(x - group[0].x, Math.max(top - y, 0, y - bottom))
    const point = group.reduce((best, candidate) => Math.abs(candidate.y - y) < Math.abs(best.y - y) ? candidate : best)
    const tickGap = Math.hypot(x - point.x, y - point.y)
    if (gap < distance || gap === distance && nearest && tickGap < pointDistance) {
      nearest = point
      distance = gap
      pointDistance = tickGap
    }
  }
  return nearest
}

export function timelineGuides(points: TimelinePoint[], active: TimelinePoint) {
  const guides = new Map<number, TimelinePoint & { active: boolean }>()
  for (const point of points) {
    if (point.id !== active.id || point.metric !== active.metric) continue
    const on = point.kind === active.kind
    if (!guides.has(point.value) || on) guides.set(point.value, { ...point, active: on })
  }
  return [...guides.values()].sort((a, b) => a.y - b.y)
}

export function timelineColor(provider: string) {
  const lower = provider.toLowerCase()
  if (lower.includes("anthropic") || lower === "claude") return COLORS[0]
  if (lower.includes("openai") || lower === "codex") return COLORS[1]
  if (lower.includes("google") || lower === "gemini") return COLORS[2]
  if (lower.includes("meta") || lower === "muse") return COLORS[3]
  if (lower.includes("xai") || lower.includes("x.ai") || lower === "grok") return COLORS[4]
  let hash = 0
  for (const char of provider) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return COLORS[hash % COLORS.length]
}
