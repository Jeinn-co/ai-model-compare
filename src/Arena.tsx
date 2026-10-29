import { useEffect, useState } from "react"
import { providerById, type ProviderId } from "./bench"

type ArenaId = "text" | "webdev"

type ArenaRow = {
  arena: ArenaId
  rank: number
  name: string
  provider: ProviderId
  score: number
  lower: number
  upper: number
  votes: number
  date: string
}

const ARENAS: readonly { id: ArenaId; name: string; note: string }[] = [
  { id: "webdev", name: "WebDev", note: "building web apps from a prompt" },
  { id: "text", name: "Text", note: "general chat, the original Chatbot Arena" },
]

const SOURCE_URL = "https://lmarena.ai/leaderboard"
const TOP = 20

// Human preference from LMArena, shown under the chart. It has no cost, so it is a ranked
// list rather than another chart source. The chip switches above hide a CLI here too.
export default function Arena({ hiddenProviders }: { hiddenProviders: ReadonlySet<ProviderId> }) {
  const [rows, setRows] = useState<ArenaRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [arena, setArena] = useState<ArenaId>("webdev")
  const [all, setAll] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const url = import.meta.env.DEV ? "/api/bench?source=arena" : `${import.meta.env.BASE_URL}data/arena.json`
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { rows?: ArenaRow[]; error?: string }
        if (!response.ok || !body.rows?.length) throw new Error(body.error ?? String(response.status))
        setRows(body.rows)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Failed to load")
      })
    return () => controller.abort()
  }, [])

  const listed = (rows ?? []).filter((row) => row.arena === arena && !hiddenProviders.has(row.provider))
  const shown = all ? listed : listed.slice(0, TOP)
  const meta = ARENAS.find((item) => item.id === arena) ?? ARENAS[0]

  return (
    <section className="arena" aria-labelledby="arena-title">
      <div className="arena-head">
        <div>
          <p className="eyebrow">LMArena</p>
          <h2 id="arena-title">Human preference</h2>
          <p className="arena-note">
            People compare two anonymous answers and vote for the better one. LMArena fits every vote at once
            (Bradley-Terry) into an Elo-style score: who a model beats, and how often, counts, not how many votes it
            gets. Rank follows the score. Fewer votes only widen the 95% CI, so a model with a wide CI may really sit
            several places higher or lower. No cost, so it is a list, not a chart.
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Arena">
          {ARENAS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === arena ? "segment on" : "segment"}
              aria-pressed={item.id === arena}
              onClick={() => {
                setArena(item.id)
                setAll(false)
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      {error && !rows ? (
        <div className="table-wrap arena-empty">Couldn't load LMArena ({error}).</div>
      ) : !rows ? (
        <div className="table-wrap arena-empty">Loading LMArena…</div>
      ) : listed.length === 0 ? (
        <div className="table-wrap arena-empty">No {meta.name} ratings for the CLIs switched on.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">Rank</th>
                <th>Model</th>
                <th className="num">Score</th>
                <th className="num minor">95% CI</th>
                <th className="num minor">Votes</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.name}>
                  <td className="num">{row.rank}</td>
                  <td>
                    <span className="arena-model">
                      <span className="swatch" style={{ background: providerById(row.provider).color }} />
                      {row.name}
                    </span>
                  </td>
                  <td className="num arena-score">{Math.round(row.score)}</td>
                  <td className="num minor">±{Math.round((row.upper - row.lower) / 2)}</td>
                  <td className="num minor">{Math.round(row.votes).toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="readout">
        <span>
          {meta.name}: {meta.note}. Rank is LMArena's own, among all models it rates.
        </span>
        {listed[0]?.date ? <span>Published {listed[0].date}</span> : null}
        <a href={SOURCE_URL}>lmarena.ai</a>
        {listed.length > TOP ? (
          <button type="button" className="segment" onClick={() => setAll((value) => !value)}>
            {all ? `Show top ${TOP}` : `Show all ${listed.length}`}
          </button>
        ) : null}
      </p>
    </section>
  )
}
