import { useState } from "react"
import { providerById, type ProviderId, type Row } from "./bench"
import type { Translate } from "./language"

import { GUIDANCE, OPUS_LEVELS, EFFORT, PRICES, SOURCES, SELECTION_POLICY, type Text, type Line, type Price } from "./guidance-data"

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
        const text = <Rich text={line[t.language === "zh" ? 1 : 0]} />
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
  const say = (text: Text) => text[t.language === "zh" ? 1 : 0]
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
          <p className="eyebrow">{t("vendor_docs")}</p>
          <h2 id="guidance-title">{t("official_guidance")}</h2>
          <p className="arena-note">
            {t("official_model_guidance_thinking_levels_and_api_prices_per_1m")}
          </p>
        </div>
      </div>

      <p className="arena-note">
        {say(SELECTION_POLICY)}
      </p>

      <div className="guidance-effort">
        <div className="guidance-card">
          <h3 className="guidance-label">{t("anthropic_on_effort")}</h3>
          <Rows lines={EFFORT} t={t} />
        </div>
        <div className="guidance-card">
          <h3 className="guidance-label">{t("opus_5_5_effort_levels")}</h3>
          <Rows lines={OPUS_LEVELS} t={t} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="guidance-table">
          <thead>
            <tr>
              <th>CLI</th>
              <th>{t("official_guidance")}</th>
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
                      <a href="https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen#choosing-between-models">{t("google_s_model_selection_guide")}</a>
                      {" · "}
                      <a href="https://antigravity.google/docs/models">{t("antigravity_selection_and_access")}</a>
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="guidance-sortbar">
        <span>
          {sort
            ? t("guidance_sorted", { field: t(`sort_${sort.key}`),
                direction: t(sort.dir === 1 ? "sort_ascending" : "sort_descending") })
            : t("vendor_order_click_a_price_or_score_header_to_sort")}
        </span>
      </div>

      <div className="table-wrap guidance-prices">
        <table>
          <thead>
            <tr>
              <th>{t("model")}</th>
              {header("input", t("input_1m_tokens"))}
              {header("output", t("output_1m_tokens"))}
              {header("score", t("aa_score_high"))}
              <th>{t("api_default_effort")}</th>
              <th>{t("note")}</th>
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
                <td style={{ whiteSpace: "pre-line" }}>{typeof row.effort === "string" ? row.effort : say(row.effort)}</td>
                <td className="minor">{row.note ? say(row.note) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="readout">
        <span>{t("standard_api_prices_in_us_dollars_not_subscription_quota")}</span>
        <span>
          {t("aa_score_artificial_analysis_intelligence_index_at_high_effort")}
        </span>
      </p>
      <details className="guidance-sources">
        <summary>{t("sources")}</summary>
        <div className="readout">
          {SOURCES.map((source) => (
            <a key={source.url} href={source.url}>{say(source.name)}</a>
          ))}
        </div>
      </details>
    </section>
  )
}
