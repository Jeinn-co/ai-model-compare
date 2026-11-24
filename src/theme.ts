export type Theme = "auto" | "light" | "dark"

export const THEMES: readonly Theme[] = ["auto", "light", "dark"]
export const THEME_KEY = "ai-model-compare-theme"

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === "light" || saved === "dark") return saved
  } catch {
    // Storage can be blocked; Auto still follows the OS.
  }
  return "auto"
}

export function applyTheme(theme: Theme) {
  if (theme === "auto") delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}
