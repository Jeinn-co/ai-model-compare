import { useEffect, useId, useMemo, useRef, useState } from "react"
import { compareCreators, niceCeil, tickValues } from "./bench"
import type { TimelineMetric, TimelineRow } from "./timeline-data"
import { modelRetirement } from "./model-retirements"
import { nearestTimelinePoint, timelineColor, timelineGuides, timelineValue, type TimelinePoint } from "./timeline-chart-utils"
import "./timeline-chart.css"

// span: the X axis range in ms (the page's period slider); without it the axis fits the data.
// selected: given, every row is drawn and only these ids are at full opacity.
type Props = {
  rows: TimelineRow[]; metric: TimelineMetric; language: "zh" | "en"; span?: [number, number]
  selected?: ReadonlySet<string>
  // Mouse drag on the plot: the drag distance as a fraction of the plot width (start = true on press).
  onPan?: (fraction: number, start: boolean) => void
}

const RETIRED_OPACITY = 0.3

const W = 960
const H = 500
const PAD = { left: 112, right: 30, top: 36, bottom: 70 }
const DAY = 86_400_000
const COPY = {
  en: {
    date: "Model release date", score: "General ECI · higher is better", cost: "API price · USD / 1M tokens",
    input: "Input", output: "Output", mean: "Mean", overlap: "overlapping models", empty: "No models have data for this view.", shown: "plotted", omitted: "without data",
    retired: "Official API retired", officialSource: "Official notice",
  },
  zh: {
    date: "模型發布日期", score: "綜合 ECI · 越高越好", cost: "API 單價 · 美元／100 萬 tokens",
    input: "Input", output: "Output", mean: "算術平均", overlap: "個重疊的模型", empty: "目前選取的模型沒有可顯示的資料。", shown: "個模型已繪製", omitted: "個缺少資料",
    retired: "官方 API 已停用", officialSource: "官方公告",
  },
}

// Eases the axis domain to its new target, so moving the period slider slides the chart instead of jumping.
// A new target mid-way starts from wherever the chart is now.
function useEased(target: readonly number[], ms = 280) {
  const [value, setValue] = useState(target)
  const current = useRef(target)
  const key = target.join()
  useEffect(() => {
    const goal = key.split(",").map(Number)
    if (ms <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = goal
      setValue(goal)
      return
    }
    const origin = current.current
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const ease = 1 - (1 - t) ** 3
      current.current = goal.map((end, i) => (origin[i] ?? end) + (end - (origin[i] ?? end)) * ease)
      setValue(current.current)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [key, ms])
  return value
}

export default function TimelineChart({ rows, metric, language, span, selected, onPan }: Props) {
  const drag = useRef<{ x: number; moved: boolean } | null>(null)
  const dragged = useRef(false)
  // While dragging, a shorter ease keeps the chart smooth without trailing far behind the pointer.
  const [panning, setPanning] = useState(false)
  const copy = COPY[language]
  const gradientId = useId()
  const clipId = useId()
  const [hovered, setHovered] = useState<string | null>(null) // the mark under the pointer; anchors the popover
  const [nearby, setNearby] = useState<TimelinePoint | null>(null)
  const [item, setItem] = useState<string | null>(null) // a row hovered inside the popover
  const leaveTimer = useRef<number | undefined>(undefined)
  // A short grace period lets the pointer travel from a mark into its popover without closing it.
  const enter = (id: string) => { window.clearTimeout(leaveTimer.current); setHovered(id) }
  const leave = () => {
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => { setHovered(null); setItem(null); setNearby(null) }, 150)
  }
  const [pinned, setPinned] = useState<string | null>(null)
  const dated = useMemo(() => rows.flatMap((row) => {
    const time = Date.parse(`${row.releasedAt}T00:00:00Z`)
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === row.releasedAt
      ? [{ row, time }] : []
  }).sort((a, b) => a.time - b.time || a.row.name.localeCompare(b.row.name)), [rows])
  const drawable = useMemo(() => dated.flatMap(({ row, time }) => {
    const value = timelineValue(row, metric)
    return value !== null ? [{ row, time, value }] : []
  }), [dated, metric])
  // The slider zooms: every model stays drawn (clipped to the plot); labels, hover and counts use the span.
  const within = (time: number) => !span || (time >= span[0] && time <= span[1])
  const inView = dated.filter(({ time }) => within(time))
  const plotted = useMemo(() => drawable.filter(({ time }) => !span || (time >= span[0] && time <= span[1])),
    [drawable, span])
  const isSelected = (row: TimelineRow) => !selected || selected.has(row.id)
  // Few models: name them all. Many: name each provider's top one (highest ECI, or highest mean price).
  // Only ticked models are named.
  const labeled = useMemo(() => {
    const named = plotted.filter(({ row }) => !selected || selected.has(row.id))
    if (named.length <= 12) return new Set(named.map(({ row }) => row.id))
    const top = new Map<string, { id: string; value: number }>()
    for (const { row, value } of named) { // oldest-first, so >= lets the newest win a tie
      if (value >= (top.get(row.provider)?.value ?? -Infinity)) top.set(row.provider, { id: row.id, value })
    }
    return new Set([...top.values()].map(({ id }) => id))
  }, [plotted, selected])
  const providers = useMemo(() => [...new Set(plotted.map(({ row }) => row.provider))].sort(compareCreators), [plotted])
  const focus = plotted.find(({ row }) => row.id === (item ?? hovered ?? pinned)) ?? null
  const focusRetirement = focus ? modelRetirement(focus.row) : null
  const anchor = plotted.find(({ row }) => row.id === (hovered ?? pinned)) ?? null
  const number = (value: number) => value.toLocaleString(language === "zh" ? "zh-TW" : "en-US", { maximumFractionDigits: 6 })
  const price = (value: number) => `$${number(value)}`
  const describe = (row: TimelineRow, value: number) => {
    const retirement = modelRetirement(row)
    return (metric === "score" ? `ECI ${number(value)}`
      : `${copy.input} ${price(row.inputPrice!)}; ${copy.mean} ${price(value)}; ${copy.output} ${price(row.outputPrice!)}`)
      + (retirement ? ` · ${copy.retired} ${retirement.retiredAt}` : "")
  }
  const pick = (id: string) => setPinned((current) => current === id ? null : id)

  const values = plotted.flatMap(({ row, value }) => metric === "cost"
    ? [row.inputPrice!, row.outputPrice!] : [value])
  const target = !plotted.length ? [0, 1, 0, 1] : [
    span ? span[0] : dated[0].time - DAY * 15,
    span ? span[1] : dated[dated.length - 1].time + DAY * 15,
    metric === "cost" ? 0 : Math.floor((Math.min(...values) - 3) / 5) * 5,
    metric === "cost" ? niceCeil(Math.max(...values) * 1.08) || 1 : Math.ceil((Math.max(...values) + 3) / 5) * 5,
  ]
  const [xMin, xMax, yMin, yMax] = useEased(target, panning ? 140 : 280)

  if (!plotted.length) return <div className="chart chart-empty timeline-empty">{copy.empty}</div>
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (time: number) => PAD.left + (time - xMin) / (xMax - xMin) * plotW
  const y = (value: number) => PAD.top + (yMax - value) / (yMax - yMin) * plotH
  // Ticks sit on the 1st of a month so a "Mar 2026" label means March 1, not an arbitrary day in March.
  const firstOfMonth = (time: number, add: number) => {
    const date = new Date(time)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + add, 1)
  }
  const firsts: number[] = []
  let month = firstOfMonth(xMin, new Date(xMin).getUTCDate() > 1 ? 1 : 0)
  while (month <= xMax) {
    firsts.push(month)
    month = firstOfMonth(month, 1)
  }
  const every = Math.ceil(firsts.length / 7)
  const monthTicks = firsts.filter((_, index) => index % every === 0)
  const dateFormat = new Intl.DateTimeFormat(language === "zh" ? "zh-TW" : "en-US", { year: "numeric", month: "short", timeZone: "UTC" })
  const axis = metric === "score" ? copy.score : copy.cost
  // Overlapping marks stay overlapped; the popover lists every mark that touches the anchored one.
  const extent = ({ row, value }: { row: TimelineRow; value: number }) => metric === "cost"
    ? [y(row.outputPrice!), y(row.inputPrice!)] : [y(value), y(value)]
  const cluster = anchor ? plotted.filter((mark) => {
    const [top, bottom] = extent(mark)
    const [anchorTop, anchorBottom] = extent(anchor)
    return Math.abs(x(mark.time) - x(anchor.time)) < 8 && top - 8 <= anchorBottom && anchorTop - 8 <= bottom
  }).sort((a, b) => b.value - a.value) : []
  const points: TimelinePoint[] = plotted.flatMap(({ row, time, value }) => (metric === "cost" ? [
    { kind: "input" as const, value: row.inputPrice! },
    { kind: "mean" as const, value },
    { kind: "output" as const, value: row.outputPrice! },
  ] : [{ kind: "eci" as const, value }]).map((point) => ({ ...point, id: row.id, metric, x: x(time), y: y(point.value) })))
  const activePoint = nearby && focus?.row.id === nearby.id && nearby.metric === metric
    ? points.find((point) => point.id === nearby.id && point.kind === nearby.kind) ?? null : null
  const guides = activePoint ? timelineGuides(points, activePoint).map((point) => ({
    ...point, text: metric === "cost" ? price(point.value) : number(point.value), labelY: point.y,
  })) : []
  for (let i = 0; i < guides.length; i++) {
    guides[i].labelY = Math.max(PAD.top + 12, guides[i].labelY, i ? guides[i - 1].labelY + 26 : 0)
  }
  const overflow = Math.max(0, (guides[guides.length - 1]?.labelY ?? 0) - (H - PAD.bottom - 12))
  for (const guide of guides) guide.labelY -= overflow

  return (
    <div className="timeline-chart">
      <div className="timeline-plot-scroll"><div className="timeline-plot-area">
        <svg className={`chart timeline-plot${panning ? " is-panning" : ""}`} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${axis}; ${copy.date}`}
          onPointerDown={(event) => {
            // Mouse only: touch keeps the plot's native horizontal scroll on narrow screens.
            if (!onPan || event.pointerType !== "mouse" || event.button !== 0) return
            drag.current = { x: event.clientX, moved: false }
            event.currentTarget.setPointerCapture(event.pointerId)
            onPan(0, true)
          }}
          onPointerUp={() => {
            if (drag.current?.moved) dragged.current = true
            drag.current = null
            setPanning(false)
          }}
          onPointerCancel={() => { drag.current = null; setPanning(false) }}
          onClickCapture={(event) => {
            // A drag is not a click: do not pin or unpin on release.
            if (dragged.current) { dragged.current = false; event.stopPropagation() }
          }}
          onPointerMove={(event) => {
            if (drag.current && onPan) {
              const dx = event.clientX - drag.current.x
              if (!drag.current.moved && Math.abs(dx) > 4) {
                drag.current.moved = true
                setPanning(true)
              }
              if (drag.current.moved) {
                const plotPixels = event.currentTarget.getBoundingClientRect().width * (W - PAD.left - PAD.right) / W
                onPan(dx / plotPixels, false)
                return
              }
            }
            const matrix = event.currentTarget.getScreenCTM()
            if (!matrix) return
            const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
            const nearest = nearestTimelinePoint(points, point.x, point.y)
            setNearby(nearest)
            if (nearest) enter(nearest.id)
            else { window.clearTimeout(leaveTimer.current); setHovered(null); setItem(null) }
          }} onPointerLeave={leave}
          onClick={() => setPinned(null)} onKeyDown={(event) => { if (event.key === "Escape") setPinned(null) }}>
          <title>{axis} — {copy.date}</title>
          <defs>
            <clipPath id={clipId}><rect x={PAD.left} y={PAD.top - 14} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom + 28} /></clipPath>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={focus ? timelineColor(focus.row.provider) : "#000"} stopOpacity={0.1} />
              <stop offset="100%" stopColor={focus ? timelineColor(focus.row.provider) : "#000"} stopOpacity={0} />
            </linearGradient>
          </defs>
          {activePoint && metric === "cost" && guides.length > 1 ? <rect
            x={PAD.left} y={guides[0].y} width={activePoint.x - PAD.left}
            height={guides[guides.length - 1].y - guides[0].y}
            fill={`url(#${gradientId})`} pointerEvents="none" aria-hidden="true" /> : null}
          {tickValues(yMin, yMax, 6).map((tick) => <g key={`y-${tick}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="timeline-grid" />
            <text x={PAD.left - 12} y={y(tick) + 4} textAnchor="end" className="tick">{metric === "cost" ? price(tick) : number(tick)}</text>
          </g>)}
          {monthTicks.map((tick) => <g key={`x-${tick}`}>
            <line x1={x(tick)} x2={x(tick)} y1={PAD.top} y2={H - PAD.bottom} className="timeline-grid timeline-grid-vertical" />
            <text x={x(tick)} y={H - PAD.bottom + 24} textAnchor="middle" className="tick">{dateFormat.format(tick)}</text>
          </g>)}
          <text x={PAD.left} y={20} className="axis-name">{axis}</text>
          <text x={PAD.left + plotW / 2} y={H - 15} textAnchor="middle" className="axis-name">{copy.date}</text>
          {activePoint ? <g className="timeline-crosshair" pointerEvents="none">
            <line x1={activePoint.x} x2={activePoint.x} y1={Math.min(...guides.map((guide) => guide.y))}
              y2={H - PAD.bottom} className="timeline-guide-active" />
            {guides.map((guide) => <line key={guide.value} x1={PAD.left} x2={guide.x} y1={guide.y} y2={guide.y}
              className={guide.active ? "timeline-guide-active" : "timeline-guide-muted"} />)}
          </g> : null}
          {/* Unticked models first, so ticked ones draw on top. */}
          <g clipPath={`url(#${clipId})`}>
          {(selected ? [...drawable].sort((a, b) => Number(isSelected(a.row)) - Number(isSelected(b.row))) : drawable).map(({ row, time, value }) => {
            const color = timelineColor(row.provider)
            const base = modelRetirement(row) || !isSelected(row) ? RETIRED_OPACITY : 1
            const on = focus?.row.id === row.id
            const pointX = x(time)
            const pointY = y(value)
            return <g key={row.id} role="button" tabIndex={0} className="timeline-model"
              style={{ color }} opacity={(focus && !on ? 0.2 : 1) * base} aria-pressed={pinned === row.id}
              aria-label={`${row.name}; ${row.releasedAt}; ${describe(row, value)}`}
              onFocus={() => { enter(row.id); setNearby((current) => current?.id === row.id && current.metric === metric
                ? current : points.find((point) => point.id === row.id
                  && point.kind === (metric === "cost" ? "mean" : "eci")) ?? null) }} onBlur={leave}
              onClick={(event) => { event.stopPropagation(); pick(row.id) }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(row.id) }
              }}>
              <title>{`${row.name} · ${row.releasedAt}\n${describe(row, value)}`}</title>
              {metric === "cost" ? <>
                <line x1={pointX} x2={pointX} y1={y(row.inputPrice!)} y2={y(row.outputPrice!)} className="timeline-price-line" />
                <rect x={pointX - 10} y={Math.min(y(row.inputPrice!), y(row.outputPrice!)) - 10} width={20}
                  height={Math.abs(y(row.inputPrice!) - y(row.outputPrice!)) + 20} fill="transparent" />
                {/* three equal ticks on the line: Input, mean, Output */}
                <line data-price="input" x1={pointX - (on ? 4 : 3)} x2={pointX + (on ? 4 : 3)}
                  y1={y(row.inputPrice!)} y2={y(row.inputPrice!)} className={`timeline-tick${on && activePoint ? activePoint.kind === "input" ? " timeline-guide-active" : " timeline-guide-muted" : ""}`} />
                <line data-price="output" x1={pointX - (on ? 4 : 3)} x2={pointX + (on ? 4 : 3)}
                  y1={y(row.outputPrice!)} y2={y(row.outputPrice!)} className={`timeline-tick${on && activePoint ? activePoint.kind === "output" ? " timeline-guide-active" : " timeline-guide-muted" : ""}`} />
                <line data-price="mean" x1={pointX - (on ? 4 : 3)} x2={pointX + (on ? 4 : 3)}
                  y1={pointY} y2={pointY} className={`timeline-tick${on && activePoint ? activePoint.kind === "mean" ? " timeline-guide-active" : " timeline-guide-muted" : ""}`} />
              </> : <>
                <circle cx={pointX} cy={pointY} r={12} fill="transparent" />
                <circle data-score="eci" cx={pointX} cy={pointY} r={on ? 6.5 : 4} className="timeline-score" />
              </>}
              {labeled.has(row.id) && !on ? <text x={pointX + (pointX > W - 180 ? -7 : 7)}
                y={(metric === "cost" ? y(row.outputPrice!) : pointY) - 7}
                textAnchor={pointX > W - 180 ? "end" : "start"} className="timeline-model-label">{row.name}</text> : null}
            </g>
          })}
          </g>
          {focus ? <g pointerEvents="none">
            {activePoint ? <>
              {guides.map((guide) => <g key={guide.value} className={guide.active ? "timeline-guide-active" : "timeline-guide-muted"}>
                <circle cx={guide.x} cy={guide.y} r={guide.active ? 5 : 3} className="timeline-active-point" />
                {Math.abs(guide.labelY - guide.y) > 1 ? <line x1={PAD.left} x2={PAD.left - 8}
                  y1={guide.y} y2={guide.labelY} className="timeline-axis-leader" /> : null}
                <g transform={`translate(${PAD.left - 8}, ${guide.labelY})`} data-axis-value="y">
                  <rect x={-(guide.text.length * 7 + 16)} y={-12} width={guide.text.length * 7 + 16} height={24} rx={3} className="timeline-axis-value-bg" />
                  <text x={-8} y={4} textAnchor="end" className="timeline-value-label">{guide.text}</text>
                </g>
              </g>)}
              <g className="timeline-guide-active" transform={`translate(${Math.max(50, Math.min(W - 50, activePoint.x))}, ${H - PAD.bottom + 22})`} data-axis-value="x">
                <rect x={-48} y={-12} width={96} height={24} rx={3} className="timeline-axis-value-bg" />
                <text y={4} textAnchor="middle" className="timeline-value-label">{focus.row.releasedAt}</text>
              </g>
            </> : null}
            <text x={Math.min(W - PAD.right - 4, Math.max(PAD.left + 4, x(focus.time)))}
              y={Math.max(PAD.top + 14, (activePoint?.y ?? y(focus.value)) - 16)}
              textAnchor={x(focus.time) > W / 2 ? "end" : "start"} className="timeline-focus-label">{focus.row.name}{activePoint && activePoint.kind !== "eci" ? ` · ${copy[activePoint.kind]}` : ""}</text>
          </g> : null}
        </svg>
        {anchor && cluster.length > 1 ? <div className="timeline-popover" role="dialog" aria-label={`${cluster.length} ${copy.overlap}`}
          style={{
            // Beside the hovered mark: flips left past the middle, and opens upward in the lower half so it stays in the plot.
            left: `${x(anchor.time) / W * 100}%`, top: `${y(anchor.value) / H * 100}%`,
            transform: `translate(${x(anchor.time) > W / 2 ? "calc(-100% - 14px)" : "14px"}, ${y(anchor.value) > H / 2 ? "calc(-100% + 16px)" : "-16px"})`,
          }}
          onPointerEnter={() => window.clearTimeout(leaveTimer.current)} onPointerLeave={leave}>
          <strong>{cluster.length} {copy.overlap}</strong>
          <ul>{cluster.map(({ row, value }) => <li key={row.id}>
            <button type="button" className={`${pinned === row.id ? "on" : ""}${modelRetirement(row) ? " timeline-retired" : ""}`}
              onPointerEnter={() => setItem(row.id)} onPointerLeave={() => setItem(null)}
              onFocus={() => setItem(row.id)} onBlur={() => setItem(null)} onClick={() => pick(row.id)}>
              <i style={{ background: timelineColor(row.provider) }} />
              <span className="menu-model-name">{row.name}</span>
              <small>{row.releasedAt} · {describe(row, value)}</small>
            </button>
          </li>)}</ul>
        </div> : null}
      </div></div>
      <div className="timeline-chart-meta">
        <span className="timeline-provider-key">{providers.map((provider) =>
          <span key={provider}><i style={{ background: timelineColor(provider) }} />{provider}</span>)}</span>
        <span>{plotted.length} {copy.shown}{inView.length > plotted.length ? ` · ${inView.length - plotted.length} ${copy.omitted}` : ""}</span>
      </div>
      <div className="readout timeline-readout" aria-live="polite">
        {focus ? <><strong>{focus.row.name}</strong><span>{focus.row.releasedAt}</span><span>{describe(focus.row, focus.value)}</span></> : null}
        {focusRetirement ? <a href={focusRetirement.source}>{copy.officialSource}</a> : null}
      </div>
    </div>
  )
}
