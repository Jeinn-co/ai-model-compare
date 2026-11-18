// My usage choices and s-agent roles, read from the owner's Notion config page through the
// official API (NOTION_TOKEN, an integration the page is shared with). The page holds two
// JSON code blocks: the s-agent configuration (`roles`, model IDs) and My usage
// configuration (`daily`, `cliDefaults`, Gemini pick settings). Role names and description
// keys stay from the published file; only their models come from Notion.
const PAGE = "4118e936085b810891bdc1a77dd59b63"
const API = "https://api.notion.com/v1"
const BRANDS = { claude: "anth", codex: "oai", gemini: "gemini" }

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

const isText = (value) => typeof value === "string" && value.trim() !== ""

function choices(list, name) {
  if (!Array.isArray(list) || !list.length) throw new Error(`${name} must be a non-empty list`)
  for (const choice of list) {
    if (!isText(choice?.provider) || !isText(choice.model) || !isText(choice.effort)) {
      throw new Error(`every ${name} entry needs provider, model and effort`)
    }
  }
  return list.map(({ provider, model, label, effort }) => ({ provider, model, ...(isText(label) ? { label } : {}), effort }))
}

// Every block is validated before anything is returned, so a half-edited page changes nothing.
export function buildPersonal(blocks, previous) {
  const agent = blocks.find((block) => block?.roles)
  const usage = blocks.find((block) => block?.daily)
  if (!agent || !usage) throw new Error("Notion page needs both the S-Agent and My usage JSON blocks")
  const daily = choices(usage.daily, "daily")
  if (!daily.some((choice) => choice.provider === "gemini")) throw new Error("daily must include gemini")
  const roles = Object.fromEntries(Object.entries(previous.roles).map(([id, meta]) => {
    const models = Object.fromEntries(Object.entries(BRANDS).map(([provider, brand]) => {
      const choice = agent.roles[id]?.[provider]
      if (!isText(choice?.model) || !isText(choice.effort)) throw new Error(`role ${id} lacks ${provider} model or effort`)
      return [brand, [displayModel(choice.model), choice.effort]]
    }))
    return [id, { ...meta, models }]
  }))
  const excluded = usage.excludedGeminiPicks ?? []
  if (!Array.isArray(excluded) || !excluded.every(isText)) throw new Error("excludedGeminiPicks must be a list of model IDs")
  if (!isText(usage.optionalGeminiEffort)) throw new Error("optionalGeminiEffort is required")
  return {
    daily,
    cliDefaults: usage.cliDefaults === undefined ? [] : choices(usage.cliDefaults, "cliDefaults"),
    roles,
    excludedGeminiPicks: excluded,
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
