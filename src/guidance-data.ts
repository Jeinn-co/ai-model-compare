import type { ProviderId } from "./bench"
import catalog from "../public/data/gemini-models.json"

// shortcut: typed in by hand from each vendor's own pages (no feed publishes these);
// Re-check affected records against SOURCES when a vendor changes its model guidance or prices.

export type Text = readonly [english: string, chinese: string]
// A guidance line; `strong` marks the model each vendor points to first.
export type Line = readonly [english: string, chinese: string, strong?: boolean]

// One line per model, so each reads on its own.
export const GUIDANCE: readonly { provider: ProviderId; lines: readonly Line[] }[] = [
  {
    provider: "claude",
    lines: [
      ["Start most coding and knowledge work on Opus 5.5.", "多數程式與知識工作從 Opus 5.5 開始。"],
      [
        "Opus 5.5: strongest daily driver, for long-running agentic coding and knowledge work. $4 / $20",
        "Opus 5.5：最強的日常主力，定位是長時間的 agent 型程式與知識工作。$4 / $20",
        true,
      ],
      [
        "Fable 5.2: demanding reasoning and long-horizon agentic work; the most ambitious open-ended technical work. $8 / $40",
        "Fable 5.2：高難度推理與長時程 agent 工作；最有野心的開放式技術工作。$8 / $40",
      ],
      [
        "Sonnet 5.5: best combination of speed and intelligence. For agentic coding, medium for well-specified tasks, high for harder or longer ones. $2 / $10",
        "Sonnet 5.5：速度與智力的最佳組合。agent 型程式：規格明確的用 medium，較難或較長的用 high。$2 / $10",
      ],
      [
        "Haiku 5.5: high-volume, latency-sensitive tasks such as classification, extraction and routing. $0.10 / $0.50",
        "Haiku 5.5：大量、重視延遲的任務，例如分類、擷取、路由。$0.10 / $0.50",
      ],
    ],
  },
  {
    provider: "codex",
    lines: [
      [
        "No default named and no model labelled for agentic coding; without a model set, the client uses a recommended one.",
        "沒有指定預設，也沒有模型被標為適合 agent 型程式；未設定模型時，客戶端會用推薦模型。",
      ],
      ["GPT-6 Astra: most capable, for complex work across code, apps and research. $10 / $50", "GPT-6 Astra：最強，適合跨程式、app、研究的複雜工作。$10 / $50"],
      ["GPT-6.1 Sol: near Astra at a lower cost. $2 / $10", "GPT-6.1 Sol：接近 Astra，成本較低。$2 / $10", true],
      [
        "GPT-6.1 Terra: fast and efficient; visual reasoning, precise computer use and clear writing. $1 / $5",
        "GPT-6.1 Terra：快速有效率；視覺推理、精準的電腦操作與清楚的寫作。$1 / $5",
      ],
      [
        "GPT-6 Luna: lightweight; high-volume, narrowly scoped tasks such as summaries and extraction. $0.10 / $0.50",
        "GPT-6 Luna：輕量；大量、範圍窄的任務，例如摘要與擷取。$0.10 / $0.50",
      ],
    ],
  },
  {
    provider: "gemini",
    lines: [
      [
        "Antigravity: Google recommends Orchestrator for day-to-day development. Carbon or Argon plans and reviews; Hydrogen implements. Standalone models let you set thinking levels.",
        "Antigravity：Google 建議日常開發使用 Orchestrator，由 Carbon 或 Argon 規劃及審查、Hydrogen 實作。獨立模型可自行設定 thinking level。",
      ],
      ...catalog.models.map((model): Line => {
        const levels = model.efforts.map((level) => level === model.defaultEffort ? `${level} (default)` : level).join(" / ")
        const zhLevels = model.efforts.map((level) => level === model.defaultEffort ? `${level}（預設）` : level).join(" / ")
        const plans = model.antigravity?.restricted ? model.antigravity.plans.join(", ") : ""
        const access = plans ? ` Antigravity: ${plans}.` : ""
        const zhAccess = plans ? ` Antigravity：${plans}。` : ""
        return [`${model.model}: ${model.useCases[0]} ${levels}.${access}`, `${model.model}：${model.useCases[1]} ${zhLevels}。${zhAccess}`]
      }),
    ],
  },
]

// A named replacement supersedes its predecessor without changing the presentation.
const currentGemini = catalog.models.filter((model) =>
  !catalog.models.some((next) => next.recommendedUpgradeFrom === model.id))

// Which models each vendor itself names for agentic coding, one line per vendor.
export const NAMED: readonly Text[] = [
  ["Anthropic: Opus 5.5 (long-running agentic coding) and Fable 5.2 (long-horizon agentic work)", "Anthropic：Opus 5.5（長時間 agent 型程式）與 Fable 5.2（長時程 agent 工作）"],
  ["OpenAI: none named; Astra and Sol are described for complex code work", "OpenAI：沒有直接點名；Astra 與 Sol 的描述是複雜程式工作"],
  [
    "Google: " + currentGemini.map((model) => `${model.model}: ${model.useCases[0]}`).join(" "),
    "Google：" + currentGemini.map((model) => `${model.model}：${model.useCases[1]}`).join(" "),
  ],
]

// Opus 5.5's levels from Anthropic's effort table; `strong` marks high, the level used day to day.
export const OPUS_LEVELS: readonly Line[] = [
  [
    "low: most efficient; significant token savings with some capability reduction. For simpler tasks that need the best speed and lowest cost, such as subagents.",
    "low：最省；大幅節省 token，能力稍降。適合求速度與低成本的簡單任務，例如子 agent。",
  ],
  [
    "medium (API default, one level below Opus 5's high): balanced, with moderate token savings. For agentic tasks that balance speed, cost and performance.",
    "medium（API 預設，比 Opus 5 的 high 低一檔）：平衡，適度節省 token。適合兼顧速度、成本與表現的 agent 任務。",
  ],
  [
    "high: spends as many tokens as the task needs for excellent results. For complex reasoning, difficult coding problems and agentic tasks.",
    "high：任務需要多少 token 就用多少，求最好的結果。適合複雜推理、困難的程式問題、agent 任務。",
    true,
  ],
  [
    "xhigh: extended capability for long-horizon work. For long-running agentic and coding tasks (over 30 minutes) with token budgets in the millions.",
    "xhigh：長時程工作的延伸能力。適合超過 30 分鐘、token 預算以百萬計的 agent 與程式任務。",
  ],
  [
    "max: absolute maximum capability with no constraints on token spending. For tasks needing the deepest reasoning and most thorough analysis.",
    "max：不限 token 花費的最高能力。適合需要最深推理、最徹底分析的任務。",
  ],
]

export const EFFORT: readonly Line[] = [
  ["Effort sets how much work goes into the whole response, thinking and tool calls included.", "effort 決定整個回應投入多少，包含思考與工具呼叫。"],
  ["Lower effort: fewer, combined tool calls; acts without preamble; confirms tersely.", "effort 越低：工具呼叫越少、會合併操作；不先說明就動手；完成後簡短確認。"],
  ["Higher effort: more tool calls; explains the plan first; summarizes changes in detail.", "effort 越高：工具呼叫越多；動手前先說明計畫；詳細總結改動。"],
  ["Effort names do not mean the same amount of thinking across models.", "同一個 effort 名稱，在不同模型代表的思考量不同。"],
]

const NOT_STATED: Text = ["Not stated", "未標明"]

export type Price = { provider: ProviderId; model: string; input: string; output: string; effort: string | Text; note?: Text }

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
    note: ["Prompts up to 100K; $0.50 / $2.50 beyond", "100K 以內的 prompt；超過為 $0.50 / $2.50"],
  },
  { provider: "codex", model: "GPT-6 Astra", input: "$10", output: "$50", effort: NOT_STATED },
  { provider: "codex", model: "GPT-6.1 Sol", input: "$2", output: "$10", effort: "medium" },
  { provider: "codex", model: "GPT-6.1 Terra", input: "$1", output: "$5", effort: "medium" },
  { provider: "codex", model: "GPT-6 Luna", input: "$0.10", output: "$0.50", effort: "medium" },
  ...catalog.models.map((model): Price => {
    const price = model.pricePerMillionTokens
    return {
      provider: "gemini", model: model.model,
      input: price ? `$${price.input.toFixed(2)}` : "—",
      output: price ? `$${price.outputIncludingThinking.toFixed(2)}` : "—",
      effort: model.defaultEffort ?? NOT_STATED,
      note: [model.useCases[0] + (price ? ` Cached input $${price.cachedInput} / 1M; output includes thinking.` : " Price unavailable."),
        model.useCases[1] + (price ? ` 快取輸入 $${price.cachedInput}／百萬；輸出含 thinking。` : " 價格未提供。")],
    }
  }),
]

export const SOURCES: readonly { name: Text; url: string }[] = [
  { name: ["Gemini 4 Hydrogen", "Gemini 4 Hydrogen"], url: "https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen" },
  { name: ["Hydrogen in Antigravity", "Antigravity 的 Hydrogen"], url: "https://antigravity.google/blog/gemini-4-hydrogen-in-google-antigravity/" },
  { name: ["Anthropic model selection", "Anthropic 模型選擇"], url: "https://www.anthropic.com/claude-fable-and-mythos-5-2" },
  { name: ["Claude pricing", "Claude 定價"], url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { name: ["Claude effort", "Claude effort"], url: "https://platform.claude.com/docs/en/build-with-claude/effort" },
  { name: ["Codex models", "Codex 模型"], url: "https://learn.chatgpt.com/docs/models" },
  { name: ["GPT-6 Astra", "GPT-6 Astra"], url: "https://developers.openai.com/api/docs/models/gpt-6-astra" },
  { name: ["GPT-6.1 Sol", "GPT-6.1 Sol"], url: "https://developers.openai.com/api/docs/models/gpt-6.1-sol" },
  { name: ["GPT-6.1 Terra", "GPT-6.1 Terra"], url: "https://developers.openai.com/api/docs/models/gpt-6.1-terra" },
  { name: ["GPT-6 Luna", "GPT-6 Luna"], url: "https://developers.openai.com/api/docs/models/gpt-6-luna" },
  { name: ["Gemini API pricing", "Gemini API 定價"], url: "https://aistudio.google.com/docs/pricing" },
  { name: ["Gemini models", "Gemini 模型"], url: "https://aistudio.google.com/docs/latest-model" },
  {
    name: ["Introducing Gemini 4 Carbon", "Gemini 4 Carbon 發表"],
    url: "https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-carbon/",
  },
  {
    name: ["Gemini 4 Carbon available", "Gemini 4 Carbon 開放"],
    url: "https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-carbon-now-available/",
  },
  { name: ["Gemini 3.8 Flash", "Gemini 3.8 Flash"], url: "https://aistudio.google.com/docs/whats-new-gemini-3.8" },
  { name: ["Antigravity settings", "Antigravity 設定"], url: "https://antigravity.google/docs/settings/" },
  { name: ["Carbon access in Antigravity", "Antigravity 的 Carbon 使用資格"], url: "https://antigravity.google/blog/gemini-4-carbon-in-google-antigravity/" },
  { name: ["Antigravity model availability", "Antigravity 模型資格表"], url: "https://antigravity.google/docs/models" },
]


export const API_NOTES: readonly Text[] = [
  ["Hydrogen API (released 2026-11-12): 1,048,576 tokens shared by input, thinking and output; synchronous output limit 65,536. No explicit caching. temperature, top_p and top_k are ignored; minimal returns an error.", "Hydrogen API（2026-11-12 發布）：input、thinking、output 共用 1,048,576 tokens；同步輸出上限 65,536。不支援 explicit caching；temperature、top_p、top_k 會被忽略；minimal 會報錯。"],
  ["Antigravity removes Claude Sonnet 4.6, Claude Opus 4.6 and GPT-OSS-120b on 2026-11-18. Model access depends on the account.", "Antigravity 將於 2026-11-18 移除 Claude Sonnet 4.6、Claude Opus 4.6、GPT-OSS-120b。實際模型使用權仍依帳號而定。"],
]

export const SELECTION_POLICY: Text = [
  "My Gemini choices: Hydrogen / high for routine work; xhigh when high is insufficient for complex reasoning. Carbon / high for security, prioritizing safety and correctness. Argon is excluded because of cost.",
  "我的 Gemini 用法：日常工作用 Hydrogen / high；複雜推理在 high 不足時升 xhigh。安全工作用 Carbon / high，以安全性與正確性優先。Argon 因成本不納入選型。",
]
