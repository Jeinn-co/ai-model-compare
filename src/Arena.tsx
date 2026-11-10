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

const ARENAS: readonly { id: ArenaId; name: string; note: string }[] = [
  { id: "webdev", name: "WebDev", note: "building web apps from a prompt" },
  { id: "text", name: "Text", note: "general chat, the original Chatbot Arena" },
]

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
  const meta = ARENAS.find((item) => item.id === arena) ?? ARENAS[0]

  return (
    <section className="arena" aria-labelledby="arena-title">
      <div className="arena-head">
        <div>
          <p className="eyebrow">LMArena</p>
          <h2 id="arena-title">{t("Human preference", "使用者偏好")}</h2>
          <p className="arena-note">
            {t("People compare two anonymous answers and vote for the better one. LMArena fits every vote at once (Bradley-Terry) into an Elo-style score: who a model beats, and how often, counts, not how many votes it gets. Rank follows the score. Fewer votes only widen the 95% CI, so a model with a wide CI may really sit several places higher or lower. No cost, so it is a list, not a chart.",
              "使用者比較兩個匿名回答，投票選出較好的一個。LMArena 以 Bradley-Terry 模型統整所有投票，計算類似 Elo 的分數；重點是擊敗哪些模型及勝率，而非票數多寡。排名依分數排列。票數較少會擴大 95% 信賴區間，因此區間較寬的模型，實際名次可能高或低好幾名。此資料沒有成本，故以排行榜呈現。") }
          </p>
        </div>
        <div className="segmented" role="group" aria-label={t("Arena", "競技場分類")}>
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
              {t(item.name, item.id === "text" ? "文字" : "網頁開發")}
            </button>
          ))}
        </div>
      </div>

      {error && !rows ? (
        <div className="table-wrap arena-empty">{t("Couldn't load LMArena", "無法載入 LMArena")} ({error}).</div>
      ) : !rows ? (
        <div className="table-wrap arena-empty">{t("Loading LMArena…", "載入 LMArena 中…")}</div>
      ) : listed.length === 0 ? (
        <div className="table-wrap arena-empty">{t(`No ${meta.name} ratings yet.`, `尚無${arena === "webdev" ? "網頁開發" : "文字"}評分。`)}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">{t("Rank", "排名")}</th>
                <th>{t("Model", "模型")}</th>
                <th className="num">{t("Score", "分數")}</th>
                <th className="num minor">{t("95% CI", "95% 信賴區間")}</th>
                <th className="num minor">{t("Votes", "票數")}</th>
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
          {t(`${meta.name}: ${meta.note}. Rank is LMArena's own, among all models it rates.`, `${arena === "webdev" ? "網頁開發" : "文字"}：${arena === "webdev" ? "依提示建立網頁應用程式" : "一般對話，原始 Chatbot Arena"}。名次為 LMArena 在其所有受評模型中的排名。`)}
        </span>
        {listed[0]?.date ? <span>{t("Published", "發布日期")} {listed[0].date}</span> : null}
        <a href={SOURCE_URL}>lmarena.ai</a>
        {listed.length > TOP ? (
          <button type="button" className="segment" onClick={() => setAll((value) => !value)}>
            {all ? t(`Show top ${TOP}`, `顯示前 ${TOP} 名`) : t(`Show all ${listed.length}`, `顯示全部 ${listed.length} 個模型`)}
          </button>
        ) : null}
      </p>
    </section>
  )
}
