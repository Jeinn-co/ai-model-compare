// My usage choices and the role table, read from the owner's Notion config page through the
// official API (NOTION_TOKEN, an integration the page is shared with). The S-Agent block is
// the only source of role models, the same one s-agent dispatches from; the My usage block
// holds the daily choices and Gemini pick settings. Role names and description keys stay
// from the published file.
const PAGE = "4118e936085b810891bdc1a77dd59b63"
const API = "https://api.notion.com/v1"
const BRANDS = { claude: "anth", codex: "oai", gemini: "gemini" }

const isText = (value) => typeof value === "string" && value.trim() !== ""
const title = (word) => word[0].toUpperCase() + word.slice(1)

// claude-opus-5-5 -> "Opus 5.5", gpt-6.2-sol -> "GPT-6.2-Sol", gemini-4-argon -> "Gemini 4 Argon"
export function displayModel(id) {
  const claude = id.match(/^claude-([a-z]+)-(\d+)-(\d+)$/)
  if (claude) return `${title(claude[1])} ${claude[2]}.${claude[3]}`
  const gpt = id.match(/^gpt-(\d+(?:\.\d+)?)-([a-z]+)$/)
  if (gpt) return `GPT-${gpt[1]}-${title(gpt[2])}`
  const gemini = id.match(/^gemini-(\d+(?:\.\d+)?)-([a-z-]+)$/)
  if (gemini) return `Gemini ${gemini[1]} ${gemini[2].split("-").map(title).join("-")}`
  return id
}

// Every field is validated before anything is returned, so a half-edited page changes nothing.
export function buildPersonal(blocks, previous) {
  const agent = blocks.find((block) => block?.roles)
  const usage = blocks.find((block) => block?.daily)
  if (!agent || !usage) throw new Error("Notion page needs both the S-Agent and My usage JSON blocks")
  if (!Array.isArray(usage.daily) || !usage.daily.every((c) => isText(c?.provider) && isText(c.model) && isText(c.effort))) {
    throw new Error("every daily entry needs provider, model and effort")
  }
  if (!usage.daily.some((choice) => choice.provider === "gemini")) throw new Error("daily must include gemini")
  const roles = Object.fromEntries(Object.entries(previous.roles).map(([id, meta]) => {
    const models = Object.fromEntries(Object.entries(BRANDS).map(([provider, brand]) => {
      const choice = agent.roles[id]?.[provider]
      if (!isText(choice?.model) || !isText(choice.effort)) throw new Error(`role ${id} lacks ${provider} model or effort`)
      return [brand, [displayModel(choice.model), choice.effort]]
    }))
    return [id, { ...meta, models }]
  }))
  if (!Array.isArray(usage.excludedGeminiPicks) || !usage.excludedGeminiPicks.every(isText)) {
    throw new Error("excludedGeminiPicks must be a list of model IDs")
  }
  return {
    daily: usage.daily.map(({ provider, model, label, effort }) => ({ provider, model, ...(isText(label) ? { label } : {}), effort })),
    roles,
    excludedGeminiPicks: usage.excludedGeminiPicks,
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
