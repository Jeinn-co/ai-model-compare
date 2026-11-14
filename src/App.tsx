import { useEffect, useMemo, useState } from "react"
import {
  APP_VERSION,
  REPO_URL,
  SOURCES,
  SOURCE_AXES,
  Y_AXES,
  defaultTicked,
  formatCost,
  formatLatency,
  formatSteps,
  formatTokens,
  formatScore,
  formatSpeed,
  formatVerbosity,
  modelLine,
  previousGenerations,
  sourceMeta,
  yValue,
  type ProviderId,
  type Row,
  type SourceId,
  type YAxis,
} from "./bench"
import { createTranslator, initialLanguage, LANGUAGE_KEY, type Language } from "./language"
import Arena from "./Arena"
import Guidance from "./Guidance"
import Chart from "./Chart"
import Legend from "./Legend"

function formatFetchedAt(value: string) {
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

type Loaded = { rows: Row[]; fetchedAt: string | null; version: string | null }

const NO_ROWS: Row[] = []

function initialSource(): SourceId {
  const source = new URLSearchParams(window.location.search).get("source")
  return source && source in SOURCES ? (source as SourceId) : "aa"
}

function initialYAxis(): YAxis {
  const y = new URLSearchParams(window.location.search).get("y")
  return SOURCE_AXES[initialSource()].includes(y as YAxis) ? (y as YAxis) : "score"
}

// Chip switches and menu ticks are remembered in this browser only. Ticks are kept per
// source, since each lists different models; `seen` marks the models already given a
// default, so a model that shows up later starts unticked. Storage can be missing or
// blocked (private window, preview), so every access is guarded.
const STORAGE_KEY = "ai-model-compare:visibility:v2"

type Ticks = { hidden: ReadonlySet<string>; seen: ReadonlySet<string> }
type PerSource = Record<SourceId, Ticks>

const EMPTY: Ticks = { hidden: new Set(), seen: new Set() }

function loadVisibility(): { providers: ProviderId[]; perSource: PerSource } {
  const perSource: PerSource = { aa: EMPTY, cursorbench: EMPTY, tbench: EMPTY, arc: EMPTY }
  try {
    const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")
    for (const id of Object.keys(perSource) as SourceId[]) {
      const saved = data.sources?.[id]
      if (Array.isArray(saved?.hidden) && Array.isArray(saved?.seen)) {
        perSource[id] = { hidden: new Set(saved.hidden), seen: new Set(saved.seen) }
      }
    }
    return { providers: Array.isArray(data.providers) ? data.providers : [], perSource }
  } catch {
    return { providers: [], perSource }
  }
}

function saveVisibility(providers: ReadonlySet<ProviderId>, perSource: PerSource) {
  try {
    const sources = Object.fromEntries(
      Object.entries(perSource).map(([id, ticks]) => [id, { hidden: [...ticks.hidden], seen: [...ticks.seen] }]),
    )
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ providers: [...providers], sources }))
  } catch {
    // Not remembered this time; the page still works.
  }
}

export default function App() {
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const t = useMemo(() => createTranslator(language), [language])
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-Hant" : "en"
    try { localStorage.setItem(LANGUAGE_KEY, language) } catch { /* Storage is optional. */ }
  }, [language])
  const [source, setSource] = useState<SourceId>(initialSource)
  const [yAxis, setYAxis] = useState<YAxis>(initialYAxis)
  const [hidden, setHidden] = useState<ReadonlySet<ProviderId>>(() => new Set(loadVisibility().providers))
  const [perSource, setPerSource] = useState<PerSource>(() => loadVisibility().perSource)
  const hiddenModels = perSource[source].hidden

  useEffect(() => saveVisibility(hidden, perSource), [hidden, perSource])
  // Every source is fetched up front and kept, so switching shows the other one at once
  // instead of dropping the chart for a loading line.
  const [loaded, setLoaded] = useState<Partial<Record<SourceId, Loaded>>>({})
  const [errors, setErrors] = useState<Partial<Record<SourceId, string>>>({})
  const rows = loaded[source]?.rows ?? NO_ROWS
  const fetchedAt = loaded[source]?.fetchedAt ?? null
  const version = loaded[source]?.version ?? null
  const error = loaded[source] ? null : (errors[source] ?? null)
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)

  useEffect(() => {
    if (!pinned) return
    const clear = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(null)
    }
    window.addEventListener("keydown", clear)
    return () => window.removeEventListener("keydown", clear)
  }, [pinned])

  useEffect(() => {
    const controller = new AbortController()
    for (const id of Object.keys(SOURCES) as SourceId[]) {
      // The dev server answers live; the published site reads the snapshot the GitHub Pages
      // workflow writes every six hours.
      const url = import.meta.env.DEV ? `/api/bench?source=${id}` : `${import.meta.env.BASE_URL}data/${id}.json`
      fetch(url, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json()) as {
            rows?: Row[]
            changed?: boolean
            error?: string
            fetchedAt?: string
            version?: string | null
          }
          if (!response.ok || !body.rows?.length) throw new Error(body.error ?? String(response.status))
          const next = { rows: body.rows, fetchedAt: body.fetchedAt ?? null, version: body.version ?? null }
          setLoaded((current) => ({ ...current, [id]: body.changed === false && current[id] ? current[id] : next }))
          setErrors((current) => ({ ...current, [id]: undefined }))
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return
          setErrors((current) => ({ ...current, [id]: reason instanceof Error ? reason.message : "Failed to load" }))
        })
    }
    return () => controller.abort()
  }, [])

  // A model this source has not shown before gets its default tick once. A new default
  // (Opus 5.6 arriving) is ticked and the older versions of its line are unticked.
  useEffect(() => {
    if (rows.length === 0) return
    setPerSource((current) => {
      const ticks = current[source]
      const models = [...new Set(rows.map((row) => row.model))]
      const unseen = models.filter((model) => !ticks.seen.has(model))
      if (unseen.length === 0) return current
      const ticked = defaultTicked(rows)
      const newLines = new Set(unseen.filter((model) => ticked.has(model)).map((model) => modelLine(model).line))
      const replaced = models.filter(
        (model) => ticks.seen.has(model) && !ticked.has(model) && newLines.has(modelLine(model).line),
      )
      return {
        ...current,
        [source]: {
          hidden: new Set([...ticks.hidden, ...replaced, ...unseen.filter((model) => !ticked.has(model))]),
          seen: new Set([...ticks.seen, ...unseen]),
        },
      }
    })
  }, [rows, source])

  const writeUrl = (nextSource: SourceId, nextY: YAxis) => {
    const url = new URL(window.location.href)
    if (nextSource === "aa") url.searchParams.delete("source")
    else url.searchParams.set("source", nextSource)
    if (nextY !== "score") url.searchParams.set("y", nextY)
    else url.searchParams.delete("y")
    window.history.replaceState(null, "", url)
  }

  const pickSource = (next: SourceId) => {
    if (next === source) return
    const nextY = SOURCE_AXES[next].includes(yAxis) ? yAxis : "score"
    writeUrl(next, nextY)
    setPinned(null)
    setHover(null)
    setSource(next)
    setYAxis(nextY)
  }

  const pickYAxis = (next: YAxis) => {
    if (next === yAxis) return
    writeUrl(source, next)
    setPinned(null)
    setHover(null)
    setYAxis(next)
  }
  const meta = sourceMeta(source, version)

  const visible = useMemo(
    () => rows.filter((row) => !hidden.has(row.provider) && !hiddenModels.has(row.model)),
    [rows, hidden, hiddenModels],
  )
  const plotted = useMemo(
    () => visible.filter((row) => yValue(row, yAxis) != null),
    [visible, yAxis],
  )
  const active = pinned ?? hover
  const focus = plotted.find((row) => row.label === active) ?? null
  // Grey marks GPT versions behind the newest of their line in this source, even when the newer is unticked.
  const previous = useMemo(() => previousGenerations([...new Set(rows.map((row) => row.model))]), [rows])

  // The chip only switches the whole CLI on or off; the ticks in its menu are kept.
  const toggle = (id: ProviderId) => {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setPinned(null)
  }

  const setModels = (models: readonly string[], show: boolean) => {
    setPerSource((current) => {
      const next = new Set(current[source].hidden)
      for (const model of models) {
        if (show) next.delete(model)
        else next.add(model)
      }
      return { ...current, [source]: { ...current[source], hidden: next } }
    })
    if (show) {
      const providers = new Set(rows.filter((row) => models.includes(row.model)).map((row) => row.provider))
      setHidden((current) => new Set([...current].filter((id) => !providers.has(id))))
    }
    setPinned(null)
  }

  const scoreLabel = source === "aa" ? t("intelligence") : t("score")

  return (
    <main className="sheet">
      <header className="head">
        <p className="eyebrow">{meta.eyebrow}</p>
        <div className="title-row">
          <h1>AI Model Compare <span className="version">v{APP_VERSION}</span></h1>
          <button
            type="button"
            className="language"
            aria-label={t("language_aria")}
            onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
          >
            <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M1.75 8h12.5M8 1.75c1.8 1.9 2.6 3.9 2.6 6.25S9.8 12.35 8 14.25C6.2 12.35 5.4 10.35 5.4 8S6.2 3.65 8 1.75" />
            </svg>
            <span>{t("language_target")}</span>
          </button>
        </div>
        <p className="deck">
          {t("each_point_is_a_model_score_vs_cost_per_task") }
        </p>
      </header>

      <div className="controls">
        <div className="control">
          <span className="control-label" id="source-label">
            {t("source")}
          </span>
          <div className="segmented" role="group" aria-labelledby="source-label">
            {(Object.keys(SOURCES) as SourceId[]).map((id) => (
              <button
                key={id}
                type="button"
                className={id === source ? "segment on" : "segment"}
                aria-pressed={id === source}
                onClick={() => pickSource(id)}
              >
                {SOURCES[id].name}
              </button>
            ))}
          </div>
        </div>

        <div className="control">
            <span className="control-label" id="axis-label">
              {t("y_axis")}
            </span>
            <div className="segmented" role="group" aria-labelledby="axis-label">
              {Y_AXES.filter((axis) => SOURCE_AXES[source].includes(axis)).map((axis) => (
                <button
                  key={axis}
                  type="button"
                  className={axis === yAxis ? "segment on" : "segment"}
                  aria-pressed={axis === yAxis}
                  onClick={() => pickYAxis(axis)}
                >
                  {axis === "score" ? scoreLabel : t(`axis_${axis}`)}
                </button>
              ))}
            </div>
          </div>

        <div className="control control-wide">
          <span className="control-label">{t("models")}</span>
          <Legend
            t={t}
            rows={rows}
            previous={previous}
            hiddenProviders={hidden}
            hiddenModels={hiddenModels}
            onToggleProvider={toggle}
            onSetModels={setModels}
          />
        </div>
      </div>

      {error ? (
        <div className="chart chart-empty">{t("couldn_t_load")} {meta.name} ({error}).</div>
      ) : rows.length === 0 ? (
        <div className="chart chart-empty">{t("loading")} {meta.name}…</div>
      ) : (
        <Chart
          t={t}
          rows={visible}
          previous={previous}
          unit={meta.unit}
          scoreName={meta.scoreName}
          scoreLabel={scoreLabel}
          yAxis={yAxis}
          active={active}
          onHover={setHover}
          onPick={(label) => setPinned((current) => (current === label ? null : label))}
        />
      )}

      <ul className="chart-key" aria-label={t("point_symbols")}>
        <li>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="7" fill="currentColor" stroke="#fff" strokeWidth="2.5" />
          </svg>
          {t("large_filled_dot_my_regular_choice")}
        </li>
        <li>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="5.5" fill="#fff" stroke="currentColor" strokeWidth="2.5" />
          </svg>
          {t("hollow_circle_api_default")}
        </li>
        <li>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="12" cy="12" r="3.5" fill="currentColor" />
          </svg>
          {t("large_filled_dot_ring_regular_and_default")}
        </li>
      </ul>

      <p className="readout">
        {focus ? (
          <>
            <strong>{focus.label}</strong>
            <span>
              {scoreLabel} {formatScore(focus.score, meta.unit)}
            </span>
            <span>{t("cost")} {formatCost(focus.cost)}</span>
            {formatSpeed(focus.speed) ? <span>{t("speed")} {formatSpeed(focus.speed)}</span> : null}
            {formatVerbosity(focus.verbosity) ? <span>{t("verbosity")} {formatVerbosity(focus.verbosity)}</span> : null}
            {formatLatency(focus.latency) ? <span>{t("latency")} {formatLatency(focus.latency)}</span> : null}
            {formatTokens(focus.tokens) ? <span>{t("tokens")} {formatTokens(focus.tokens)}</span> : null}
            {formatSteps(focus.steps) ? <span>{t("steps")} {formatSteps(focus.steps)}</span> : null}
            {focus.ci ? <span>±{focus.ci.toFixed(1)} {t("pts_95")}</span> : null}
            {focus.agent ? <span>{t("agent")} {focus.agent}</span> : null}
          </>
        ) : source === "aa" ? (
          t("hover_over_a_point_to_see_intelligence_cost_speed_verbosity")
        ) : source === "arc" ? (
          t("hover_over_a_point_to_see_score_and_cost_per")
        ) : source === "tbench" ? (
          t("hover_over_a_point_to_see_score_cost_and_tokens")
        ) : (
          <>
            {t("hover_over_a_point_to_see_score_cost_tokens_and")}
            {rows.length && !rows.some((row) => row.provider === "codex")
              ? t("no_codex_cursorbench_has_not_scored_a_current_gpt_model")
              : null}
          </>
        )}
      </p>

      <Guidance t={t} aaRows={loaded.aa?.rows ?? NO_ROWS} />

      <Arena t={t} />

      <footer className="foot">
        <span>
          {t("data")}: <a href={meta.url}>{meta.name}</a>
        </span>
        {fetchedAt ? <span>{t("updated")} {formatFetchedAt(fetchedAt)}</span> : null}
        <a href={REPO_URL}>{REPO_URL.replace(/^https:\/\//, "")}</a>
      </footer>
    </main>
  )
}
