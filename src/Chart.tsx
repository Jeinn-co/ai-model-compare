import { useEffect, useState } from "react"
import {
  formatCost,
  formatCostTick,
  formatScore,
  formatY,
  niceCeil,
  seriesColor,
  tickValues,
  yAxisLabel,
  yValue,
  type Row,
  type YAxis,
} from "./bench"

const VB_W = 960
const VB_H = 540

type Label = {
  key: string
  text: string
  x: number
  y: number
  color: string
  anchor: "start" | "end"
}

type Props = {
  rows: Row[]
  previous: ReadonlyMap<string, number>
  unit: string
  scoreName: string
  scoreLabel: string
  yAxis: YAxis
  active: string | null
  onHover: (label: string | null) => void
  onPick: (label: string | null) => void
}

function effortIndex(effort: string | null) {
  if (!effort) return 99
  const order = ["Minimal", "Low", "Medium", "High", "Extra High", "Max"]
  const index = order.indexOf(effort)
  return index === -1 ? 98 : index
}

export default function Chart({ rows, previous, unit, scoreName, scoreLabel, yAxis, active, onHover, onPick }: Props) {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches,
  )

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)")
    const apply = () => setNarrow(media.matches)
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [])

  const pad = {
    l: yAxis === "score" ? 64 : 72,
    r: 20,
    t: 22,
    b: 46,
  }

  if (rows.length === 0) {
    return <div className="chart chart-empty">Turn on at least one provider.</div>
  }

  const values = rows.map((row) => yValue(row, yAxis)).filter((value): value is number => value != null)
  if (values.length === 0) {
    return <div className="chart chart-empty">None of these models have data for this Y axis.</div>
  }
  const xMax = niceCeil(Math.max(...rows.map((row) => row.cost)) * 1.08)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const yMin = yAxis === "score" ? Math.max(0, Math.floor((lo - 4) / 5) * 5) : 0
  const yMax = yAxis === "score" ? Math.ceil((hi + 2) / 5) * 5 : niceCeil(hi * 1.08) || 1
  const plotW = VB_W - pad.l - pad.r
  const plotH = VB_H - pad.t - pad.b
  const ySpan = yMax - yMin || 1

  const xOf = (cost: number) => pad.l + ((xMax - cost) / xMax) * plotW
  const yOf = (value: number) => pad.t + ((yMax - value) / ySpan) * plotH

  const xTicks = tickValues(0, xMax, 6)
  const yTicks = tickValues(yMin, yMax, 6)

  const colorOf = (model: string, provider: Row["provider"]) => seriesColor(model, provider, previous.get(model))

  const byModel = new Map<string, Row[]>()
  for (const row of rows) {
    const list = byModel.get(row.model)
    if (list) list.push(row)
    else byModel.set(row.model, [row])
  }

  const widthOf = (text: string) => text.length * 7.4
  const labels: Label[] = []
  if (!narrow) {
    for (const [model, points] of byModel) {
      const top = points.reduce((best, row) => {
        const value = yValue(row, yAxis) ?? 0
        const bestValue = yValue(best, yAxis) ?? 0
        return value > bestValue ? row : best
      })
      const x = xOf(top.cost)
      const anchor = x + 10 + widthOf(model) > VB_W - pad.r ? "end" : "start"
      labels.push({
        key: model,
        text: model,
        x: x + (anchor === "end" ? -10 : 10),
        y: yOf(yValue(top, yAxis) ?? 0) - 8,
        color: colorOf(top.model, top.provider),
        anchor,
      })
    }
    const hits = (a: Label, b: Label) => {
      const aLeft = a.anchor === "end" ? a.x - widthOf(a.text) : a.x
      const bLeft = b.anchor === "end" ? b.x - widthOf(b.text) : b.x
      const xOverlap = aLeft < bLeft + widthOf(b.text) + 8 && bLeft < aLeft + widthOf(a.text) + 8
      return xOverlap && Math.abs(a.y - b.y) < 20
    }
    for (let pass = 0; pass < 14; pass += 1) {
      labels.sort((a, b) => a.y - b.y || a.x - b.x)
      let moved = false
      for (let index = 1; index < labels.length; index += 1) {
        for (let earlier = 0; earlier < index; earlier += 1) {
          if (hits(labels[index], labels[earlier])) {
            labels[index].y = labels[earlier].y + 20
            moved = true
          }
        }
      }
      if (!moved) break
    }
    const top = pad.t + 12
    const bottom = pad.t + plotH - 6
    for (const label of labels) {
      if (label.y > bottom) label.y = bottom
      if (label.y < top) label.y = top
    }
  }

  const focus = rows.find((row) => row.label === active) ?? null
  const emphasis = focus?.model ?? null
  const focusYValue = focus ? yValue(focus, yAxis) : null
  const focusX = focus ? xOf(focus.cost) : null
  const focusY = focusYValue != null ? yOf(focusYValue) : null
  const focusColor = focus ? colorOf(focus.model, focus.provider) : null

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-labelledby="chart-desc"
    >
      <title id="chart-desc">
        {scoreName} vs. cost per task. Higher cost on the left, $0 on the right. Y axis: {yAxisLabel(yAxis)}.
      </title>
      <rect x={pad.l} y={pad.t} width={plotW} height={plotH} fill="#ffffff" />
      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line
            x1={pad.l}
            x2={pad.l + plotW}
            y1={yOf(tick)}
            y2={yOf(tick)}
            stroke="#d5e0e7"
          />
          <text
            x={pad.l - 10}
            y={yOf(tick) + 4}
            textAnchor="end"
            className="tick"
            opacity={focusY !== null && Math.abs(yOf(tick) - focusY) < 18 ? 0 : 1}
          >
            {yAxis === "score" ? `${tick}${unit}` : formatY(tick, yAxis)}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <g key={`x-${tick}`}>
          <line
            x1={xOf(tick)}
            x2={xOf(tick)}
            y1={pad.t}
            y2={pad.t + plotH}
            stroke="#e7eef2"
          />
          <text
            x={xOf(tick)}
            y={pad.t + plotH + 22}
            textAnchor="middle"
            className="tick"
            opacity={focusX !== null && Math.abs(xOf(tick) - focusX) < 36 ? 0 : 1}
          >
            {formatCostTick(tick)}
          </text>
        </g>
      ))}
      <text x={pad.l} y={16} className="axis-name">
        {yAxis === "score" ? scoreLabel : yAxisLabel(yAxis)}
      </text>
      <text x={pad.l + plotW / 2} y={pad.t + plotH + 40} textAnchor="middle" className="axis-name">
        Cost per task
      </text>
      {[...byModel.entries()].map(([model, points]) => {
        const color = colorOf(model, points[0].provider)
        const hot = emphasis === model
        const dim = emphasis !== null && !hot
        const ordered = [...points].sort((a, b) => effortIndex(a.effort) - effortIndex(b.effort))
        const d = ordered
          .map((row, index) => {
            const cmd = index === 0 ? "M" : "L"
            return `${cmd}${xOf(row.cost).toFixed(1)} ${yOf(yValue(row, yAxis) ?? 0).toFixed(1)}`
          })
          .join(" ")
        const label = labels.find((item) => item.key === model)
        return (
          <g key={model} className="series" opacity={dim ? 0.16 : 1}>
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeOpacity={hot ? 1 : 0.45}
              strokeWidth={hot ? 3 : 2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {ordered.map((row) => {
              const on = row.label === active
              return (
                <g
                  key={row.label}
                  role="button"
                  tabIndex={0}
                  className="point-hit"
                  aria-pressed={on}
                  aria-label={`${row.model} ${row.effort ?? ""}: ${formatScore(row.score, unit)}, ${formatCost(row.cost)} per task`}
                  transform={`translate(${xOf(row.cost).toFixed(1)} ${yOf(yValue(row, yAxis) ?? 0).toFixed(1)})`}
                  onPointerEnter={() => onHover(row.label)}
                  onPointerLeave={() => onHover(null)}
                  onFocus={() => onHover(row.label)}
                  onBlur={() => onHover(null)}
                  onClick={() => onPick(row.label)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    onPick(row.label)
                  }}
                >
                  <circle r={16} fill="transparent" />
                  <circle
                    className="point"
                    r={on ? 7.5 : 5.5}
                    fill={color}
                    fillOpacity={hot || emphasis === null ? 1 : 0.45}
                    stroke="#ffffff"
                    strokeWidth={2.5}
                  />
                </g>
              )
            })}
            {label ? (
              <text
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
                fill={label.color}
                className="model-label"
                stroke="#ffffff"
                strokeWidth="4"
                paintOrder="stroke fill"
              >
                {label.text}
              </text>
            ) : null}
          </g>
        )
      })}
      {focus && focusX !== null && focusY !== null && focusColor ? (
        <g className="crosshair" pointerEvents="none">
          <line
            x1={pad.l}
            x2={pad.l + plotW}
            y1={focusY}
            y2={focusY}
            stroke={focusColor}
            strokeWidth={1.25}
            strokeDasharray="2.5 4"
          />
          <line
            x1={focusX}
            x2={focusX}
            y1={focusY}
            y2={pad.t + plotH}
            stroke={focusColor}
            strokeWidth={1.25}
            strokeDasharray="2.5 4"
          />
          <text
            x={pad.l - 10}
            y={focusY + 5}
            textAnchor="end"
            fill={focusColor}
            className="cross-value"
          >
            {focusYValue != null ? formatY(focusYValue, yAxis, unit) : ""}
          </text>
          <text
            x={focusX}
            y={pad.t + plotH + 22}
            textAnchor="middle"
            fill={focusColor}
            className="cross-value"
          >
            {formatCost(focus.cost)}
          </text>
          <text
            x={focusX > pad.l + 120 ? focusX - 14 : focusX + 14}
            y={focusY - 16}
            textAnchor={focusX > pad.l + 120 ? "end" : "start"}
            fill={focusColor}
            className="cross-name"
          >
            <tspan x={focusX > pad.l + 120 ? focusX - 14 : focusX + 14} dy="0">
              {focus.model}
            </tspan>
            {focus.effort ? (
              <tspan x={focusX > pad.l + 120 ? focusX - 14 : focusX + 14} dy="16">
                ({focus.effort.toLowerCase()})
              </tspan>
            ) : null}
          </text>
        </g>
      ) : null}
    </svg>
  )
}
