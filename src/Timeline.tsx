import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import TimelineChart, { timelineColor } from "./TimelineChart"
import { compareCreators, modelLine, modelLineRank } from "./bench"
import { modelRetirement, RETIREMENTS_CHECKED_AT } from "./model-retirements"
import type { Language } from "./language"
import type { TimelineData, TimelineMetric, TimelineRow } from "./timeline-data"
import { DEFAULT_TIMELINE_MODELS } from "./timeline-data"
import "./timeline-page.css"

const STORAGE_KEY = "ai-model-compare:timeline:v2"
const SPAN = 24 // slider covers the last 24 months; the right end is today
type Range = [number, number] // months on the slider, 0 = 24 months ago, SPAN = today
type Filters = { metric: TimelineMetric; range: Range; hidden: string[]; hiddenModels: string[] | null }

// Steps may be fractional (dragging the plot pans continuously); the fraction adds days within the month.
const dayAt = (step: number) => {
  const whole = Math.floor(step)
  const day = new Date()
  day.setUTCMonth(day.getUTCMonth() - (SPAN - whole))
  day.setUTCDate(day.getUTCDate() + Math.round((step - whole) * 30.44))
  return day.toISOString().slice(0, 10)
}
// Thumb centres travel over (track − 16px thumb), so the fill uses the same span to sit under them.
const thumbAt = (step: number) => `calc(8px + ${step / SPAN} * (100% - 16px))`
const fillAt = (from: number, to: number) => ({ left: thumbAt(from), right: thumbAt(SPAN - to) })
const validRange =(value: unknown): value is Range => Array.isArray(value) && value.length === 2
  && value.every((step) => Number.isFinite(step) && step >= 0 && step <= SPAN) && value[0] < value[1]

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item: unknown) => typeof item === "string") : []

// Series run strongest to weakest: known ones in the shared tier order, others by best ECI.
// Within a series the newest release comes first, so an unscored new model leads its line.
function groupsOf(rows: TimelineRow[]) {
  const bestEci = (items: TimelineRow[]) => Math.max(...items.map((row) => row.eci ?? -Infinity))
  const groups = new Map<string, TimelineRow[]>()
  for (const row of [...rows].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt)
    || modelLine(b.name).version - modelLine(a.name).version || a.name.localeCompare(b.name))) {
    const line = modelLine(row.name.replace(/\s*\(.*\)$/, "")).line
      .replace(/\bmini\b/gi, "Mini").replace(/\bnano\b/gi, "Nano")
    groups.set(line, [...(groups.get(line) ?? []), row])
  }
  return [...groups].map(([line, items]) => ({
    line, title: items[0].name.startsWith("GPT-") && !line.startsWith("GPT") ? `GPT ${line}` : line, items,
  })).sort((a, b) => modelLineRank(a.line.replace(/^Claude /, "")) - modelLineRank(b.line.replace(/^Claude /, ""))
    || bestEci(b.items) - bestEci(a.items) || a.title.localeCompare(b.title))
}

function initialFilters(): Filters {
  let filters: Filters = { metric: "score", range: [SPAN - 3, SPAN], hidden: [], hiddenModels: null }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    filters = {
      metric: saved.metric === "cost" ? "cost" : "score",
      range: validRange(saved.range) ? saved.range : [SPAN - 3, SPAN],
      hidden: strings(saved.hidden),
      hiddenModels: Array.isArray(saved.hiddenModels) ? strings(saved.hiddenModels) : null,
    }
  } catch { /* Browser storage is optional. */ }
  const params = new URLSearchParams(window.location.search)
  const metric = params.get("metric")
  if (params.get("view") === "timeline" && (metric === "score" || metric === "cost")) filters.metric = metric
  return filters
}

function hasMetric(row: TimelineRow, metric: TimelineMetric) {
  return metric === "score"
    ? row.eci != null && Number.isFinite(row.eci)
    : row.inputPrice != null && row.outputPrice != null && Number.isFinite(row.inputPrice)
      && Number.isFinite(row.outputPrice) && row.inputPrice >= 0 && row.outputPrice >= 0
}

function validReleasedAt(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

function validData(value: unknown): value is TimelineData {
  if (!value || typeof value !== "object" || !("rows" in value) || !Array.isArray(value.rows)) return false
  const nullableNumber = (number: unknown) => number === null || typeof number === "number" && Number.isFinite(number)
  return "fetchedAt" in value && typeof value.fetchedAt === "string"
    && "scoreSource" in value && typeof value.scoreSource === "string"
    && "priceSource" in value && typeof value.priceSource === "string"
    && value.rows.every((row: TimelineRow) => row && typeof row.id === "string" && typeof row.name === "string"
      && typeof row.provider === "string" && validReleasedAt(row.releasedAt)
      && [row.eci, row.eciLow, row.eciHigh, row.inputPrice, row.outputPrice].every(nullableNumber))
}

const COPY = {
  zh: {
    axis: "左側縱軸", score: "分數 · ECI", cost: "API 單價", period: "發布期間（近 24 個月內拖拉）",
    from: "起始月份", to: "結束月份", providers: "模型廠商",
    loading: "正在載入模型發布日期、ECI 與 API 單價…", failed: "無法載入發布趨勢資料",
    notes: "圖表說明",
    scoreNote: "橫軸是發布日期，縱軸是 ECI 綜合能力，越高越強。",
    costNote: "縱軸是 API 單價（美元／百萬 tokens）：每條直線上端 Output、下端 Input，中間刻痕是兩者平均。",
    rules: "深色＝已勾選；淡色＝沒勾，或官方 API 已停用（停用的勾了也是淡色，{date} 核對）。",
    scope: "所有模型都畫出、列在 ▾ 選單，缺資料的列在下方；發布期間只調整顯示範圍，也可以在圖上按住左右拖曳平移。滑到模型上看數值，點一下固定。",
    input: "Input", output: "Output", mean: "平均",
    count: "個模型", plotted: "個可繪製", missing: "個尚未有此項資料", missingTitle: "缺少資料的模型",
    missingScore: "尚未評分", missingCost: "尚無完整 Input／Output 單價", empty: "目前的期間與廠商篩選沒有模型。",
    updated: "資料更新", source: "資料來源", scoreSource: "ECI 分數", priceSource: "API 單價",
    snapshot: "目前使用已儲存的資料快照。", scoreLimit: "ECI 會隨新增評測重新估計，發布日期不是評分日期。",
    priceLimit: "單價是資料更新時的標準價，不是發布當天價格；實際費用另受用量比例、快取與折扣影響。",
    unavailable: "未提供", selectAll: "顯示全部廠商", allModels: "全部模型", chooseModels: "選擇模型：",
    retired: "官方 API 已停用",
  },
  en: {
    axis: "Y axis", score: "Score · ECI", cost: "API price", period: "Release period (drag within 24 months)",
    from: "Start month", to: "End month", providers: "Model creators",
    loading: "Loading model release dates, ECI scores and API prices…", failed: "Could not load release trends",
    notes: "About this chart",
    scoreNote: "X axis: release date. Y axis: general ECI capability; higher is stronger.",
    costNote: "Y axis: API price (USD per million tokens). Each vertical line runs from Input (bottom) to Output (top); the middle tick is their average.",
    rules: "Dark = ticked; faded = unticked, or retired from the official API (retired models stay faded even when ticked; checked {date}).",
    scope: "Every model is drawn and listed in the ▾ menus; models missing this metric are listed below. The release period only sets the visible range; drag the plot left or right to pan it. Hover a model for its values; click to pin it.",
    input: "Input", output: "Output", mean: "Mean",
    count: "models", plotted: "plottable", missing: "without this metric", missingTitle: "Models with missing data",
    missingScore: "Not yet scored", missingCost: "Complete Input/Output prices unavailable", empty: "No models match this release period and creator selection.",
    updated: "Data updated", source: "Sources", scoreSource: "ECI scores", priceSource: "API prices",
    snapshot: "Showing the saved data snapshot.", scoreLimit: "ECI is re-estimated as benchmark data grows; a release date is not an evaluation date.",
    priceLimit: "API prices are standard rates at the data update, not historical launch prices; actual costs depend on token mix, caching and discounts.",
    unavailable: "Unavailable", selectAll: "Show all creators", allModels: "All models", chooseModels: "Choose models: ",
    retired: "Official API retired",
  },
}

export default function Timeline({ language, active = true }: { language: Language; active?: boolean }) {
  const text = COPY[language]
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [data, setData] = useState<TimelineData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState(false)

  useEffect(() => {
    if (!active || data) return
    const controller = new AbortController()
    const load = async (url: string) => {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result: unknown = await response.json()
      if (!validData(result)) throw new Error("Invalid timeline data")
      return result
    }
    const savedUrl = `${import.meta.env.BASE_URL}data/timeline.json`
    void (async () => {
      try {
        let result: TimelineData
        try {
          result = await load(import.meta.env.DEV ? "/api/timeline" : savedUrl)
        } catch (reason) {
          if (!import.meta.env.DEV || controller.signal.aborted) throw reason
          result = await load(savedUrl)
          setSnapshot(true)
        }
        setData(result)
        setError(null)
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
      }
    })()
    return () => controller.abort()
  }, [active, data])

  useEffect(() => {
    if (!active) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)) } catch { /* Browser storage is optional. */ }
    const url = new URL(window.location.href)
    if (url.searchParams.get("view") === "timeline" && !url.searchParams.has("metric")) {
      url.searchParams.set("metric", filters.metric)
      window.history.replaceState(null, "", url)
    }
  }, [active, filters])

  useEffect(() => {
    const syncMetric = () => {
      const params = new URLSearchParams(window.location.search)
      const metric = params.get("metric")
      if (params.get("view") === "timeline" && (metric === "score" || metric === "cost")) {
        setFilters((current) => ({ ...current, metric }))
      }
    }
    window.addEventListener("popstate", syncMetric)
    return () => window.removeEventListener("popstate", syncMetric)
  }, [])

  const pickMetric = (metric: TimelineMetric) => {
    setFilters((current) => ({ ...current, metric }))
    if (!active) return
    const url = new URL(window.location.href)
    url.searchParams.set("view", "timeline")
    url.searchParams.set("metric", metric)
    window.history.replaceState(null, "", url)
  }

  const [open, setOpen] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Menu placement and dismissal follow Legend.tsx on the main page.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const menu = menuRef.current
      const trigger = menu?.parentElement?.getBoundingClientRect()
      if (!menu || !trigger) return
      const right = document.documentElement.clientWidth - 12
      menu.style.left = `${Math.max(12 - trigger.left, Math.min(0, right - trigger.left - menu.offsetWidth))}px`
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.parentElement?.contains(event.target as Node)) setOpen(null)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null) }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const creators = useMemo(() => [...new Set(data?.rows.map((row) => row.provider) ?? [])].sort(compareCreators), [data])
  const [from, to] = filters.range
  const since = dayAt(from)
  const until = dayAt(to)
  const inPeriod = useMemo(() => (data?.rows ?? []).filter((row) => row.releasedAt >= since && row.releasedAt <= until),
    [data, since, until])
  const setRange = (range: Range) => setFilters((current) => ({ ...current, range }))
  // Dragging the plot moves the period like the slider's middle grip: right shows older months.
  const panFrom = useRef<Range>(filters.range)
  const panChart = (fraction: number, start: boolean) => {
    if (start) { panFrom.current = [from, to]; return }
    const [a, b] = panFrom.current
    const shift = Math.max(-a, Math.min(SPAN - b, -fraction * (b - a)))
    setRange([a + shift, b + shift])
  }
  const trackRef = useRef<HTMLDivElement>(null)
  // Dragging the filled middle slides the whole period, keeping its length, clamped to the 24 months.
  const pan = (event: React.PointerEvent<HTMLSpanElement>) => {
    const width = trackRef.current?.offsetWidth
    if (!width) return
    const target = event.currentTarget
    const startX = event.clientX
    target.setPointerCapture(event.pointerId)
    const move = (moveEvent: PointerEvent) => {
      const shift = Math.max(-from, Math.min(SPAN - to, Math.round((moveEvent.clientX - startX) / width * SPAN)))
      setRange([from + shift, to + shift])
    }
    const stop = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", stop)
      target.removeEventListener("pointercancel", stop)
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", stop)
    target.addEventListener("pointercancel", stop)
  }
  const defaultHidden = useMemo(() => (data?.rows ?? []).filter((row) => !DEFAULT_TIMELINE_MODELS.includes(row.id))
    .map((row) => row.id), [data])
  const hiddenModels = filters.hiddenModels ?? defaultHidden
  const selected = useMemo(() => inPeriod.filter((row) => !filters.hidden.includes(row.provider)
    && !hiddenModels.includes(row.id)), [inPeriod, filters.hidden, hiddenModels])
  const missing = selected.filter((row) => !hasMetric(row, filters.metric))
  // Every model is loaded, listed and drawn; ticks only set opacity, the slider only zooms.
  const allRows = data?.rows ?? []
  const ticked = useMemo(() => new Set((data?.rows ?? []).filter((row) => !filters.hidden.includes(row.provider)
    && !hiddenModels.includes(row.id)).map((row) => row.id)), [data, filters.hidden, hiddenModels])
  const toggleCreator = (provider: string) => setFilters((current) => ({
    ...current,
    hidden: current.hidden.includes(provider) ? current.hidden.filter((value) => value !== provider) : [...current.hidden, provider],
  }))
  const setModels = (ids: readonly string[], visible: boolean) => setFilters((current) => ({
    ...current,
    hiddenModels: visible ? (current.hiddenModels ?? defaultHidden).filter((id) => !ids.includes(id))
      : [...new Set([...(current.hiddenModels ?? defaultHidden), ...ids])],
  }))
  const checkbox = (ids: readonly string[]) => {
    const shown = ids.filter((id) => !hiddenModels.includes(id)).length
    return {
      type: "checkbox" as const,
      checked: shown === ids.length,
      ref: (input: HTMLInputElement | null) => { if (input) input.indeterminate = shown > 0 && shown < ids.length },
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => setModels(ids, event.target.checked),
    }
  }
  const updated = data && !Number.isNaN(Date.parse(data.fetchedAt))
    ? new Intl.DateTimeFormat(language === "zh" ? "zh-TW" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.fetchedAt))
    : text.unavailable

  return (
    <section className="timeline-page" aria-label={language === "zh" ? "模型發布趨勢" : "Model release trends"}>
      <div className="controls">
        <div className="control">
          <span className="control-label" id="timeline-axis-label">{text.axis}</span>
          <div className="segmented" role="group" aria-labelledby="timeline-axis-label">
            {(["score", "cost"] as const).map((metric) => (
              <button key={metric} type="button" className={filters.metric === metric ? "segment on" : "segment"}
                aria-pressed={filters.metric === metric} onClick={() => pickMetric(metric)}>{text[metric]}</button>
            ))}
          </div>
        </div>
        {creators.length ? (
          <div className="control control-wide">
            <span className="control-label" id="timeline-creators-label">{text.providers}</span>
            <div className="legend timeline-creators" role="group" aria-labelledby="timeline-creators-label">
              {creators.map((provider) => {
                const models = allRows.filter((row) => row.provider === provider)
                const ids = models.map((row) => row.id)
                const shown = ids.filter((id) => !hiddenModels.includes(id)).length
                const groups = groupsOf(models)
                const isOpen = open === provider
                const menuId = `timeline-models-${provider.replace(/\W+/g, "-")}`
                return <div key={provider} className={isOpen ? "chip-group open" : "chip-group"}>
                  <button type="button" className={filters.hidden.includes(provider) ? "chip off" : "chip"}
                    aria-pressed={!filters.hidden.includes(provider)} onClick={() => toggleCreator(provider)}>
                    <span className="swatch" style={{ background: timelineColor(provider) }} aria-hidden="true" />{provider}
                    {models.length ? <span className="count">{shown === models.length ? models.length : `${shown}/${models.length}`}</span> : null}
                  </button>
                  {models.length ? <button type="button" className="chip-caret" aria-label={`${text.chooseModels}${provider}`}
                    aria-haspopup="true" aria-expanded={isOpen} aria-controls={menuId}
                    onClick={() => setOpen(isOpen ? null : provider)}>▾</button> : null}
                  {isOpen ? <div className="menu" id={menuId} role="group" aria-label={`${text.chooseModels}${provider}`} ref={menuRef}>
                    <label className="menu-row menu-all"><input {...checkbox(ids)} />{text.allModels}</label>
                    {groups.map((group) => <div key={group.line} className="menu-group" role="group" aria-label={group.title}>
                      {groups.length > 1 || group.items.length > 1 ? <label className="menu-row menu-group-title">
                        <input {...checkbox(group.items.map((row) => row.id))} />{group.title}
                      </label> : null}
                      {group.items.map((row) => {
                        const retirement = modelRetirement(row)
                        return <label key={row.id} className={`menu-row menu-item${retirement ? " timeline-retired" : ""}`}
                          title={retirement ? `${text.retired} · ${retirement.retiredAt}` : undefined}>
                        <input {...checkbox([row.id])} />
                        <span className="swatch" style={{ background: timelineColor(provider) }} />
                        <span className="menu-name"><span className="menu-model-name">{row.name}</span>{retirement
                          ? <small className="timeline-menu-missing">{text.retired} · {retirement.retiredAt}</small> : null}{!hasMetric(row, filters.metric)
                          ? <small className="timeline-menu-missing">{filters.metric === "score" ? text.missingScore : text.missingCost}</small> : null}</span>
                        <span className="count">{row.releasedAt}</span>
                      </label>})}
                    </div>)}
                  </div> : null}
                </div>
              })}
              {filters.hidden.length || hiddenModels.length ? <button type="button" className="segment"
                onClick={() => setFilters((current) => ({ ...current, hidden: [], hiddenModels: [] }))}>{text.selectAll}</button> : null}
            </div>
          </div>
        ) : null}
      </div>

      {error && !data ? <div className="chart chart-empty" role="alert">{text.failed} ({error})</div>
        : !data ? <div className="chart chart-empty" role="status">{text.loading}</div>
          : !data.rows.length ? <div className="chart chart-empty">{text.empty}</div>
            : <TimelineChart rows={data.rows} metric={filters.metric} language={language} selected={ticked} onPan={panChart}
              span={[Date.parse(`${since}T00:00:00Z`), Date.parse(`${until}T00:00:00Z`)]} />}
        <div className="control timeline-period-control">
          <span className="control-label" id="timeline-period-label">{text.period}</span>
          <div className="timeline-range" role="group" aria-labelledby="timeline-period-label">
            <div className="timeline-range-track" ref={trackRef}>
              <span className="timeline-range-fill" style={fillAt(from, to)} />
              <span className="timeline-range-grab" onPointerDown={pan} style={fillAt(from, to)} />
              {/* step="any": panning the plot leaves fractional months, which step={1} would snap away from the fill */}
              <input type="range" min={0} max={SPAN} step="any" value={from} aria-label={text.from} aria-valuetext={since}
                onChange={(event) => setRange([Math.min(Number(event.target.value), to - 1), to])} />
              <input type="range" min={0} max={SPAN} step="any" value={to} aria-label={text.to} aria-valuetext={until}
                onChange={(event) => setRange([from, Math.max(Number(event.target.value), from + 1)])} />
            </div>
            <output className="timeline-range-value">{since} – {until}</output>
          </div>
        </div>

      <section className="timeline-notes" aria-label={text.notes}>
        {filters.metric === "cost" ? <svg className="timeline-notes-key" viewBox="0 0 84 60" aria-hidden="true">
          <line x1={8} x2={8} y1={6} y2={54} className="timeline-key-line" />
          {([[6, text.output], [30, text.mean], [54, text.input]] as const).map(([y, label]) => <g key={label}>
            <line x1={4} x2={12} y1={y} y2={y} className="timeline-key-tick" />
            <text x={20} y={y + 4} className="timeline-key-text">{label}</text>
          </g>)}
        </svg> : null}
        <ul>
          <li>{filters.metric === "score" ? text.scoreNote : text.costNote}</li>
          <li>{text.rules.replace("{date}", RETIREMENTS_CHECKED_AT)}</li>
          <li>{text.scope}</li>
          <li>{filters.metric === "score" ? text.scoreLimit : text.priceLimit}</li>
        </ul>
      </section>

      {data ? (
        <>
          <p className="timeline-count" aria-live="polite">{selected.length} {text.count} · {selected.length - missing.length} {text.plotted} · {missing.length} {text.missing}</p>
          {missing.length ? (
            <section className="timeline-missing" aria-label={text.missingTitle}>
              <strong>{text.missingTitle} ({missing.length})</strong>
              <p>{filters.metric === "score" ? text.missingScore : text.missingCost}</p>
              <ul>{missing.map((row) => <li key={row.id}><span>{row.name}</span><time dateTime={row.releasedAt}>{row.releasedAt}</time></li>)}</ul>
            </section>
          ) : null}
          <footer className="foot timeline-foot">
            <span>{text.source}: <a href={data.scoreSource}>{text.scoreSource}</a> · <a href={data.priceSource}>{text.priceSource}</a></span>
            <span>{text.updated}: {updated}</span>
            {snapshot ? <span>{text.snapshot}</span> : null}
          </footer>
        </>
      ) : null}
    </section>
  )
}
