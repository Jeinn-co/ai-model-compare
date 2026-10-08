import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { PROVIDERS, compareModels, modelLine, seriesColor, type ProviderId, type Row } from "./bench"
import { LOGO_PATHS } from "./logos"

type Props = {
  rows: Row[]
  previous: ReadonlyMap<string, number>
  hiddenProviders: ReadonlySet<ProviderId>
  hiddenModels: ReadonlySet<string>
  onToggleProvider: (id: ProviderId) => void
  onSetModels: (models: readonly string[], visible: boolean) => void
}

// Consecutive models of one line, under a title: "GPT Sol" for Codex lines, else the line name.
function groupsOf(models: { model: string; points: number }[]) {
  const groups: { line: string; title: string; items: { model: string; points: number }[] }[] = []
  for (const item of models) {
    const { line } = modelLine(item.model)
    const last = groups[groups.length - 1]
    if (last && last.line === line) last.items.push(item)
    else groups.push({ line, title: item.model.startsWith("GPT-") ? `GPT ${line}` : line, items: [item] })
  }
  return groups
}

// Models of one provider in menu order, with how many points each has.
function modelsOf(rows: Row[], provider: ProviderId) {
  const byModel = new Map<string, { model: string; points: number }>()
  for (const row of rows) {
    if (row.provider !== provider) continue
    const entry = byModel.get(row.model) ?? { model: row.model, points: 0 }
    entry.points++
    byModel.set(row.model, entry)
  }
  return [...byModel.values()].sort((a, b) => compareModels(a.model, b.model))
}

export default function Legend({ rows, previous, hiddenProviders, hiddenModels, onToggleProvider, onSetModels }: Props) {
  const [open, setOpen] = useState<ProviderId | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const menu = menuRef.current
      if (!menu) return
      const trigger = menu.parentElement?.getBoundingClientRect()
      if (!trigger) return
      const availableRight = document.documentElement.clientWidth - 12
      const left = Math.max(12 - trigger.left, Math.min(0, availableRight - trigger.left - menu.offsetWidth))
      menu.style.left = `${left}px`
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="legend" role="group" aria-label="Visible providers" ref={ref}>
      {PROVIDERS.map((provider) => {
        const models = modelsOf(rows, provider.id)
        if (models.length === 0) return null
        const total = models.reduce((sum, item) => sum + item.points, 0)
        const shown = models.filter((item) => !hiddenModels.has(item.model))
        const shownPoints = shown.reduce((sum, item) => sum + item.points, 0)
        const off = hiddenProviders.has(provider.id)
        const isOpen = open === provider.id
        return (
          <div key={provider.id} className={isOpen ? "chip-group open" : "chip-group"}>
            <button
              type="button"
              className={off ? "chip off" : "chip"}
              aria-pressed={!off}
              onClick={() => onToggleProvider(provider.id)}
            >
              <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
                <path d={LOGO_PATHS[provider.id]} fill={provider.color} fillRule="evenodd" clipRule="evenodd" />
              </svg>
              {provider.name}
              <span className="count" title={`${shownPoints} of ${total} points shown`}>
                {shownPoints === total ? total : `${shownPoints}/${total}`}
              </span>
            </button>
            <button
              type="button"
              className="chip-caret"
              aria-label={`Choose ${provider.name} models`}
              aria-haspopup="true"
              aria-expanded={isOpen}
              aria-controls={`models-${provider.id}`}
              onClick={() => setOpen(isOpen ? null : provider.id)}
            >
              ▾
            </button>
            {isOpen ? (
              <div className="menu" id={`models-${provider.id}`} role="group" aria-label={`${provider.name} models`} ref={menuRef}>
                <label className="menu-row menu-all">
                  <input
                    type="checkbox"
                    checked={shown.length === models.length}
                    ref={(input) => {
                      if (input) input.indeterminate = shown.length > 0 && shown.length < models.length
                    }}
                    onChange={(event) => onSetModels(models.map((item) => item.model), event.target.checked)}
                  />
                  All models
                </label>
                {groupsOf(models).map((group) => {
                  const groupShown = group.items.filter((item) => !hiddenModels.has(item.model)).length
                  return (
                    <div key={group.line} className="menu-group" role="group" aria-label={group.title}>
                      {group.items.length > 1 || groupsOf(models).length > 1 ? (
                        <label className="menu-row menu-group-title">
                          <input
                            type="checkbox"
                            checked={groupShown === group.items.length}
                            ref={(input) => {
                              if (input) input.indeterminate = groupShown > 0 && groupShown < group.items.length
                            }}
                            onChange={(event) => onSetModels(group.items.map((item) => item.model), event.target.checked)}
                          />
                          {group.title}
                        </label>
                      ) : null}
                      {group.items.map((item) => (
                        <label key={item.model} className="menu-row menu-item">
                          <input
                            type="checkbox"
                            checked={!hiddenModels.has(item.model)}
                            onChange={(event) => onSetModels([item.model], event.target.checked)}
                          />
                          <span
                            className="swatch"
                            style={{ background: seriesColor(item.model, provider.id, previous.get(item.model)) }}
                          />
                          <span className="menu-name">{item.model}</span>
                          <span className="count">{item.points}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
