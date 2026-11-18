import { readFileSync } from "node:fs"

// Facts supplied and checked on 2026-11-13; benchmark figures come only from loaders.
export const GEMINI_MODELS = JSON.parse(readFileSync(new URL("../public/data/gemini-models.json", import.meta.url), "utf8")).models

// Match display names and API IDs, including source-specific punctuation/build suffixes.
export function modelName(name) {
  return name.replace(/^(?:google[ /-]+)?gemini[ ._-]*4[ ._-]*hydrogen(?:[ ._-](?:preview|\d{4}(?:[ ._-]\d{2}){0,2}))?(?=$|[ (]|-(?:low|medium|high|xhigh)$)/i, "Gemini 4 Hydrogen")
    .replace(/^(Gemini 4 Hydrogen)-(low|medium|high|xhigh)$/i,
      (_, model, effort) => `${model} ${effort.toLowerCase() === "xhigh" ? "Extra High" : effort[0].toUpperCase() + effort.slice(1).toLowerCase()}`)
}

export function hydrogenCostPerTask({ input, cachedInput = 0, output, tasks = 1 }) {
  // Output includes thinking. Total tokens alone cannot identify the input/output split.
  if (![input, cachedInput, output].every((n) => Number.isFinite(n) && n >= 0)
      || cachedInput > input || !Number.isFinite(tasks) || tasks <= 0) return null
  const price = GEMINI_MODELS.find((model) => model.id === "gemini-4-hydrogen").pricePerMillionTokens
  return ((input - cachedInput) * price.input + cachedInput * price.cachedInput
    + output * price.outputIncludingThinking) / 1e6 / tasks
}

// AA prices each task at the tariff it lists, which may be introductory. Charts use list
// prices, so each billed part is rescaled to the catalog rate; promotions stay in the notes.
export function listPriceAaCost(variant, modelName) {
  const cost = variant.intelligenceIndexCostPerTask?.cost
  const list = GEMINI_MODELS.find((model) => model.model === modelName)?.pricePerMillionTokens
  if (!list) return cost?.total ?? null
  if (!cost) return null
  const ratio = (part, listed, rate) => (part > 0 ? (listed > 0 ? part * rate / listed : NaN) : 0)
  // Cache writes are billed at the input rate.
  const total = ratio(cost.nonCacheInput, variant.price1mInputTokens, list.input)
    + ratio(cost.cacheWrite, variant.price1mInputTokens, list.input)
    + ratio(cost.cacheRead, variant.cacheHitPrice, list.cachedInput)
    + ratio(cost.output, variant.price1mOutputTokens, list.outputIncludingThinking)
  return Number.isFinite(total) ? total : null
}
