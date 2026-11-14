import { createInstance } from "i18next"
import english from "./locales/en.json"
import chinese from "./locales/zh-TW.json"

export type Language = "en" | "zh"
export type TranslationKey = keyof typeof english
type Values = Record<string, string | number>
export type Translate = ((key: TranslationKey, values?: Values) => string) & { language: Language }
export const LANGUAGE_KEY = "ai-model-compare-lang"

const messages = createInstance()
void messages.init({
  lng: "en", fallbackLng: "en", supportedLngs: ["en", "zh"], keySeparator: false,
  initAsync: false, interpolation: { escapeValue: false },
  resources: { en: { translation: english }, zh: { translation: chinese } },
})

export function createTranslator(language: Language): Translate {
  const fixed = messages.getFixedT(language)
  return Object.assign((key: TranslationKey, values?: Values) => fixed(key, values), { language })
}

export function textPair(key: TranslationKey, values?: Values, chineseValues = values): readonly [string, string] {
  return [messages.getFixedT("en")(key, values), messages.getFixedT("zh")(key, chineseValues)]
}

export function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (saved === "en" || saved === "zh") return saved
  } catch {
    // Storage can be blocked; the browser language still works.
  }
  return /^zh/i.test(navigator.language) ? "zh" : "en"
}
