'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  btn,
  btnGhost,
  Card,
  getJson,
  Help,
  input,
  money,
  pct,
  post,
  ResultBanner,
  SectionPageWrapper,
  type Result,
} from './_components'

// ── 型別 ───────────────────────────────────────────────────────────
interface ProgressData {
  success: boolean
  roundDate?: string
  season?: { id: number; name?: string } | null
  progress?: Array<{ phase: string; note: string | null; created_at: string | null }>
  leaderboard?: Array<{ agent_id: number; agent_name: string; owner_name: string | null; equity: number; return_pct: number; round_date: string | null; rounds: number }>
}

interface ArenaAgent {
  id: number
  name: string
  division: string
  strategyId: string
  strategyNameZh: string
  tone: string
  toneName: string
  personality: string
  strategyParams: Record<string, unknown> | null
  initialCapital: number
  cash: number
  equity: number
  returnPct: number | null
  rounds: number
  isSystem: boolean
  status: string
  lastRoundDate: string | null
  joinedAt: string | null
  holdings: Array<{ symbol: string; name: string | null; shares: number; avgCost: number }>
}

interface RoundData {
  success: boolean
  roundDate: string
  briefing: { content: string; model: string | null; fallbackUsed: boolean } | null
  discussion: { content: string; model: string | null; fallbackUsed: boolean } | null
  universe: Array<{ symbol: string; name: string | null }>
  intraday: Record<number, { timeLabel: string | null; rows: Array<{ symbol: string; price: number; changePct: number | null }> }>
  standings: Array<{ agentId: number; agentName: string; strategyId: string; tone: string; equity: number; cash: number; returnPct: number | null; roundDate: string | null; rounds: number }>
  equitySeries: Record<number, Array<{ roundDate: string; cash: number; equity: number; returnPct: number }>>
}

interface RoundDecision {
  id: number
  phase: string
  phaseName: string
  slot: number | null
  content: string
  model: string | null
  fallbackUsed: boolean
  createdAt: string | null
}

interface DecisionData {
  success: boolean
  roundDate: string
  phases: string[]
  perAgent: Record<number, RoundDecision[]>
  trades: Array<{
    id: number
    agentId: number
    slot: number | null
    action: string
    symbol: string | null
    symbolName: string | null
    shares: number | null
    price: number | null
    fee: number | null
    tax: number | null
    reason: string | null
    model: string | null
    fallbackUsed: boolean
    error: string | null
  }>
}

const PHASE_HELP: Record<string, string> = {
  premarket: '晨間執行一次：建立今日股票池＋產出市場簡報與各 agent 盤前計畫。',
  slot: '盤中四個時點各決策一次（09:30 / 10:30 / 11:30 / 12:30-13:25），以當下即時價決定買賣。',
  close: '收盤後結算：寫入權益快照（equity／報酬率）並產出收後自評與圓桌討論。',
}

export function ArenaClient() {
  const [result, setResult] = useState<Result>(null)
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [agents, setAgents] = useState<ArenaAgent[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<number, { personality: string }>>({})
  const [saveId, setSaveId] = useState<number | null>(null)

  const [roundDate, setRoundDate] = useState<string>('')
  const [round, setRound] = useState<RoundData | null>(null)
  const [decisions, setDecisions] = useState<DecisionData | null>(null)
  const [tradesByAgent, setTradesByAgent] = useState<Record<number, DecisionData['trades']>>({})

interface LeaderRow {
  agent_id: number
  agent_name: string
  owner_name: string | null
  equity: number
  return_pct: number | null
  round_date: string | null
  rounds: number
}

const lbById = useMemo(() => {
  const m = new Map<number, LeaderRow>()
  for (const a of progress?.leaderboard ?? []) m.set(a.agent_id, a)
  return m
}, [progress])

  const load = async (rd?: string) => {
    const date = rd ?? roundDate
    const [p, g, r, d] = await Promise.all([
      getJson('/api/admin/arena/progress'),
      getJson('/api/admin/arena/agents'),
      date ? getJson(`/api/admin/arena/round?round_date=${encodeURIComponent(date)}`) : null,
      date ? getJson(`/api/admin/arena/decisions?round_date=${encodeURIComponent(date)}`) : null,
    ])
    if (p.ok && p.body.success) {
      setProgress(p.body)
      if (!date) setRoundDate(p.body.roundDate ?? '')
    }
    if (g.ok && g.body.success) setAgents(g.body.agents ?? [])
    if (r && r.ok && r.body.success) setRound(r.body)
    if (d && d.ok && d.body.success) {
      setDecisions(d.body)
      const byAgent: Record<number, DecisionData['trades']> = {}
      for (const t of d.body.trades ?? []) (byAgent[t.agentId] ??= []).push(t)
      setTradesByAgent(byAgent)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pickRound = async (rd: string) => {
    setRoundDate(rd)
    const [r, d] = await Promise.all([
      getJson(`/api/admin/arena/round?round_date=${encodeURIComponent(rd)}`),
      getJson(`/api/admin/arena/decisions?round_date=${encodeURIComponent(rd)}`),
    ])
    if (r.ok && r.body.success) setRound(r.body)
    if (d.ok && d.body.success) {
      setDecisions(d.body)
      const byAgent: Record<number, DecisionData['trades']> = {}
      for (const t of d.body.trades ?? []) (byAgent[t.agentId] ??= []).push(t)
      setTradesByAgent(byAgent)
    }
  }

  const run = async (phase: 'premarket' | 'slot' | 'close', slot?: number, force = false) => {
    setBusy(`${phase}${slot ?? ''}`)
    const r = await post('/api/admin/arena/tick', { phase, slot, force })
    setBusy(null)
    setResult(
      r.ok
        ? {
            ok: r.body.success,
            message: r.body.success
              ? `${phase}${slot != null ? ` slot${slot}` : ''} 完成：processed=${r.body.processed ?? 0} trades=${r.body.trades ?? 0} errors=${JSON.stringify(r.body.errors ?? [])}${r.body.alreadyRun ? '（已跑過）' : ''}`
              : `${phase} 失敗：${r.body.error ?? ''}`,
          }
        : { ok: false, message: `${phase} 失敗：${r.body?.error ?? ''}` },
    )
    await load(roundDate || undefined)
  }

  const saveAgent = async (id: number) => {
    setSaveId(id)
    const personality = edits[id]?.personality ?? ''
    const r = await post('/api/admin/arena/agents', { id, personality })
    setSaveId(null)
    setResult(r.ok && r.body.success ? { ok: true, message: `已更新 agent #${id}` } : { ok: false, message: `更新失敗：${r.body?.error ?? ''}` })
    const g = await getJson('/api/admin/arena/agents')
    if (g.ok && g.body.success) setAgents(g.body.agents ?? [])
  }

  return (
    <SectionPageWrapper title="競技場管理" subtitle="依序執行 盤前 → 盤中四次 → 收盤結算；每 agent 可看決策歷程與權益">
      <ResultBanner result={result} onDismiss={() => setResult(null)} />

      <Card title="當前輪次">
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          輪次 <code className="text-[var(--accent)]">{progress?.roundDate ?? '—'}</code>
          {progress?.season?.name ? `・${progress.season.name}` : ''}
        </p>
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-2">
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={() => run('premarket')} disabled={!!busy}>
              跑 Pre-market
            </button>
            {[0, 1, 2, 3].map((s) => (
              <button key={s} className={btnGhost} onClick={() => run('slot', s)} disabled={!!busy}>
                Slot {s}
              </button>
            ))}
            <button className={btnGhost} onClick={() => run('close')} disabled={!!busy}>
              收盤結算
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Help text={`${PHASE_HELP.premarket}\n\n${PHASE_HELP.slot}\n\n${PHASE_HELP.close}`} />
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">階段進度</h3>
          {(progress?.progress?.length ?? 0) === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">今日無階段完成紀錄</p>
          ) : (
            <ul className="text-sm space-y-1">
              {progress!.progress!.map((p) => (
                <li key={p.phase}>
                  <code className="text-[var(--accent)]">{p.phase}</code>{' '}
                  <span className="text-[var(--text-secondary)]">— {p.note ?? ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">排行榜（最新輪次）</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-secondary)] uppercase tracking-wide">
                  <th className="py-2 pr-4">Agent</th>
                  <th className="py-2 pr-4">擁有者</th>
                  <th className="py-2 pr-4 text-right">權益</th>
                  <th className="py-2 text-right">報酬率</th>
                </tr>
              </thead>
              <tbody>
                {(progress?.leaderboard?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-[var(--text-secondary)]">尚無資料</td>
                  </tr>
                ) : (
                  progress!.leaderboard!.map((a) => (
                    <tr key={a.agent_id} className="border-t border-white/5">
                      <td className="py-2 pr-4 text-[var(--text-primary)]">{a.agent_name}</td>
                      <td className="py-2 pr-4 text-[var(--text-secondary)]">{a.owner_name ?? '—'}</td>
                      <td className="py-2 pr-4 text-right text-[var(--text-primary)]">{money(a.equity)}</td>
                      <td className={`py-2 text-right ${Number(a.return_pct) >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>{pct(a.return_pct)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card title="Agent 清單（點擊展開編輯）">
        {agents.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">載入中…</p>
        ) : (
          <div className="space-y-3">
            {agents.map((a) => {
              const lb = lbById.get(a.id)
              return (
                <details key={a.id} className="group rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium text-[var(--text-primary)]">{a.name}</span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {a.division === 'season' ? '季賽' : '公開'}・{a.strategyNameZh}・{a.toneName}
                    </span>
                    <span className="ml-auto text-xs">
                      權益 <b className={lb?.return_pct != null && Number(lb.return_pct) >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}>{money(a.equity)}</b>{' '}
                      <span className="text-[var(--text-secondary)]">（{pct(lb?.return_pct ?? a.returnPct)}・{a.rounds} 輪）</span>
                    </span>
                  </summary>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Personality / 決策 Prompt</label>
                      <div className="flex gap-2">
                        <textarea
                          className={input + ' min-h-[88px]'}
                          value={edits[a.id]?.personality ?? a.personality ?? ''}
                          onChange={(e) => setEdits((d) => ({ ...d, [a.id]: { personality: e.target.value } }))}
                          aria-label={`agent ${a.name} personality`}
                        />
                        <button className={btnGhost + ' shrink-0 self-start'} onClick={() => saveAgent(a.id)} disabled={saveId === a.id}>
                          存
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">strategy_params：{a.strategyParams ? JSON.stringify(a.strategyParams) : '—'}</p>
                    </div>
                    {a.holdings.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">目前持股</h4>
                        <ul className="text-sm space-y-1">
                          {a.holdings.map((h) => (
                            <li key={h.symbol} className="text-[var(--text-secondary)]">
                              {h.name ?? h.symbol}（{h.symbol}）· {h.shares} 股 · 成本 {h.avgCost}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {a.holdings.length === 0 && <p className="text-sm text-[var(--text-secondary)]">無持股</p>}
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="輪次資料" hint="預設看今日；可輸入其他交易日查看歷史輪次。">
        <div className="flex items-center gap-2 mb-4">
          <label htmlFor="round-picker" className="text-sm text-[var(--text-secondary)]">交易日</label>
          <input
            id="round-picker"
            type="date"
            className={input + ' max-w-[180px]'}
            value={roundDate}
            onChange={(e) => {
              if (e.target.value) pickRound(e.target.value)
              else setRoundDate('')
            }}
          />
          <Help text="選擇過往交易日回顧該輪的當輪結果、每 agent 決策歷程與權益曲線。" />
        </div>

        {round && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--accent)] mb-2">當輪簡報（briefing）</h3>
                {round.briefing?.content ? (
                  <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-4">{round.briefing.content}</p>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">尚未產出（先跑 Pre-market）</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--accent)] mb-2">收盤討論（discussion）</h3>
                {round.discussion?.content ? (
                  <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-4">{round.discussion.content}</p>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">尚未產出（先跑收盤結算）</p>
                )}
              </div>
            </div>

            {Object.keys(round.intraday).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[var(--accent)] mb-2">盤中時點（intraday）</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {Object.entries(round.intraday).map(([slot, s]) => (
                    <div key={slot} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                      <div className="mb-1 text-xs text-[var(--text-secondary)]">slot {slot} {s.timeLabel ?? ''}</div>
                      <ul className="space-y-0.5">
                        {s.rows.slice(0, 6).map((r) => (
                          <li key={r.symbol} className="text-[var(--text-primary)]">
                            {r.symbol} {r.price}
                            {r.changePct != null ? `（${pct(r.changePct)}）` : ''}
                          </li>
                        ))}
                        {s.rows.length > 6 && <li className="text-xs text-[var(--text-secondary)]">…共 {s.rows.length} 檔</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {round.standings.length > 0 && (
              <EquityCards standings={round.standings} series={round.equitySeries} />
            )}
          </div>
        )}
      </Card>

      <Card title="每 Agent 決策歷程" hint="decision log → 每筆交易的買賣價／股數／理由／模型／是否 fallback">
        {!decisions ? (
          <p className="text-sm text-[var(--text-secondary)]">載入中…</p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">暫無 agent</p>
        ) : (
          <div className="space-y-5">
            {agents.map((a) => {
              const logs = decisions.perAgent[a.id] ?? []
              const trades = tradesByAgent[a.id] ?? []
              if (logs.length === 0 && trades.length === 0) {
                return (
                  <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{a.name}</h3>
                    <p className="text-sm text-[var(--text-secondary)]">此輪無決策／交易紀錄</p>
                  </div>
                )
              }
              return (
                <details key={a.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4" open={logs.length > 0}>
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">
                    {a.name}
                    <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">
                      {logs.length} 筆決策・{trades.length} 筆成交
                    </span>
                  </summary>
                  <div className="mt-3 space-y-4 text-sm">
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">決策紀錄</h4>
                      {logs.length === 0 ? (
                        <p className="text-[var(--text-secondary)]">無紀錄</p>
                      ) : (
                        <ul className="space-y-2">
                          {logs.map((l) => (
                            <li key={l.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                                <code className="text-[var(--accent)]">{l.phaseName}</code>
                                {l.fallbackUsed && <span className="text-[var(--accent-violet)]">fallback</span>}
                                <span className="text-[var(--text-secondary)]">{l.model ?? ''}{l.createdAt ? `・${l.createdAt}` : ''}</span>
                              </div>
                              <pre className="whitespace-pre-wrap text-[var(--text-secondary)]">{l.content}</pre>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">成交明細</h4>
                      {trades.length === 0 ? (
                        <p className="text-[var(--text-secondary)]">無成交</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-[var(--text-secondary)] uppercase tracking-wide">
                                <th className="py-1 pr-3">動作</th>
                                <th className="py-1 pr-3">標的</th>
                                <th className="py-1 pr-3 text-right">股數</th>
                                <th className="py-1 pr-3 text-right">價格</th>
                                <th className="py-1 pr-3">理由</th>
                                <th className="py-1">模型</th>
                              </tr>
                            </thead>
                            <tbody>
                              {trades.map((t) => (
                                <tr key={t.id} className="border-t border-white/5">
                                  <td className={`py-1.5 pr-3 ${t.action === 'BUY' ? 'text-[var(--accent-green)]' : t.action === 'SELL' ? 'text-[var(--accent-red)]' : ''}`}>{t.action}</td>
                                  <td className="py-1.5 pr-3 text-[var(--text-primary)]">{t.symbolName ?? t.symbol ?? '—'}（{t.symbol ?? '—'}）</td>
                                  <td className="py-1.5 pr-3 text-right">{t.shares ?? '—'}</td>
                                  <td className="py-1.5 pr-3 text-right">{t.price ?? '—'}</td>
                                  <td className="py-1.5 pr-3 text-[var(--text-secondary)]">{t.reason ?? '—'}</td>
                                  <td className="py-1.5 text-xs text-[var(--text-secondary)]">{t.model ?? ''}{t.error ? `（${t.error}）` : ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </Card>
    </SectionPageWrapper>
  )
}

function EquityCards({ standings, series }: { standings: RoundData['standings']; series: RoundData['equitySeries'] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--accent)] mb-2">權益曲線</h3>
      {standings.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">尚無資料</p>
      ) : (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {standings.map((s) => (
              <div key={s.agentId} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{s.agentName}</span>
                  <span className={`text-sm ${Number(s.returnPct) >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>{pct(s.returnPct)}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                  權益 {money(s.equity)}・{s.rounds} 輪
                </div>
                <EquitySparkline points={(series[s.agentId] ?? []).map((p) => p.equity)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** 純 CSS 長條 sparkline：以每個 round 的 equity 高度視覺化走勢。 */
function EquitySparkline({ points }: { points: number[] }) {
  if (points.length === 0) return <p className="mt-2 text-xs text-[var(--text-secondary)]">尚無快照</p>
  const max = Math.max(...points, 1)
  return (
    <div className="mt-3 flex items-end gap-1 h-12" role="img" aria-label="權益走勢">
      {points.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-[var(--accent)]/70"
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}