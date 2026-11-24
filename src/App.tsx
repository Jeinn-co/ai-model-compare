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
import { applyTheme, initialTheme, THEME_KEY, THEMES, type Theme } from "./theme"
import Arena from "./Arena"
import Guidance from "./Guidance"
import Chart from "./Chart"
import Legend from "./Legend"
import Timeline from "./Timeline"
import "./views.css"

type View = "compare" | "timeline"

function initialView(): View {
  return new URLSearchParams(window.location.search).get("view") === "timeline" ? "timeline" : "compare"
}

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

// Chip switches and menu ticks are remembered in this browser only. One set of ticks is
// shared by every source, so switching source keeps the same models checked; `seen` marks
// the models already given a default, so a model that shows up later starts unticked.
// Storage can be missing or blocked (private window, preview), so every access is guarded.
const STORAGE_KEY = "ai-model-compare:visibility:v3"
// v2 kept ticks per source; its Artificial Analysis ticks (the default source) carry over.
const LEGACY_KEY = "ai-model-compare:visibility:v2"

type Ticks = { hidden: ReadonlySet<string>; seen: ReadonlySet<string> }

function loadVisibility(): { providers: ProviderId[]; ticks: Ticks } {
  const empty: Ticks = { hidden: new Set(), seen: new Set() }
  try {
    const current = window.localStorage.getItem(STORAGE_KEY)
    const data = JSON.parse(current ?? window.localStorage.getItem(LEGACY_KEY) ?? "{}")
    const saved = current ? data : data.sources?.aa
    const ticks = Array.isArray(saved?.hidden) && Array.isArray(saved?.seen)
      ? { hidden: new Set<string>(saved.hidden), seen: new Set<string>(saved.seen) }
      : empty
    return { providers: Array.isArray(data.providers) ? data.providers : [], ticks }
  } catch {
    return { providers: [], ticks: empty }
  }
}

function saveVisibility(providers: ReadonlySet<ProviderId>, ticks: Ticks) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ providers: [...providers], hidden: [...ticks.hidden], seen: [...ticks.seen] }),
    )
  } catch {
    // Not remembered this time; the page still works.
  }
}

export default function App() {
  const [view, setView] = useState<View>(initialView)
  const [compareStarted, setCompareStarted] = useState(() => initialView() === "compare")
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const t = useMemo(() => createTranslator(language), [language])
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-Hant" : "en"
    document.title = view === "timeline" ? "AI Model Compare — Release trends" : "AI Model Compare — Score vs. Cost"
    try { localStorage.setItem(LANGUAGE_KEY, language) } catch { /* Storage is optional. */ }
  }, [language, view])
  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* Storage is optional. */ }
  }, [theme])
  useEffect(() => {
    const onPointer = () => document.documentElement.classList.add("mouse")
    const onKey = () => document.documentElement.classList.remove("mouse")
    window.addEventListener("pointerdown", onPointer, true)
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("pointerdown", onPointer, true)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [])
  const [source, setSource] = useState<SourceId>(initialSource)
  const [yAxis, setYAxis] = useState<YAxis>(initialYAxis)
  const [hidden, setHidden] = useState<ReadonlySet<ProviderId>>(() => new Set(loadVisibility().providers))
  const [ticks, setTicks] = useState<Ticks>(() => loadVisibility().ticks)
  const hiddenModels = ticks.hidden

  useEffect(() => saveVisibility(hidden, ticks), [hidden, ticks])
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
    const sync = () => {
      const next = initialView()
      setView(next)
      if (next === "compare") setCompareStarted(true)
      setSource(initialSource())
      setYAxis(initialYAxis())
    }
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [])

  const viewUrl = (next: View) => {
    const url = new URL(window.location.href)
    if (next === "timeline") url.searchParams.set("view", "timeline")
    else url.searchParams.delete("view")
    return `${url.pathname}${url.search}${url.hash}`
  }

  const pickView = (next: View) => {
    if (next === view) return
    window.history.pushState(null, "", viewUrl(next))
    setView(next)
    if (next === "compare") setCompareStarted(true)
  }

  useEffect(() => {
    if (!pinned) return
    const clear = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(null)
    }
    window.addEventListener("keydown", clear)
    return () => window.removeEventListener("keydown", clear)
  }, [pinned])

  useEffect(() => {
    if (!compareStarted) return
    const controller = new AbortController()
    for (const id of Object.keys(SOURCES) as SourceId[]) {
      // The dev server answers live; the published site reads the snapshot the GitHub Pages
      // workflow writes every 8 hours.
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
  }, [compareStarted])

  // A model no source has shown before gets its default tick once. A new default
  // (Opus 5.6 arriving) is ticked and the older versions of its line are unticked.
  useEffect(() => {
    if (rows.length === 0) return
    setTicks((current) => {
      const models = [...new Set(rows.map((row) => row.model))]
      const unseen = models.filter((model) => !current.seen.has(model))
      if (unseen.length === 0) return current
      const ticked = defaultTicked(rows)
      const newLines = new Set(unseen.filter((model) => ticked.has(model)).map((model) => modelLine(model).line))
      const replaced = models.filter(
        (model) => current.seen.has(model) && !ticked.has(model) && newLines.has(modelLine(model).line),
      )
      return {
        hidden: new Set([...current.hidden, ...replaced, ...unseen.filter((model) => !ticked.has(model))]),
        seen: new Set([...current.seen, ...unseen]),
      }
    })
  }, [rows])

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
    setTicks((current) => {
      const next = new Set(current.hidden)
      for (const model of models) {
        if (show) next.delete(model)
        else next.add(model)
      }
      return { ...current, hidden: next }
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
        <p className="eyebrow">{view === "timeline" ? t("release_trends") : meta.eyebrow}</p>
        <div className="title-row">
          <h1>AI Model Compare <span className="version">v{APP_VERSION}</span></h1>
          <div className="toolbar">
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
            <label className="theme-select">
              <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6.25" />
                <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
              </svg>
              <select
                aria-label={t("theme")}
                value={theme}
                onChange={(event) => {
                  const next = event.target.value as Theme
                  setTheme(THEMES.includes(next) ? next : "auto")
                }}
              >
                {THEMES.map((option) => (
                  <option key={option} value={option}>{t(`theme_${option}`)}</option>
                ))}
              </select>
              <svg className="toolbar-chev" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2 3.75l3 3 3-3" />
              </svg>
            </label>
          </div>
        </div>
        <p className="deck">
          {view === "timeline" ? t("release_trends_intro") : t("each_point_is_a_model_score_vs_cost_per_task")}
        </p>
      </header>

      <nav className="view-tabs" aria-label={t("comparison_views")}>
        {(["compare", "timeline"] as const).map((item) => (
          <a key={item} href={viewUrl(item)} className={view === item ? "view-tab on" : "view-tab"}
            aria-current={view === item ? "page" : undefined}
            onClick={(event) => {
              if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              pickView(item)
            }}>
            {t(item === "compare" ? "performance_and_cost" : "release_trends")}
          </a>
        ))}
      </nav>

      <div hidden={view !== "timeline"}>
        <Timeline language={language} active={view === "timeline"} />
      </div>

      {compareStarted ? <div hidden={view !== "compare"}>
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
          <div className="control-header">
            <span className="control-label">{t("models")}</span>
            {source === "cursorbench" && rows.length > 0 && !rows.some((row) => row.provider === "codex") ? (
              <span className="control-note">{t("no_codex_cursorbench_has_not_scored_a_current_gpt_model")}</span>
            ) : null}
          </div>
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
            <circle cx="12" cy="12" r="7" fill="currentColor" stroke="var(--paper)" strokeWidth="2.5" />
          </svg>
          {t("large_filled_dot_my_regular_choice")}
        </li>
        <li>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="5.5" fill="var(--paper)" stroke="currentColor" strokeWidth="2.5" />
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
          t("hover_over_a_point_to_see_score_cost_tokens_and")
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
      </div> : null}
    </main>
  )
}
