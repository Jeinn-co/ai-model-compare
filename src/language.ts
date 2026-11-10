export type Language = "en" | "zh"
export type Translate = (english: string, chinese: string) => string
export const LANGUAGE_KEY = "ai-model-compare-lang"

export function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (saved === "en" || saved === "zh") return saved
  } catch {
    // Storage can be blocked; the browser language still works.
  }
  return /^zh/i.test(navigator.language) ? "zh" : "en"
}
