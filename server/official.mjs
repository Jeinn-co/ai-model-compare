// Current models each vendor lists on its own docs, so the chart never shows a model
// that is retired or only kept as legacy. Claude: the IDs in the "Claude API ID" row of
// the models overview (legacy models are a separate list below it and are left out).
// Codex: the model cards (slug="...") under "Recommended models".
// Only Claude and Codex are checked; other providers pass through unchanged.
const CLAUDE = "https://platform.claude.com/docs/en/models/overview.md"
const CODEX = "https://learn.chatgpt.com/docs/models.md"

async function text(url) {
  const response = await fetch(url, { headers: { "user-agent": "ai-model-compare-snapshot" } })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

const title = (word) => word[0].toUpperCase() + word.slice(1)

// claude-opus-5-5 -> "Opus 5.5"
export function claudeModels(markdown) {
  const row = markdown.split("\n").find((line) => line.startsWith("| Claude API ID"))
  const ids = row ? [...row.matchAll(/`claude-([a-z]+)-(\d+)-(\d+)`/g)] : []
  return new Set(ids.map(([, line, major, minor]) => `${title(line)} ${major}.${minor}`))
}

// gpt-6.1-sol -> "GPT-6.1 Sol"
export function codexModels(markdown) {
  const slugs = [...markdown.matchAll(/slug="gpt-(\d+(?:\.\d+)?)-([a-z]+)"/g)]
  return new Set(slugs.map(([, version, line]) => `GPT-${version} ${title(line)}`))
}

export async function loadOfficial() {
  const [claude, codex] = await Promise.all([text(CLAUDE), text(CODEX)])
  const official = { claude: claudeModels(claude), codex: codexModels(codex) }
  // An empty list means the page layout changed, not that every model retired.
  for (const [provider, models] of Object.entries(official)) {
    if (!models.size) throw new Error(`no current ${provider} models found on the official page`)
  }
  return official
}

// LMArena rows carry `name` with an effort or date in brackets ("Opus 5.5 (High)").
const modelOf = (row) => row.model ?? row.name?.replace(/\s*\(.*\)$/, "")

export function keepOfficial(rows, official) {
  return rows.filter((row) => !official[row.provider] || official[row.provider].has(modelOf(row)))
}
