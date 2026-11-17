export type TimelineMetric = "score" | "cost"

export const DEFAULT_TIMELINE_MODELS: readonly string[] = [
  "claude opus 5.5", "gpt-6.1 sol", "gemini 4 hydrogen", "grok 4.6", "muse wonder",
]

export type TimelineRow = {
  id: string
  name: string
  provider: string
  releasedAt: string
  eci: number | null
  eciLow: number | null
  eciHigh: number | null
  inputPrice: number | null
  outputPrice: number | null
}

export type TimelineData = {
  rows: TimelineRow[]
  fetchedAt: string
  scoreSource: string
  priceSource: string
}
