import type { Translate } from "./language"
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

const ARENAS: readonly { id: ArenaId }[] = [{ id: "webdev" }, { id: "text" }]

const SOURCE_URL = "https://lmarena.ai/leaderboard"
const TOP = 20

// Human preference from LMArena, shown under the chart. It has no cost, so it is a ranked
// list rather than another chart source. It is a ranking of its own, so the chart's chip
// switches do not filter it.
export default function Arena({ t }: { t: Translate }) {
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

  const listed = (rows ?? []).filter((row) => row.arena === arena)
  const shown = all ? listed : listed.slice(0, TOP)

  return (
    <section className="arena" aria-labelledby="arena-title">
      <div className="arena-head">
        <div>
          <p className="eyebrow">LMArena</p>
          <h2 id="arena-title">{t("human_preference")}</h2>
          <p className="arena-note">
            {t("people_compare_two_anonymous_answers_and_vote_for_the_better") }
          </p>
        </div>
        <div className="segmented" role="group" aria-label={t("arena")}>
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
              {t(item.id === "text" ? "arena_text" : "arena_webdev")}
            </button>
          ))}
        </div>
      </div>

      {error && !rows ? (
        <div className="table-wrap arena-empty">{t("couldn_t_load_lmarena")} ({error}).</div>
      ) : !rows ? (
        <div className="table-wrap arena-empty">{t("loading_lmarena")}</div>
      ) : listed.length === 0 ? (
        <div className="table-wrap arena-empty">{t("arena_no_ratings", { arena: t(arena === "text" ? "arena_text" : "arena_webdev") })}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">{t("rank")}</th>
                <th>{t("model")}</th>
                <th className="num">{t("score")}</th>
                <th className="num minor">{t("confidence_interval")}</th>
                <th className="num minor">{t("votes")}</th>
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
          {t(arena === "text" ? "arena_text_note" : "arena_webdev_note")}
        </span>
        {listed[0]?.date ? <span>{t("published")} {listed[0].date}</span> : null}
        <a href={SOURCE_URL}>lmarena.ai</a>
        {listed.length > TOP ? (
          <button type="button" className="segment" onClick={() => setAll((value) => !value)}>
            {all ? t("arena_show_top", { count: TOP }) : t("arena_show_all", { count: listed.length })}
          </button>
        ) : null}
      </p>
    </section>
  )
}
