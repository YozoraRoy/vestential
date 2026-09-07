'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pause, Play, Pencil, Trash2, Plus, RefreshCw, Trophy, Sparkles } from 'lucide-react'
import { useI18n } from '@/i18n/LanguageProvider'
import type { Dict } from '@/i18n/dictionaries'

type Division = 'season' | 'open'
type Tone = 'aggressive' | 'neutral' | 'conservative'

interface LeaderboardRow {
  agent_id: number
  agent_name: string
  owner_name: string | null
  division: Division
  strategy_id: string
  tone: string
  status: string
  is_system: number
  equity: number | null
  cash: number | null
  return_pct: number | null
  round_date: string | null
  rounds: number
  joined_at: string | null
}

interface Season {
  id: number
  name: string
  status: string
  start_date: string | null
  end_date: string | null
  registration_start: string | null
  registration_end: string | null
}

interface StateData {
  season: Season | null
  leaderboards: { season: LeaderboardRow[]; open: LeaderboardRow[] }
  agentsCount: number
}

interface Holding {
  symbol: string
  symbol_name: string | null
  shares: number
  avg_cost: number
}

interface Trade {
  id: number
  round_date: string
  action: string
  symbol: string | null
  symbol_name: string | null
  shares: number | null
  price: number | null
  reason: string | null
  error: string | null
}

interface MyData {
  agent: {
    id: number
    name: string
    division: Division
    strategy_id: string
    tone: Tone
    initial_capital: number
    cash: number
    status: 'active' | 'paused' | 'reset'
    last_round_date: string | null
    adjust_count: number
  } | null
  holdings: Holding[]
  snapshots: Array<{ round_date: string; equity: number; cash: number; return_pct: number }>
  trades: Trade[]
}

const STRATEGIES: Array<{ id: string; key: keyof Dict['portfolio'] }> = [
  { id: 'buffett', key: 'strategyBuffett' },
  { id: 'growth', key: 'strategyGrowth' },
  { id: 'dividend', key: 'strategyDividend' },
  { id: 'momentum', key: 'strategyMomentum' },
  { id: 'balanced', key: 'strategyBalanced' },
]

const fmt = (n: number | null | undefined, digits = 0): string =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits })

export function AgentArenaView({ homePath, loginPath }: { homePath: string; loginPath: string }) {
  const { dict } = useI18n()
  const router = useRouter()
  const d = dict.agentArena

  const [data, setData] = useState<StateData | null>(null)
  const [my, setMy] = useState<MyData | null>(null)
  const [tab, setTab] = useState<Division>('open')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fName, setFName] = useState('')
  const [fStrategy, setFStrategy] = useState('buffett')
  const [fTone, setFTone] = useState<Tone>('neutral')

  const reload = useCallback(async () => {
    const [stateRes, myRes] = await Promise.all([
      fetch('/api/agent-arena/state', { cache: 'no-store', next: { revalidate: 0 } }),
      fetch('/api/agent-arena/my', { cache: 'no-store', next: { revalidate: 0 } }),
    ])
    const state = stateRes.ok ? await stateRes.json() : null
    setData(state ?? { season: null, leaderboards: { season: [], open: [] }, agentsCount: 0 })
    if (myRes.ok) {
      const m = await myRes.json()
      setMy(m?.agent ? m : { agent: null, holdings: [], snapshots: [], trades: [] })
    }
  }, [])

  useEffect(() => {
    reload().catch(() => setError(d.actionFailed))
  }, [reload, d.actionFailed])

  const call = async (url: string, opts: RequestInit): Promise<{ ok: boolean; json?: any }> => {
    const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) } })
    const json = await res.json().catch(() => null)
    return { ok: res.ok, json }
  }

  const handleCreate = async () => {
    if (!fName.trim() || busy) return
    setBusy(true)
    setError(null)
    const { ok, json } = await call('/api/agent-arena/agents', {
      method: 'POST',
      body: JSON.stringify({ name: fName.trim(), division: 'open', strategyId: fStrategy, tone: fTone }),
    })
    setBusy(false)
    if (!ok) {
      setError(json?.error ?? d.createFailed)
      return
    }
    setCreating(false)
    setFName('')
    router.refresh()
    reload()
  }

  const handlePatch = async (body: Record<string, unknown>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const id = my?.agent?.id
    if (!id) return
    const { ok, json } = await call(`/api/agent-arena/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    setBusy(false)
    if (!ok) {
      setError(json?.error ?? d.updateFailed)
      return
    }
    setEditing(false)
    reload()
  }

  const handleStatus = async (action: 'pause' | 'resume') => {
    const id = my?.agent?.id
    if (!id || busy) return
    setBusy(true)
    setError(null)
    const { ok, json } = await call(`/api/agent-arena/agents/${id}/${action}`, { method: 'POST' })
    setBusy(false)
    if (!ok) setError(json?.error ?? d.actionFailed)
    else reload()
  }

  const handleDelete = async () => {
    const id = my?.agent?.id
    if (!id || busy) return
    setBusy(true)
    setError(null)
    const { ok, json } = await call(`/api/agent-arena/agents/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!ok) setError(json?.error ?? d.deleteFailed)
    else {
      setMy({ agent: null, holdings: [], snapshots: [], trades: [] })
      router.refresh()
      reload()
    }
  }

  if (!data) {
    return <div className="py-12 text-sm text-[var(--text-secondary)]">{d.loading}</div>
  }

  const strategyName = (id: string) => {
    const s = STRATEGIES.find((x) => x.id === id)
    return s ? dict.portfolio[s.key] : id
  }
  const toneName = (t: string) =>
    t === 'aggressive' ? d.toneAggressive : t === 'conservative' ? d.toneConservative : d.toneNeutral
  const divisionName = (dv: Division) => (dv === 'open' ? d.divisionOpen : d.divisionSeason)

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 px-4 py-3 text-sm text-[var(--accent-red)]">
          {error}
        </div>
      )}

      {/* 我的 Agent */}
      <section aria-label={d.myTitle}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{d.myTitle}</h2>
          <button
            onClick={() => reload()}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition"
          >
            <RefreshCw className="w-4 h-4" />
            {d.btnRefresh}
          </button>
        </div>

        {my?.agent ? (
          <div className="rounded-xl border border-white/5 bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-base font-semibold text-[var(--text-primary)]">{my.agent.name}</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full ${
                  my.agent.status === 'active'
                    ? 'bg-[var(--accent-green)]/15 text-[var(--accent-green)]'
                    : 'bg-white/10 text-[var(--text-secondary)]'
                }`}
              >
                {my.agent.status === 'active' ? d.statusActive : d.statusPaused}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-[var(--text-secondary)]">
                {divisionName(my.agent.division)}
              </span>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">{d.capital}</dt>
                <dd className="text-[var(--text-primary)] font-medium">{d.currency}{fmt(my.agent.initial_capital)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">{d.strategyLabel}</dt>
                <dd className="text-[var(--text-primary)]">{strategyName(my.agent.strategy_id)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">{d.toneLabel}</dt>
                <dd className="text-[var(--text-primary)]">{toneName(my.agent.tone)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">{d.colEquity}</dt>
                <dd className="text-[var(--text-primary)] font-medium">
                  {d.currency}
                  {fmt(my.snapshots[my.snapshots.length - 1]?.equity ?? my.agent.cash)}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => setEditing((v) => !v)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-[var(--text-primary)] hover:border-[var(--accent)]/50 transition disabled:opacity-50"
              >
                <Pencil className="w-4 h-4" />
                {d.btnEdit}
              </button>
              {my.agent.status === 'active' ? (
                <button
                  onClick={() => handleStatus('pause')}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-[var(--text-primary)] hover:border-[var(--accent)]/50 transition disabled:opacity-50"
                >
                  <Pause className="w-4 h-4" />
                  {d.btnPause}
                </button>
              ) : (
                <button
                  onClick={() => handleStatus('resume')}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-[var(--text-primary)] hover:border-[var(--accent-green)]/50 transition disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {d.btnResume}
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent-red)]/40 text-sm text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {d.btnDelete}
              </button>
            </div>

            {editing && (
              <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">{d.nameLabel}</label>
                  <input
                    defaultValue={my.agent.name}
                    onChange={(e) => setFName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">{d.strategyLabel}</label>
                  <select
                    value={fStrategy || my.agent.strategy_id}
                    onChange={(e) => setFStrategy(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] [&>option]:bg-[var(--bg-secondary)] [&>option]:text-[var(--text-primary)]"
                  >
                    {STRATEGIES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {dict.portfolio[s.key]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">{d.toneLabel}</label>
                  <select
                    value={fTone || my.agent.tone}
                    onChange={(e) => setFTone(e.target.value as Tone)}
                    className="w-full rounded-lg border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] [&>option]:bg-[var(--bg-secondary)] [&>option]:text-[var(--text-primary)]"
                  >
                    <option value="aggressive">{d.toneAggressive}</option>
                    <option value="neutral">{d.toneNeutral}</option>
                    <option value="conservative">{d.toneConservative}</option>
                  </select>
                </div>
                <div className="sm:col-span-3 flex gap-2">
                  <button
                    onClick={() =>
                      handlePatch({
                        name: fName.trim() ? fName.trim() : my.agent!.name,
                        strategyId: fStrategy || my.agent!.strategy_id,
                        tone: fTone || my.agent!.tone,
                      })
                    }
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                  >
                    {d.btnSave}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 rounded-lg border border-white/10 text-sm text-[var(--text-secondary)] hover:border-white/30 transition"
                  >
                      {d.btnCancel}
                    </button>
                  </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-4 border-t border-white/5">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{d.holdingsTitle}</h3>
                {my.holdings.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">{d.noHoldings}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {my.holdings.map((h) => (
                      <li key={h.symbol} className="text-sm text-[var(--text-secondary)]">
                        {h.symbol} {h.symbol_name ?? ''} — {fmt(h.shares)} {d.colShares} @ {d.currency}
                        {fmt(h.avg_cost, 2)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{d.tradesTitle}</h3>
                {my.trades.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">{d.noTrades}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {my.trades.slice(0, 8).map((t) => (
                      <li key={t.id} className="text-sm text-[var(--text-secondary)]">
                        <span className="text-[var(--text-primary)] font-medium">{t.round_date}</span>{' '}
                        <span className={t.action === 'BUY' ? 'text-[var(--accent-green)]' : t.action === 'SELL' ? 'text-[var(--accent-red)]' : ''}>
                          {t.action}
                        </span>
                        {t.symbol ? ` ${t.symbol}` : ''}
                        {t.shares ? ` ${fmt(t.shares)}股` : ''}
                        {t.price != null ? ` @ ${d.currency}${fmt(t.price, 2)}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-[var(--bg-card)] p-5">
            <p className="text-sm text-[var(--text-secondary)] mb-4">{d.noAgent}</p>

            {!data.season ? (
              <p className="text-sm text-[var(--text-secondary)]">{d.noSeason}</p>
            ) : my === null ? (
              <p className="text-sm text-[var(--text-secondary)]">{d.notLoggedIn}</p>
            ) : creating ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">{d.nameLabel}</label>
                  <input
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder={d.namePlaceholder}
                    className="w-full rounded-lg border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">{d.strategyLabel}</label>
                  <select
                    value={fStrategy}
                    onChange={(e) => setFStrategy(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] [&>option]:bg-[var(--bg-secondary)] [&>option]:text-[var(--text-primary)]"
                  >
                    {STRATEGIES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {dict.portfolio[s.key]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">{d.toneLabel}</label>
                  <select
                    value={fTone}
                    onChange={(e) => setFTone(e.target.value as Tone)}
                    className="w-full rounded-lg border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] [&>option]:bg-[var(--bg-secondary)] [&>option]:text-[var(--text-primary)]"
                  >
                    <option value="aggressive">{d.toneAggressive}</option>
                    <option value="neutral">{d.toneNeutral}</option>
                    <option value="conservative">{d.toneConservative}</option>
                  </select>
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={busy || !fName.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {busy ? d.btnCreating : d.btnCreate}
                  </button>
                  <button
                    onClick={() => setCreating(false)}
                    className="px-4 py-2 rounded-lg border border-white/10 text-sm text-[var(--text-secondary)] hover:border-white/30 transition"
                  >
                    {d.btnCancel}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition"
              >
                <Plus className="w-4 h-4" />
                {d.createTitle}
              </button>
            )}
          </div>
        )}
      </section>

      {/* 排行榜 */}
      <section aria-labelledby="arena-leaderboard">
        <div className="flex items-center justify-between mb-3">
          <h2 id="arena-leaderboard" className="text-lg font-semibold text-[var(--text-primary)] inline-flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[var(--accent)]" />
            {d.leaderboardTitle}
          </h2>
          {data.season && <span className="text-xs text-[var(--text-secondary)]">{data.season.name}</span>}
        </div>

        <div className="flex gap-1 mb-4">
          {(['season', 'open'] as Division[]).map((dv) => (
            <button
              key={dv}
              onClick={() => setTab(dv)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                tab === dv
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-white/10 text-[var(--text-secondary)] hover:border-white/30'
              }`}
            >
              {dv === 'season' ? d.divisionSeason : d.divisionOpen}
            </button>
          ))}
        </div>

        {(() => {
          const rows = data.leaderboards[tab] ?? []
          if (rows.length === 0) return <p className="text-sm text-[var(--text-secondary)]">{d.emptyLeaderboard}</p>
          return (
            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-secondary)] border-b border-white/5">
                    <th className="px-3 py-2.5 font-medium">{d.colRank}</th>
                    <th className="px-3 py-2.5 font-medium">{d.colAgent}</th>
                    <th className="px-3 py-2.5 font-medium hidden sm:table-cell">{d.colStrategy}</th>
                    <th className="px-3 py-2.5 font-medium hidden md:table-cell">{d.colTone}</th>
                    <th className="px-3 py-2.5 font-medium">{d.colEquity}</th>
                    <th className="px-3 py-2.5 font-medium">{d.colReturn}</th>
                    <th className="px-3 py-2.5 font-medium hidden md:table-cell">{d.colRounds}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.agent_id} className="border-b border-white/5 last:border-0">
                      <td className="px-3 py-2.5 text-[var(--text-secondary)]">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">
                        {r.agent_name}
                        {r.is_system === 1 ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-[var(--accent-violet)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--accent-violet)]">
                            {d.systemBadge}
                          </span>
                        ) : r.owner_name ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                            @{r.owner_name}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-secondary)] hidden sm:table-cell">{strategyName(r.strategy_id)}</td>
                      <td className="px-3 py-2.5 text-[var(--text-secondary)] hidden md:table-cell">{toneName(r.tone)}</td>
                      <td className="px-3 py-2.5 text-[var(--text-primary)]">
                        {d.currency}
                        {fmt(r.equity)}
                      </td>
                      <td
                        className={`px-3 py-2.5 font-medium ${
                          (r.return_pct ?? 0) >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'
                        }`}
                      >
                        {fmt(r.return_pct, 2)}%
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-secondary)] hidden md:table-cell">{r.rounds}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}
      </section>

      {my === null && (
        <div className="rounded-xl border border-white/5 bg-[var(--bg-card)] p-5 text-center">
          <p className="text-sm text-[var(--text-secondary)] mb-3">{d.notLoggedIn}</p>
          <Link
            href={loginPath}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition"
          >
            <Sparkles className="w-4 h-4" />
            {d.loginCta}
          </Link>
        </div>
      )}

      <div className="text-center mt-8">
        <Link href={homePath} className="text-sm text-[var(--accent)] hover:underline">
          ← Back
        </Link>
      </div>
    </div>
  )
}