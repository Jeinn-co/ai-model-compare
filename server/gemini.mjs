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

export function hydrogenAaCost(variant) {
  const price = GEMINI_MODELS.find((model) => model.id === "gemini-4-hydrogen").pricePerMillionTokens
  // AA already computes per-task costs. Accept them only at the supplied API rates.
  if (variant.price1mInputTokens !== price.input || variant.price1mOutputTokens !== price.outputIncludingThinking
      || variant.cacheHitPrice !== price.cachedInput) return null
  return variant.intelligenceIndexCostPerTask?.cost?.total ?? null
}
