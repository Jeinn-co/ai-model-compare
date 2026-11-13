import { useState } from "react"
import { providerById, type ProviderId, type Row } from "./bench"
import type { Translate } from "./language"

import { GUIDANCE, NAMED, OPUS_LEVELS, EFFORT, PRICES, SOURCES, API_NOTES, SELECTION_POLICY, type Text, type Line, type Price } from "./guidance-data"

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
            {t("Official model guidance, thinking levels and API prices per 1M tokens. Missing data is shown as —.",
              "模型官方定位、思考等級與每百萬 token 的 API 價格。缺少的資料以 — 表示。")}
          </p>
        </div>
      </div>

      <p className="arena-note">
        {say(SELECTION_POLICY)}
      </p>

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
                  {row.provider === "gemini" && (
                    <p className="minor">
                      <a href="https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen#choosing-between-models">{t("Google's model selection guide", "Google 模型選擇指南")}</a>
                      {" · "}
                      <a href="https://antigravity.google/docs/models">{t("Antigravity selection and access", "Antigravity 選型與資格")}</a>
                    </p>
                  )}
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
        {API_NOTES.map((note) => <span key={note[0]}>{say(note)}</span>)}
        {SOURCES.map((source) => (
          <a key={source.url} href={source.url}>
            {say(source.name)}
          </a>
        ))}
      </p>
    </section>
  )
}
