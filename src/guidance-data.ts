import { textPair } from "./language"
import type { ProviderId } from "./bench"
import catalog from "../public/data/gemini-models.json"
import personal from "../public/data/personal-choices.json"

// shortcut: typed in by hand from each vendor's own pages (no feed publishes these);
// Re-check affected records against SOURCES when a vendor changes its model guidance or prices.

export type Text = readonly [english: string, chinese: string]
// A guidance line; `strong` marks the model each vendor points to first.
export type Line = readonly [english: string, chinese: string, strong?: boolean]

// Promotional rates share the same catalog as regular API prices.
const promotion = (model: (typeof catalog.models)[number]): Text => {
  const price = model.introductoryPricePerMillionTokens
  if (!price) return ["", ""]
  const rates = `$${price.input.toFixed(2)} / $${price.outputIncludingThinking.toFixed(2)}`
  const halfPrice = price.input === model.pricePerMillionTokens.input / 2
    && price.outputIncludingThinking === model.pricePerMillionTokens.outputIncludingThinking / 2
  return textPair(halfPrice ? "promotion_half" : "promotion_rates", { rates, date: price.through })
}

// One line per model, so each reads on its own.
export const GUIDANCE: readonly { provider: ProviderId; lines: readonly Line[] }[] = [
  {
    provider: "claude",
    lines: [
      textPair("guidance_start_most_coding_and_knowledge_work_on_opus_5_5"),
      textPair("guidance_fable_5_2_demanding_reasoning_and_long_horizon_agentic_work"),
      [...textPair("guidance_opus_5_5_strongest_daily_driver_for_long_running_agentic"), true],
      textPair("guidance_sonnet_5_5_best_combination_of_speed_and_intelligence_for"),
      textPair("guidance_haiku_5_5_high_volume_latency_sensitive_tasks_such_as"),
    ],
  },
  {
    provider: "codex",
    lines: [
      textPair("guidance_no_default_named_and_no_model_labelled_for_agentic_coding"),
      textPair("guidance_gpt_6_astra_most_capable_for_complex_work_across_code"),
      [...textPair("guidance_gpt_6_1_sol_near_astra_at_a_lower_cost"), true],
      textPair("guidance_gpt_6_1_terra_fast_and_efficient_visual_reasoning_precise"),
      textPair("guidance_gpt_6_luna_lightweight_high_volume_narrowly_scoped_tasks_such"),
    ],
  },
  {
    provider: "gemini",
    lines: [
      textPair("guidance_antigravity_google_recommends_orchestrator_for_day_to_day_development_carbon"),
      ...catalog.models.map((model): Line => {
        const price = model.pricePerMillionTokens
        const amount = price ? ` $${price.input.toFixed(2)} / $${price.outputIncludingThinking.toFixed(2)}` : ""
        const plans = model.antigravity?.restricted ? model.antigravity.plans.join(", ") : ""
        const access = plans ? textPair("gemini_access", { plans }) : ["", ""]
        const description = textPair("gemini_description",
          { model: model.model, description: model.useCases[0], amount, access: access[0] },
          { model: model.model, description: model.useCases[1], amount, access: access[1] })
        return [...description, model.id === "gemini-4-hydrogen"]
      }),
    ],
  },
]

// Opus 5.5's levels from Anthropic's effort table; `strong` marks high, the level used day to day.
export const OPUS_LEVELS: readonly Line[] = [
  textPair("guidance_low_most_efficient_significant_token_savings_with_some_capability_reduction"),
  textPair("guidance_medium_api_default_one_level_below_opus_5_s_high"),
  [...textPair("guidance_high_spends_as_many_tokens_as_the_task_needs_for"), true],
  textPair("guidance_xhigh_extended_capability_for_long_horizon_work_for_long_running"),
  textPair("guidance_max_absolute_maximum_capability_with_no_constraints_on_token_spending"),
]

export const EFFORT: readonly Line[] = [
  textPair("guidance_effort_sets_how_much_work_goes_into_the_whole_response"),
  textPair("guidance_lower_effort_fewer_combined_tool_calls_acts_without_preamble_confirms"),
  textPair("guidance_higher_effort_more_tool_calls_explains_the_plan_first_summarizes"),
  textPair("guidance_effort_names_do_not_mean_the_same_amount_of_thinking"),
]

const NOT_STATED: Text = textPair("guidance_not_stated")

// chartEffort: the effort the chart rings when the table shows text instead of an official default.
export type Price = { provider: ProviderId; model: string; input: string; output: string; effort: string | Text; chartEffort?: string; note?: Text }

export const PRICES: readonly Price[] = [
  { provider: "claude", model: "Claude Fable 5.2", input: "$8", output: "$40", effort: "high" },
  { provider: "claude", model: "Claude Opus 5.5", input: "$4", output: "$20", effort: "medium" },
  { provider: "claude", model: "Claude Sonnet 5.5", input: "$2", output: "$10", effort: "high" },
  {
    provider: "claude",
    model: "Claude Haiku 5.5",
    input: "$0.10",
    output: "$0.50",
    effort: "medium",
    note: textPair("guidance_prompts_up_to_100k_cost_0_50_cost_2_50"),
  },
  {
    provider: "codex", model: "GPT-6 Astra", input: "$10", output: "$50",
    effort: textPair("guidance_not_given_estimated_medium"), chartEffort: "medium",
  },
  { provider: "codex", model: "GPT-6.1 Sol", input: "$2", output: "$10", effort: "medium" },
  { provider: "codex", model: "GPT-6.1 Terra", input: "$1", output: "$5", effort: "medium" },
  { provider: "codex", model: "GPT-6 Luna", input: "$0.10", output: "$0.50", effort: "medium" },
  ...catalog.models.map((model): Price => {
    const price = model.pricePerMillionTokens
    const promo = promotion(model)
    return {
      provider: "gemini", model: model.model,
      input: price ? `$${price.input.toFixed(2)}` : "—",
      output: price ? `$${price.outputIncludingThinking.toFixed(2)}` : "—",
      effort: model.defaultEffort ?? NOT_STATED,
      note: promo[0] ? [promo[0].trim(), promo[1].trim()] : undefined,
    }
  }),
]

// Confirmed My usage choices, independent of dispatch options and API defaults.
export const DAILY_CHOICES: readonly { model: string; effort: string }[] =
  personal.daily.map(({ model, effort }) => ({ model, effort }))

const normalizeEffort = (effort: string | null) => effort?.toLowerCase().replace(/extra[ -]?high/, "xhigh")

export function isDailyChoice(model: string, effort: string | null): boolean {
  return DAILY_CHOICES.some((choice) => choice.model === model && normalizeEffort(choice.effort) === normalizeEffort(effort))
}

// The chart and the price table share these official API defaults.
export function isApiDefaultEffort(model: string, effort: string | null): boolean {
  const price = PRICES.find((row) => row.model.replace(/^Claude /, "") === model)
  const configured = price?.chartEffort ?? price?.effort
  return typeof configured === "string" && normalizeEffort(effort) === normalizeEffort(configured)
}

export const SOURCES: readonly { name: Text; url: string }[] = [
  { name: textPair("guidance_gemini_api_pricing"), url: "https://aistudio.google.com/docs/pricing" },
  { name: textPair("guidance_carbon_compared_with_argon"), url: "https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-carbon/" },
  { name: textPair("guidance_gemini_4_hydrogen"), url: "https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen" },
  { name: textPair("guidance_hydrogen_in_antigravity"), url: "https://antigravity.google/blog/gemini-4-hydrogen-in-google-antigravity/" },
  { name: textPair("guidance_anthropic_model_selection"), url: "https://www.anthropic.com/claude-fable-and-mythos-5-2" },
  { name: textPair("guidance_claude_pricing"), url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { name: textPair("guidance_claude_effort"), url: "https://platform.claude.com/docs/en/build-with-claude/effort" },
  { name: textPair("guidance_codex_models"), url: "https://learn.chatgpt.com/docs/models" },
  { name: textPair("guidance_gpt_6_astra"), url: "https://developers.openai.com/api/docs/models/gpt-6-astra" },
  { name: textPair("guidance_gpt_6_1_sol"), url: "https://developers.openai.com/api/docs/models/gpt-6.1-sol" },
  { name: textPair("guidance_gpt_6_1_terra"), url: "https://developers.openai.com/api/docs/models/gpt-6.1-terra" },
  { name: textPair("guidance_gpt_6_luna"), url: "https://developers.openai.com/api/docs/models/gpt-6-luna" },
  { name: textPair("guidance_gemini_models"), url: "https://aistudio.google.com/docs/latest-model" },
  {
    name: textPair("guidance_gemini_4_carbon_available"),
    url: "https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-carbon-now-available/",
  },
  { name: textPair("guidance_gemini_3_8_flash"), url: "https://aistudio.google.com/docs/whats-new-gemini-3.8" },
  { name: textPair("guidance_antigravity_settings"), url: "https://antigravity.google/docs/settings/" },
  { name: textPair("guidance_carbon_access_in_antigravity"), url: "https://antigravity.google/blog/gemini-4-carbon-in-google-antigravity/" },
  { name: textPair("guidance_antigravity_model_availability"), url: "https://antigravity.google/docs/models" },
]


const dailyGemini = personal.daily.find((choice) => choice.provider === "gemini")
if (!dailyGemini) throw new Error("personal-choices.json must define the Gemini daily choice")
const excludedGemini = catalog.models.filter((model) => personal.excludedGeminiPicks.includes(model.id))
export const SELECTION_POLICY: Text = textPair("gemini_policy", {
  daily: `${dailyGemini.model} / ${dailyGemini.effort}`,
  security: personal.roles.security.models.gemini.join(" / "),
  optional: personal.optionalGeminiEffort,
  excluded: excludedGemini.map((model) => model.model).join(", "),
})
