// My usage choices, read from the owner's Notion config page through the official API
// (NOTION_TOKEN, an integration the page is shared with). The page's My usage JSON block
// holds exactly what the page and the ai-usage report display; it is validated and
// published as is. Role names and description keys stay from the published file.
const PAGE = "4118e936085b810891bdc1a77dd59b63"
const API = "https://api.notion.com/v1"
const BRANDS = { claude: "anth", codex: "oai", gemini: "gemini" }

const isText = (value) => typeof value === "string" && value.trim() !== ""
const isPair = (value) => Array.isArray(value) && value.length === 2 && value.every(isText)

// Every field is validated before anything is returned, so a half-edited block changes nothing.
export function buildPersonal(blocks, previous) {
  const usage = blocks.find((block) => block?.daily)
  if (!usage) throw new Error("Notion page has no My usage JSON block")
  if (!Array.isArray(usage.daily) || !usage.daily.every((c) => isText(c?.provider) && isText(c.model) && isText(c.effort))) {
    throw new Error("every daily entry needs provider, model and effort")
  }
  if (!usage.daily.some((choice) => choice.provider === "gemini")) throw new Error("daily must include gemini")
  const roles = Object.fromEntries(Object.entries(previous.roles).map(([id, meta]) => {
    const models = Object.fromEntries(Object.entries(BRANDS).map(([provider, brand]) => {
      const pair = usage.roles?.[id]?.[provider]
      if (!isPair(pair)) throw new Error(`roles.${id}.${provider} must be [model, effort]`)
      return [brand, pair]
    }))
    return [id, { ...meta, models }]
  }))
  if (!Array.isArray(usage.excludedGeminiPicks) || !usage.excludedGeminiPicks.every(isText)) {
    throw new Error("excludedGeminiPicks must be a list of model IDs")
  }
  if (!isText(usage.optionalGeminiEffort)) throw new Error("optionalGeminiEffort is required")
  return {
    daily: usage.daily.map(({ provider, model, label, effort }) => ({ provider, model, ...(isText(label) ? { label } : {}), effort })),
    roles,
    excludedGeminiPicks: usage.excludedGeminiPicks,
    optionalGeminiEffort: usage.optionalGeminiEffort,
  }
}

// The JSON of every code block on the page; other blocks are prose and ignored.
export async function notionBlocks(token, fetchImpl = fetch) {
  const blocks = []
  let cursor
  do {
    const url = `${API}/blocks/${PAGE}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, "notion-version": "2022-06-28" } })
    if (!response.ok) throw new Error(`Notion: HTTP ${response.status}`)
    const body = await response.json()
    for (const block of body.results ?? []) {
      if (block.type !== "code") continue
      const text = block.code.rich_text.map((part) => part.plain_text).join("")
      try { blocks.push(JSON.parse(text)) } catch { /* A non-JSON code block (install command) is not configuration. */ }
    }
    cursor = body.has_more ? body.next_cursor : undefined
  } while (cursor)
  return blocks
}

export async function loadPersonal(previous, token, fetchImpl = fetch) {
  return buildPersonal(await notionBlocks(token, fetchImpl), previous)
}
