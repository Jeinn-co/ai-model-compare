import { useState } from "react"
import { providerById, type ProviderId, type Row } from "./bench"
import type { Translate } from "./language"

// shortcut: typed in by hand from each vendor's own pages (no feed publishes these);
// re-check every row against SOURCES and update CHECKED whenever a vendor changes a price.
const CHECKED = "2026-11-12"

type Text = readonly [english: string, chinese: string]
// A guidance line; `strong` marks the model each vendor points to first.
type Line = readonly [english: string, chinese: string, strong?: boolean]

// One line per model, so each reads on its own.
const GUIDANCE: readonly { provider: ProviderId; lines: readonly Line[] }[] = [
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
        "Gemini 4 Hydrogen: recommended upgrade from Gemini 3.8 Flash. low / medium / high (default) / xhigh. $1.50 input / $7.50 output per 1M tokens; output includes thinking.",
        "Gemini 4 Hydrogen：Gemini 3.8 Flash 的建議升級版。low / medium / high（預設）/ xhigh。每百萬 token 輸入 $1.50、輸出 $7.50，輸出含 thinking。",
      ],
      [
        "Gemini 4 Carbon: low / medium (default) / high. Antigravity: Google AI Ultra or Enterprise.",
        "Gemini 4 Carbon：low / medium（預設）/ high。Antigravity 限 Google AI Ultra 或 Enterprise。",
      ],
      [
        "Gemini 4 Argon: low / medium (default) / high. Antigravity: paid Google AI Pro (†), Ultra or Enterprise.",
        "Gemini 4 Argon：low / medium（預設）/ high。Antigravity 付費 Google AI Pro（†）、Ultra、Enterprise 可用。",
      ],
      [
        "Gemini 3.8 Flash: low / medium / high. Google recommends upgrading to Hydrogen.",
        "Gemini 3.8 Flash：low / medium / high。Google 建議升級至 Hydrogen。",
      ],
      [
        "Hydrogen access (2026-11-13 snapshot): Gemini API free tier with rate limits; Antigravity requires paid Google AI Pro or Ultra. The Antigravity models page does not yet list Hydrogen. API access and subscription access are separate.",
        "Hydrogen 資格（2026-11-13 快照）：Gemini API 免費層可用，有 rate limit；Antigravity 限付費 Google AI Pro 或 Ultra，模型頁尚未列出。API 與訂閱使用資格分開看。",
      ],
    ],
  },
]

// Which models each vendor itself names for agentic coding, one line per vendor.
const NAMED: readonly Text[] = [
  ["Anthropic: Opus 5.5 (long-running agentic coding) and Fable 5.2 (long-horizon agentic work)", "Anthropic：Opus 5.5（長時間 agent 型程式）與 Fable 5.2（長時程 agent 工作）"],
  ["OpenAI: none named; Astra and Sol are described for complex code work", "OpenAI：沒有直接點名；Astra 與 Sol 的描述是複雜程式工作"],
  [
    "Google: Gemini 4 Hydrogen is the recommended upgrade from Gemini 3.8 Flash",
    "Google：Gemini 4 Hydrogen 是 Gemini 3.8 Flash 的建議升級版",
  ],
]

// Opus 5.5's levels from Anthropic's effort table; `strong` marks high, the level used day to day.
const OPUS_LEVELS: readonly Line[] = [
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

const EFFORT: readonly Line[] = [
  ["Effort sets how much work goes into the whole response, thinking and tool calls included.", "effort 決定整個回應投入多少，包含思考與工具呼叫。"],
  ["Lower effort: fewer, combined tool calls; acts without preamble; confirms tersely.", "effort 越低：工具呼叫越少、會合併操作；不先說明就動手；完成後簡短確認。"],
  ["Higher effort: more tool calls; explains the plan first; summarizes changes in detail.", "effort 越高：工具呼叫越多；動手前先說明計畫；詳細總結改動。"],
  ["Effort names do not mean the same amount of thinking across models.", "同一個 effort 名稱，在不同模型代表的思考量不同。"],
]

const NOT_STATED: Text = ["Not stated", "未標明"]

type Price = { provider: ProviderId; model: string; input: string; output: string; effort: string | Text; note?: Text }

const UNVERIFIED_PRICE: Text = ["Price not supplied in this update; left blank", "本次更新未提供價格，留白"]

const PRICES: readonly Price[] = [
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
  { provider: "gemini", model: "Gemini 4 Hydrogen", input: "$1.50", output: "$7.50", effort: "high",
    note: ["Cached input $0.075 / 1M; output includes thinking; uniform context pricing", "快取輸入 $0.075 / 百萬；輸出含 thinking；整個 context 同費率"] },
  { provider: "gemini", model: "Gemini 4 Carbon", input: "—", output: "—", effort: "medium", note: UNVERIFIED_PRICE },
  { provider: "gemini", model: "Gemini 4 Argon", input: "—", output: "—", effort: "medium", note: UNVERIFIED_PRICE },
  { provider: "gemini", model: "Gemini 3.8 Flash", input: "—", output: "—", effort: NOT_STATED,
    note: ["Price and API default effort not supplied in this update", "本次更新未提供價格與 API 預設 effort"] },
]

const SOURCES: readonly { name: Text; url: string }[] = [
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

function Swatch({ provider }: { provider: ProviderId }) {
  return <span className="swatch" style={{ background: providerById(provider).color }} />
}

// Layout only, the text is shown unchanged: the part up to the first colon is styled as the name,
// and dollar amounts are set in the mono face used for numbers elsewhere.
function Rich({ text }: { text: string }) {
  const cut = text.search(/[:：]/) + 1
  const money = (part: string) =>
    part.split(/(\$[\d.]+)/).map((bit, i) => (i % 2 ? <span key={i} className="guidance-money">{bit}</span> : bit))
  return cut ? (
    <>
      <span className="guidance-lead">{text.slice(0, cut)}</span>
      {money(text.slice(cut))}
    </>
  ) : (
    <>{money(text)}</>
  )
}

// One list row per line; a `strong` line keeps its bold and gets the highlighted row.
function Rows({ lines, t }: { lines: readonly Line[]; t: Translate }) {
  return (
    <ul className="guidance-rows">
      {lines.map((line) => {
        const text = <Rich text={t(line[0], line[1])} />
        return (
          <li key={line[0]} className={line[2] ? "guidance-pick" : undefined}>
            {line[2] ? <strong>{text}</strong> : text}
          </li>
        )
      })}
    </ul>
  )
}

// What each vendor's own pages say about choosing a model, plus standard API prices and the
// API's default effort. Like the LMArena list, it is not filtered by the chart chips.
// Sortable price-table columns. A first click sorts prices cheapest first and the score highest
// first, a second click reverses, a third returns to the vendor order below.
type SortKey = "input" | "output" | "score"
type Sort = { key: SortKey; dir: 1 | -1 } | null

// The AA rows name Claude models without "Claude " ("Opus 5.5"); the others match as written.
const aaName = (model: string) => model.replace(/^Claude /, "")

export default function Guidance({ t, aaRows }: { t: Translate; aaRows: readonly Row[] }) {
  const say = (text: Text) => t(text[0], text[1])
  const [sort, setSort] = useState<Sort>(null)
  // Third-party score at effort high, the level used day to day; null until AA has loaded.
  const scoreOf = (model: string) =>
    aaRows.find((row) => row.model === aaName(model) && row.effort === "High")?.score ?? null
  const value = (row: Price, key: SortKey) =>
    key === "score" ? scoreOf(row.model) : row[key] === "—" ? null : Number(row[key].replace("$", ""))
  const shown = sort
    ? [...PRICES].sort((a, b) => {
        const x = value(a, sort.key), y = value(b, sort.key)
        if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1  // missing values last
        return sort.dir * (x - y)
      })
    : PRICES
  const first = (key: SortKey): 1 | -1 => (key === "score" ? -1 : 1)
  const click = (key: SortKey) =>
    setSort((current) =>
      current?.key !== key ? { key, dir: first(key) } : current.dir === first(key) ? { key, dir: (-first(key)) as 1 | -1 } : null,
    )
  const header = (key: SortKey, label: string) => {
    const on = sort?.key === key
    const arrow = on ? (sort.dir === 1 ? "↑" : "↓") : "↕"
    return (
      <th className="num" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" className={on ? "sort right guidance-sort on" : "sort right guidance-sort"} onClick={() => click(key)}>
          {label} <span aria-hidden="true">{arrow}</span>
        </button>
      </th>
    )
  }

  return (
    <section className="arena guidance" aria-labelledby="guidance-title">
      <div className="arena-head">
        <div>
          <p className="eyebrow">{t("Vendor docs", "官方文件")}</p>
          <h2 id="guidance-title">{t("Official guidance", "官方說法")}</h2>
          <p className="arena-note">
            {t(`Gemini model information updated 2026-11-13 from the supplied facts. Other vendor text retains its ${CHECKED} check date. Prices are per 1M input/output tokens; unverified Gemini prices stay blank.`,
              `Gemini 模型資訊依提供資料更新至 2026-11-13；其他廠商文案保留 ${CHECKED} 核對日。價格為每百萬輸入／輸出 token；本次未提供的 Gemini 價格留白。`)}
          </p>
        </div>
      </div>

      <div className="guidance-effort">
        <div className="guidance-card">
          <h3 className="guidance-label">{t("Anthropic on effort", "Anthropic 對 effort 的說明")}</h3>
          <Rows lines={EFFORT} t={t} />
        </div>
        <div className="guidance-card">
          <h3 className="guidance-label">{t("Opus 5.5 effort levels", "Opus 5.5 的 effort 等級")}</h3>
          <Rows lines={OPUS_LEVELS} t={t} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="guidance-table">
          <thead>
            <tr>
              <th>CLI</th>
              <th>{t("Official guidance", "官方說法")}</th>
            </tr>
          </thead>
          <tbody>
            {GUIDANCE.map((row) => (
              <tr key={row.provider}>
                <td className="guidance-cli">
                  <span className="arena-model">
                    <Swatch provider={row.provider} />
                    {providerById(row.provider).name}
                  </span>
                </td>
                <td className="guidance-cell">
                  <Rows lines={row.lines} t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="guidance-card guidance-named">
        <h3 className="guidance-label">{t("Named for agentic coding by the vendor", "各家明確點名適合 agent 型程式的模型")}</h3>
        <Rows lines={NAMED} t={t} />
      </div>

      <div className="guidance-sortbar">
        <span>
          {sort
            ? t(
                `Sorted by ${{ input: "input price", output: "output price", score: "AA score" }[sort.key]}, ${sort.dir === 1 ? "low to high" : "high to low"}. Click the header again to reverse, a third time for the original order.`,
                `依${{ input: "輸入價格", output: "輸出價格", score: "AA 分數" }[sort.key]}排序，${sort.dir === 1 ? "由低到高" : "由高到低"}。再點一次欄名可反向，點第三次回到原本順序。`,
              )
            : t("Vendor order. Click a price or score header to sort.", "原本的廠商順序。點價格或分數的欄名即可排序。")}
        </span>
      </div>

      <div className="table-wrap guidance-prices">
        <table>
          <thead>
            <tr>
              <th>{t("Model", "模型")}</th>
              {header("input", t("Input / 1M tokens", "輸入／每百萬 token"))}
              {header("output", t("Output / 1M tokens", "輸出／每百萬 token"))}
              {header("score", t("AA score (high)", "AA 分數（high）"))}
              <th>{t("API default effort", "API 預設 effort")}</th>
              <th>{t("Note", "備註")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.model}>
                <td>
                  <span className="arena-model">
                    <Swatch provider={row.provider} />
                    {row.model}
                  </span>
                </td>
                <td className="num">{row.input}</td>
                <td className="num">{row.output}</td>
                <td className="num">{scoreOf(row.model)?.toFixed(1) ?? "—"}</td>
                <td>{typeof row.effort === "string" ? row.effort : say(row.effort)}</td>
                <td className="minor">{row.note ? say(row.note) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="readout">
        <span>{t("Standard API prices in US dollars, not subscription quota.", "標準 API 價格（美元），不是訂閱額度。")}</span>
        <span>
          {t("AA score: Artificial Analysis Intelligence Index at effort high, a third-party benchmark, not vendor data.",
            "AA 分數：Artificial Analysis 智力指數（effort = high），第三方 benchmark，不是官方資料。")}
        </span>
        <span>{t("Hydrogen API (released 2026-11-12): 1,048,576 tokens shared by input, thinking and output; synchronous output limit 65,536. No explicit caching. temperature, top_p and top_k are ignored; minimal returns an error.",
          "Hydrogen API（2026-11-12 發布）：input、thinking、output 共用 1,048,576 tokens；同步輸出上限 65,536。不支援 explicit caching；temperature、top_p、top_k 會被忽略；minimal 會報錯。")}</span>
        <span>{t("Antigravity removes Claude Sonnet 4.6, Claude Opus 4.6 and GPT-OSS-120b on 2026-11-18. Model access depends on the account.",
          "Antigravity 將於 2026-11-18 移除 Claude Sonnet 4.6、Claude Opus 4.6、GPT-OSS-120b。實際模型使用權仍依帳號而定。")}</span>
        {SOURCES.map((source) => (
          <a key={source.url} href={source.url}>
            {say(source.name)}
          </a>
        ))}
      </p>
    </section>
  )
}
