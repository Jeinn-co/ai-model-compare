import type { TimelineRow } from "./timeline-data"

export const RETIREMENTS_CHECKED_AT = "2026-11-17"
const CLAUDE = "https://platform.claude.com/docs/en/about-claude/model-deprecations"
const OPENAI = "https://developers.openai.com/api/docs/deprecations"
const GOOGLE = "https://aistudio.google.com/docs/deprecations"
const GOOGLE_HISTORY = "https://aistudio.google.com/docs/changelog#11-04-2025"
const XAI = "https://docs.x.ai/developers/migration/may-15-retirement"

// Exact release IDs: never infer retirement from age, missing prices, or absence from a recommended list.
// shortcut: manually verified API retirement dates; refresh this list when vendors announce changes.
const RETIREMENTS = [
  { provider: "Anthropic", ids: ["claude 3.7 sonnet"], retiredAt: "2026-02-19", source: CLAUDE },
  { provider: "Anthropic", ids: ["claude opus 4", "claude sonnet 4"], retiredAt: "2026-06-15", source: CLAUDE },
  { provider: "Anthropic", ids: ["claude opus 4.1"], retiredAt: "2026-08-05", source: CLAUDE },
  { provider: "Anthropic", ids: ["claude sonnet 4.5"], retiredAt: "2026-11-30", source: CLAUDE },
  { provider: "OpenAI", ids: ["gpt-4.5"], retiredAt: "2025-07-14", source: OPENAI },
  { provider: "OpenAI", ids: ["gpt-4.1 nano", "o1", "o3-mini", "o4-mini"], retiredAt: "2026-10-23", source: OPENAI },
  { provider: "OpenAI", ids: ["gpt-5", "gpt-5 mini", "gpt-5 nano", "gpt-5 pro", "o3", "o3-pro"], retiredAt: "2026-12-11", source: OPENAI },
  { provider: "OpenAI", ids: ["gpt-4o (nov 2024)", "gpt-4.1", "gpt-4.1 mini"], retiredAt: "2027-01-14", source: OPENAI },
  { provider: "Google DeepMind", ids: ["gemini 2.0 flash thinking (jan 2025)"], retiredAt: "2025-12-02", source: GOOGLE_HISTORY },
  { provider: "Google DeepMind", ids: ["gemini 2.0 pro"], retiredAt: "2025-12-09", source: GOOGLE_HISTORY },
  { provider: "Google DeepMind", ids: ["gemini 2.0 flash (feb 2025)"], retiredAt: "2026-06-01", source: GOOGLE },
  { provider: "Google DeepMind", ids: ["gemini 2.5 pro (mar 2025)"], retiredAt: "2025-06-26", source: "https://aistudio.google.com/docs/changelog#06-26-2025" },
  { provider: "Google DeepMind", ids: ["gemini 2.5 pro (may 2025)", "gemini 2.5 pro (jun 2025)"], retiredAt: "2025-12-02", source: GOOGLE },
  { provider: "Google DeepMind", ids: ["gemini 2.5 flash (may 2025)", "gemini 2.5 flash-lite (jun 2025)"], retiredAt: "2025-11-18", source: GOOGLE_HISTORY },
  { provider: "Google DeepMind", ids: ["gemini 2.5 flash (sep 2025)"], retiredAt: "2026-02-17", source: GOOGLE },
  { provider: "Google DeepMind", ids: ["gemini 3 pro"], retiredAt: "2026-03-09", source: GOOGLE },
  { provider: "xAI", ids: ["grok 3", "grok 4", "grok 4 fast"], retiredAt: "2026-05-15", source: XAI },
]

export function modelRetirement(row: Pick<TimelineRow, "id" | "provider">, on = new Date().toISOString().slice(0, 10)) {
  return RETIREMENTS.find((entry) => entry.provider === row.provider && entry.ids.includes(row.id.toLowerCase())
    && entry.retiredAt <= on) ?? null
}
