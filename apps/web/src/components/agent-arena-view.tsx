'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Pause,
  Play,
  Pencil,
  Trash2,
  Plus,
  RefreshCw,
  Trophy,
  Sparkles,
  Clock,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
  MessageSquare,
  FileText,
  Eye,
  Bot,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { useI18n } from '@/i18n/LanguageProvider'
import type { Dict } from '@/i18n/dictionaries'
import { MarkdownText } from '@/components/markdown-text'

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

interface DecisionLog {
  id: number
  agent_id: number
  round_date: string
  phase: string
  slot: number | null
  content: string
  model: string | null
  created_at?: string
}

interface StateData {
  season: Season | null
  leaderboards: { season: LeaderboardRow[]; open: LeaderboardRow[] }
  agentsCount: number
  latestRound?: {
    roundDate: string
    briefing: { content: string; model?: string | null } | null
    discussion: { content: string; model?: string | null } | null
  } | null
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
  slot?: number | null
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
    personality: string | null
    strategy_params: string | null
    initial_capital: number
    cash: number
    status: 'active' | 'paused' | 'reset'
    last_round_date: string | null
    adjust_count: number
  } | null
  holdings: Holding[]
  snapshots: Array<{ round_date: string; equity: number; cash: number; return_pct: number }>
  trades: Trade[]
  decisionLogs?: DecisionLog[]
}

interface AgentDetailData {
  agent: {
    id: number
    name: string
    division: Division
    strategy_id: string
    tone: Tone
    personality: string | null
    strategy_params: string | null
    initial_capital: number
    cash: number
    status: string
    last_round_date: string | null
    adjust_count?: number
    is_system?: number
    owner_name?: string | null
  }
  holdings: Holding[]
  snapshots: Array<{ round_date: string; equity: number; cash: number; return_pct: number }>
  trades: Trade[]
  decisionLogs?: DecisionLog[]
}

const STRATEGIES: Array<{ id: string; key: keyof Dict['portfolio'] }> = [
  { id: 'buffett', key: 'strategyBuffett' },
  { id: 'growth', key: 'strategyGrowth' },
  { id: 'dividend', key: 'strategyDividend' },
  { id: 'momentum', key: 'strategyMomentum' },
  { id: 'balanced', key: 'strategyBalanced' },
]

const PERSONALITY_PRESETS = [
  { id: 'decisive', label: '決斷型（即時反應、果斷執行）' },
  { id: 'zen', label: '佛系（低換手、讓獲利奔跑）' },
  { id: 'data', label: '數據控（依數字與紀律，理性客觀）' },
  { id: 'risk_averse', label: '風險趨避（保護本金、嚴格停損）' },
  { id: 'contrarian', label: '逆向（逢恐慌低接、逢過熱調節）' },
  { id: 'custom', label: '自訂特質...' },
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
  const [fPersonalityType, setFPersonalityType] = useState('decisive')
  const [fPersonalityCustom, setFPersonalityCustom] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [fMaxPosition, setFMaxPosition] = useState(30)
  const [fStopLoss, setFStopLoss] = useState(8)
  const [fMinCash, setFMinCash] = useState(10)
  const [fMaxTrades, setFMaxTrades] = useState(2)

  const [briefingOpen, setBriefingOpen] = useState(false)
  const [discussionOpen, setDiscussionOpen] = useState(false)

  // 任何 Agent 的持股與決策歷程查看狀態
  const [detailAgentId, setDetailAgentId] = useState<number | null>(null)
  const [detailData, setDetailData] = useState<AgentDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailMaximized, setDetailMaximized] = useState(false)
  const [detailTab, setDetailTab] = useState<'holdings' | 'timeline' | 'trades'>('holdings')

  const openAgentDetail = async (
    agentId: number,
    defaultTab: 'holdings' | 'timeline' | 'trades' = 'holdings',
    seedRow?: LeaderboardRow,
  ) => {
    setDetailAgentId(agentId)
    setDetailTab(defaultTab)
    if (my?.agent?.id === agentId) {
      setDetailData({
        agent: my.agent,
        holdings: my.holdings,
        snapshots: my.snapshots,
        trades: my.trades,
        decisionLogs: my.decisionLogs,
      })
      return
    }

    if (seedRow) {
      setDetailData({
        agent: {
          id: seedRow.agent_id,
          name: seedRow.agent_name,
          division: seedRow.division,
          strategy_id: seedRow.strategy_id,
          tone: seedRow.tone as Tone,
          personality: null,
          strategy_params: null,
          initial_capital: seedRow.equity ?? 100000,
          cash: seedRow.cash ?? 100000,
          status: seedRow.status,
          last_round_date: seedRow.round_date,
          is_system: seedRow.is_system,
          owner_name: seedRow.owner_name,
        },
        holdings: [],
        snapshots: seedRow.equity != null ? [{ round_date: seedRow.round_date || '', equity: seedRow.equity, cash: seedRow.cash || 0, return_pct: seedRow.return_pct || 0 }] : [],
        trades: [],
        decisionLogs: [],
      })
    } else {
      setDetailData(null)
    }

    setDetailLoading(true)
    try {
      const res = await fetch(`/api/agent-arena/agents/${agentId}`)
      const json = await res.json()
      if (res.ok && json.agent) {
        setDetailData(json)
      }
    } catch (err) {
      console.error('Failed to fetch agent detail:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  const getResolvedPersonality = () => {
    if (fPersonalityType === 'custom') return fPersonalityCustom.trim()
    const preset = PERSONALITY_PRESETS.find((p) => p.id === fPersonalityType)
    return preset ? preset.label : ''
  }

  const getStrategyParamsJson = () => {
    return JSON.stringify({
      maxPositionPct: fMaxPosition,
      stopLossPct: fStopLoss,
      minCashBufferPct: fMinCash,
      maxTradesPerSlot: fMaxTrades,
    })
  }

  const startEditing = () => {
    if (!my?.agent) return
    setFName(my.agent.name)
    setFStrategy(my.agent.strategy_id)
    setFTone(my.agent.tone)
    if (my.agent.personality) {
      const match = PERSONALITY_PRESETS.find(
        (p) => p.label === my.agent?.personality || p.id === my.agent?.personality
      )
      if (match) {
        setFPersonalityType(match.id)
        setFPersonalityCustom('')
      } else {
        setFPersonalityType('custom')
        setFPersonalityCustom(my.agent.personality)
      }
    } else {
      setFPersonalityType('decisive')
      setFPersonalityCustom('')
    }
    if (my.agent.strategy_params) {
      try {
        const parsed = JSON.parse(my.agent.strategy_params)
        if (typeof parsed.maxPositionPct === 'number') setFMaxPosition(parsed.maxPositionPct)
        if (typeof parsed.stopLossPct === 'number') setFStopLoss(parsed.stopLossPct)
        if (typeof parsed.minCashBufferPct === 'number') setFMinCash(parsed.minCashBufferPct)
        if (typeof parsed.maxTradesPerSlot === 'number') setFMaxTrades(parsed.maxTradesPerSlot)
      } catch {}
    }
    setEditing(true)
  }

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

  const apiCall = async (url: string, opts: RequestInit): Promise<{ ok: boolean; json?: any }> => {
    const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) } })
    const json = await res.json().catch(() => null)
    return { ok: res.ok, json }
  }

  const handleCreate = async () => {
    if (!fName.trim() || busy) return
    setBusy(true)
    setError(null)
    const personality = getResolvedPersonality()
    const strategyParams = getStrategyParamsJson()
    const { ok, json } = await apiCall('/api/agent-arena/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: fName.trim(),
        division: 'open',
        strategyId: fStrategy,
        tone: fTone,
        personality: personality || undefined,
        strategyParams,
      }),
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
    const { ok, json } = await apiCall(`/api/agent-arena/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
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
    const { ok, json } = await apiCall(`/api/agent-arena/agents/${id}/${action}`, { method: 'POST' })
    setBusy(false)
    if (!ok) setError(json?.error ?? d.actionFailed)
    else reload()
  }

  const handleDelete = async () => {
    const id = my?.agent?.id
    if (!id || busy) return
    setBusy(true)
    setError(null)
    const { ok, json } = await apiCall(`/api/agent-arena/agents/${id}`, { method: 'DELETE' })
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
              {my.agent.personality && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent-violet)]/15 text-[var(--accent-violet)] border border-[var(--accent-violet)]/20">
                  🎭 {my.agent.personality}
                </span>
              )}
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
                onClick={() => (editing ? setEditing(false) : startEditing())}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-[var(--text-primary)] hover:border-[var(--accent)]/50 transition disabled:opacity-50"
              >
                <Pencil className="w-4 h-4" />
                {d.btnEdit}
              </button>
              <button
                onClick={() => openAgentDetail(my.agent!.id, 'timeline')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-[var(--text-primary)] hover:border-[var(--accent)]/50 transition"
              >
                <Clock className="w-4 h-4 text-[var(--accent)]" />
                {d.timelineBtn}
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
              <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">{d.personalityLabel}</label>
                    <select
                      value={fPersonalityType}
                      onChange={(e) => setFPersonalityType(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] [&>option]:bg-[var(--bg-secondary)] [&>option]:text-[var(--text-primary)]"
                    >
                      {PERSONALITY_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {fPersonalityType === 'custom' && (
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">{d.personalityCustom}</label>
                      <input
                        value={fPersonalityCustom}
                        onChange={(e) => setFPersonalityCustom(e.target.value)}
                        placeholder={d.personalityCustomPlaceholder}
                        maxLength={100}
                        className="w-full rounded-lg border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-white/5 bg-[var(--bg-secondary)] p-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex w-full items-center justify-between text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <span className="flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      {d.paramsTitle}
                    </span>
                    {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/5">
                      <div>
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                          <span>{d.paramMaxPosition}</span>
                          <span className="font-mono text-[var(--text-primary)]">{fMaxPosition}%</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          step={5}
                          value={fMaxPosition}
                          onChange={(e) => setFMaxPosition(Number(e.target.value))}
                          className="w-full accent-[var(--accent)] cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                          <span>{d.paramStopLoss}</span>
                          <span className="font-mono text-[var(--text-primary)]">{fStopLoss}%</span>
                        </div>
                        <input
                          type="range"
                          min={3}
                          max={30}
                          step={1}
                          value={fStopLoss}
                          onChange={(e) => setFStopLoss(Number(e.target.value))}
                          className="w-full accent-[var(--accent)] cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                          <span>{d.paramMinCash}</span>
                          <span className="font-mono text-[var(--text-primary)]">{fMinCash}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={50}
                          step={5}
                          value={fMinCash}
                          onChange={(e) => setFMinCash(Number(e.target.value))}
                          className="w-full accent-[var(--accent)] cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                          <span>{d.paramMaxTrades}</span>
                          <span className="font-mono text-[var(--text-primary)]">{fMaxTrades}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          value={fMaxTrades}
                          onChange={(e) => setFMaxTrades(Number(e.target.value))}
                          className="w-full accent-[var(--accent)] cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      handlePatch({
                        name: fName.trim() ? fName.trim() : my.agent!.name,
                        strategyId: fStrategy || my.agent!.strategy_id,
                        tone: fTone || my.agent!.tone,
                        personality: getResolvedPersonality() || null,
                        strategyParams: getStrategyParamsJson(),
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
              <div className="space-y-4">
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">{d.personalityLabel}</label>
                    <select
                      value={fPersonalityType}
                      onChange={(e) => setFPersonalityType(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] [&>option]:bg-[var(--bg-secondary)] [&>option]:text-[var(--text-primary)]"
                    >
                      {PERSONALITY_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {fPersonalityType === 'custom' && (
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">{d.personalityCustom}</label>
                      <input
                        value={fPersonalityCustom}
                        onChange={(e) => setFPersonalityCustom(e.target.value)}
                        placeholder={d.personalityCustomPlaceholder}
                        maxLength={100}
                        className="w-full rounded-lg border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-white/5 bg-[var(--bg-secondary)] p-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex w-full items-center justify-between text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <span className="flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      {d.paramsTitle}
                    </span>
                    {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/5">
                      <div>
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                          <span>{d.paramMaxPosition}</span>
                          <span className="font-mono text-[var(--text-primary)]">{fMaxPosition}%</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          step={5}
                          value={fMaxPosition}
                          onChange={(e) => setFMaxPosition(Number(e.target.value))}
                          className="w-full accent-[var(--accent)] cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                          <span>{d.paramStopLoss}</span>
                          <span className="font-mono text-[var(--text-primary)]">{fStopLoss}%</span>
                        </div>
                        <input
                          type="range"
                          min={3}
                          max={30}
                          step={1}
                          value={fStopLoss}
                          onChange={(e) => setFStopLoss(Number(e.target.value))}
                          className="w-full accent-[var(--accent)] cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                          <span>{d.paramMinCash}</span>
                          <span className="font-mono text-[var(--text-primary)]">{fMinCash}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={50}
                          step={5}
                          value={fMinCash}
                          onChange={(e) => setFMinCash(Number(e.target.value))}
                          className="w-full accent-[var(--accent)] cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                          <span>{d.paramMaxTrades}</span>
                          <span className="font-mono text-[var(--text-primary)]">{fMaxTrades}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          value={fMaxTrades}
                          onChange={(e) => setFMaxTrades(Number(e.target.value))}
                          className="w-full accent-[var(--accent)] cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
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

      {/* 輪次情報（盤前情報與圓桌討論） */}
      {data.latestRound && (data.latestRound.briefing || data.latestRound.discussion) && (
        <section className="rounded-xl border border-white/5 bg-[var(--bg-card)] p-5 space-y-3" aria-label="輪次情報">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" />
              輪次情報（{data.latestRound.roundDate}）
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.latestRound.briefing && (
              <div className="rounded-lg border border-white/5 bg-[var(--bg-secondary)] p-3.5">
                <button
                  type="button"
                  onClick={() => setBriefingOpen((v) => !v)}
                  className="flex w-full items-center justify-between text-left text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-400" />
                    {d.briefingTitle}
                  </span>
                  {briefingOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {briefingOpen && (
                  <div className="mt-3 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed border-t border-white/5 pt-2.5 max-h-80 overflow-y-auto">
                    <MarkdownText text={data.latestRound.briefing.content} />
                  </div>
                )}
              </div>
            )}
            {data.latestRound.discussion && (
              <div className="rounded-lg border border-white/5 bg-[var(--bg-secondary)] p-3.5">
                <button
                  type="button"
                  onClick={() => setDiscussionOpen((v) => !v)}
                  className="flex w-full items-center justify-between text-left text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                >
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-purple-400" />
                    {d.discussionTitle}
                  </span>
                  {discussionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {discussionOpen && (
                  <div className="mt-3 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed border-t border-white/5 pt-2.5 max-h-80 overflow-y-auto">
                    <MarkdownText text={data.latestRound.discussion.content} />
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

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
                    <th className="px-3 py-2.5 font-medium text-right">戰況</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.agent_id}
                      onClick={() => openAgentDetail(r.agent_id, 'holdings', r)}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.04] cursor-pointer transition"
                    >
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
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openAgentDetail(r.agent_id, 'holdings', r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>持股・歷程</span>
                        </button>
                      </td>
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

      {/* Agent 戰況詳情彈窗（包含目前持股、決策思考歷程與交易明細） */}
      {detailAgentId !== null && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md transition-all duration-200 ${
            detailMaximized ? 'p-0' : 'p-2 sm:p-4 md:p-6'
          }`}
        >
          <div
            className={`flex flex-col border border-white/10 bg-[var(--bg-card)] shadow-2xl transition-all duration-200 overflow-hidden ${
              detailMaximized
                ? 'w-screen h-screen rounded-none'
                : 'w-full max-w-full sm:max-w-4xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1500px] h-[92vh] rounded-2xl'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-4 sm:p-5 bg-[var(--bg-secondary)]/50 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] font-bold shrink-0">
                  {detailData?.agent ? detailData.agent.name.slice(0, 1) : <Bot className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] truncate">
                      {detailData?.agent?.name ?? '載入中…'}
                    </h3>
                    {detailData?.agent?.is_system === 1 ? (
                      <span className="inline-flex items-center rounded-full bg-[var(--accent-violet)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--accent-violet)] shrink-0">
                        {d.systemBadge}
                      </span>
                    ) : detailData?.agent?.owner_name ? (
                      <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] shrink-0">
                        @{detailData.agent.owner_name}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-0.5 flex-wrap">
                    <span>策略：{detailData?.agent ? strategyName(detailData.agent.strategy_id) : '—'}</span>
                    <span>•</span>
                    <span>風格：{detailData?.agent ? toneName(detailData.agent.tone) : '—'}</span>
                    {detailData?.agent?.personality && (
                      <>
                        <span>•</span>
                        <span className="text-[var(--accent)]">{detailData.agent.personality}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => setDetailMaximized((v) => !v)}
                  className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)] transition hidden sm:inline-flex items-center justify-center"
                  title={detailMaximized ? '還原視窗' : '全螢幕最大化'}
                >
                  {detailMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailAgentId(null)
                    setDetailMaximized(false)
                  }}
                  className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)] transition"
                  title="關閉"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1">
              {detailLoading && !detailData ? (
                <div className="py-16 text-center text-sm text-[var(--text-secondary)]">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--accent)]" />
                  正在載入 Agent 最新持倉與決策歷程…
                </div>
              ) : !detailData ? (
                <div className="py-16 text-center text-sm text-[var(--text-secondary)]">
                  查無該 Agent 資料
                </div>
              ) : (
                <>
                  {detailLoading && (
                    <div className="flex items-center gap-2 text-xs text-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 rounded-lg border border-[var(--accent)]/20 animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      正在更新最新即時持倉與決策紀錄…
                    </div>
                  )}
                  {/* 總覽指標卡 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-white/5">
                      <span className="text-xs text-[var(--text-secondary)] block mb-1">目前總權益</span>
                      <span className="text-sm sm:text-base font-bold font-mono text-[var(--text-primary)]">
                        {d.currency}
                        {fmt(
                          detailData.snapshots?.[0]?.equity ??
                            detailData.agent.cash + (detailData.holdings?.reduce((s, h) => s + h.shares * h.avg_cost, 0) || 0),
                        )}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-white/5">
                      <span className="text-xs text-[var(--text-secondary)] block mb-1">累計報酬率</span>
                      {(() => {
                        const ret =
                          detailData.snapshots?.[0]?.return_pct ??
                          (((detailData.agent.cash - detailData.agent.initial_capital) / detailData.agent.initial_capital) * 100)
                        return (
                          <span
                            className={`text-sm sm:text-base font-bold font-mono ${
                              ret >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'
                            }`}
                          >
                            {fmt(ret, 2)}%
                          </span>
                        )
                      })()}
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-white/5">
                      <span className="text-xs text-[var(--text-secondary)] block mb-1">可用現金</span>
                      <span className="text-sm sm:text-base font-bold font-mono text-[var(--text-primary)]">
                        {d.currency}
                        {fmt(detailData.agent.cash)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-white/5">
                      <span className="text-xs text-[var(--text-secondary)] block mb-1">已運行輪數</span>
                      <span className="text-sm sm:text-base font-bold font-mono text-[var(--text-primary)]">
                        {detailData.snapshots?.length || 1} 輪
                      </span>
                    </div>
                  </div>

                  {/* 導航 Tabs */}
                  <div className="flex border-b border-white/10 gap-4 text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => setDetailTab('holdings')}
                      className={`pb-2.5 transition flex items-center gap-1.5 border-b-2 ${
                        detailTab === 'holdings'
                          ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                          : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      📊 {d.holdingsTitle} ({detailData.holdings?.length ?? 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab('timeline')}
                      className={`pb-2.5 transition flex items-center gap-1.5 border-b-2 ${
                        detailTab === 'timeline'
                          ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                          : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      🧠 {d.timelineTitle} ({detailData.decisionLogs?.length ?? 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab('trades')}
                      className={`pb-2.5 transition flex items-center gap-1.5 border-b-2 ${
                        detailTab === 'trades'
                          ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                          : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      🔄 {d.tradesTitle} ({detailData.trades?.length ?? 0})
                    </button>
                  </div>

                  {/* Tab 內容：目前持股 */}
                  {detailTab === 'holdings' && (
                    <div>
                      {detailData.holdings.length === 0 ? (
                        <div className="p-8 text-center rounded-xl border border-white/5 bg-[var(--bg-secondary)] space-y-1">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{d.noHoldings}</p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            AI 目前 100% 持有現金，嚴格遵守風險原則與策略設定，耐心等待最佳價值買點。
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-white/5">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-[var(--text-secondary)] bg-white/[0.02] border-b border-white/5">
                                <th className="px-3 py-2 font-medium">{d.colSymbol}</th>
                                <th className="px-3 py-2 font-medium">名稱</th>
                                <th className="px-3 py-2 font-medium text-right">{d.colShares}</th>
                                <th className="px-3 py-2 font-medium text-right">{d.colCost}</th>
                                <th className="px-3 py-2 font-medium text-right">成本總值</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {detailData.holdings.map((h) => (
                                <tr key={h.symbol} className="hover:bg-white/[0.02]">
                                  <td className="px-3 py-2.5 font-mono font-medium text-[var(--accent)]">{h.symbol}</td>
                                  <td className="px-3 py-2.5 text-[var(--text-primary)]">{h.symbol_name || '—'}</td>
                                  <td className="px-3 py-2.5 text-right font-mono text-[var(--text-primary)]">{fmt(h.shares)} 股</td>
                                  <td className="px-3 py-2.5 text-right font-mono text-[var(--text-secondary)]">
                                    {d.currency}
                                    {fmt(h.avg_cost, 2)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono text-[var(--text-primary)] font-medium">
                                    {d.currency}
                                    {fmt(h.shares * h.avg_cost)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 內容：決策歷程 */}
                  {detailTab === 'timeline' && (
                    <div className="space-y-4">
                      {!detailData.decisionLogs || detailData.decisionLogs.length === 0 ? (
                        <div className="p-8 text-center rounded-xl border border-white/5 bg-[var(--bg-secondary)]">
                          <p className="text-sm text-[var(--text-secondary)]">{d.timelineEmpty}</p>
                        </div>
                      ) : (
                        detailData.decisionLogs.map((log) => {
                          const badge =
                            log.phase === 'premarket'
                              ? { label: d.phasePremarket, color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' }
                              : log.phase === 'trade'
                              ? {
                                  label: `${d.phaseTrade} ${log.slot != null ? `(Slot ${log.slot})` : ''}`,
                                  color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
                                }
                              : { label: d.phasePostclose, color: 'bg-purple-500/15 text-purple-400 border-purple-500/20' }
                          return (
                            <div key={log.id} className="rounded-xl border border-white/5 bg-[var(--bg-secondary)] p-4 space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-[var(--text-primary)]">{log.round_date}</span>
                                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.color}`}>
                                    {badge.label}
                                  </span>
                                </div>
                              </div>
                              <div className="text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap bg-black/20 p-3 rounded-lg border border-white/5 font-sans">
                                <MarkdownText text={log.content} />
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}

                  {/* Tab 內容：交易紀錄 */}
                  {detailTab === 'trades' && (
                    <div>
                      {detailData.trades.length === 0 ? (
                        <div className="p-8 text-center rounded-xl border border-white/5 bg-[var(--bg-secondary)]">
                          <p className="text-sm text-[var(--text-secondary)]">{d.noTrades}</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {detailData.trades.map((t) => (
                            <div
                              key={t.id}
                              className="p-3.5 rounded-xl border border-white/5 bg-[var(--bg-secondary)] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm flex-wrap">
                                  <span className="text-xs font-mono text-[var(--text-secondary)]">{t.round_date}</span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                      t.action === 'BUY'
                                        ? 'bg-[var(--accent-green)]/15 text-[var(--accent-green)]'
                                        : t.action === 'SELL'
                                        ? 'bg-[var(--accent-red)]/15 text-[var(--accent-red)]'
                                        : 'bg-white/10 text-[var(--text-secondary)]'
                                    }`}
                                  >
                                    {t.action === 'BUY' ? '買進' : t.action === 'SELL' ? '賣出' : t.action}
                                  </span>
                                  <span className="font-semibold text-[var(--text-primary)]">
                                    {t.symbol} {t.symbol_name || ''}
                                  </span>
                                  {t.shares != null && (
                                    <span className="font-mono text-xs text-[var(--text-secondary)]">
                                      {fmt(t.shares)} 股 @ {d.currency}
                                      {fmt(t.price, 2)}
                                    </span>
                                  )}
                                </div>
                                {t.reason && (
                                  <p className="text-xs text-[var(--text-secondary)] pl-2 border-l-2 border-white/10">
                                    理由：{t.reason}
                                  </p>
                                )}
                              </div>
                              {t.shares != null && t.price != null && (
                                <div className="text-right font-mono font-medium text-sm text-[var(--text-primary)] sm:shrink-0">
                                  {d.currency}
                                  {fmt(t.shares * t.price)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-white/10 p-3.5 sm:p-4 bg-[var(--bg-secondary)]/50 text-right">
              <button
                type="button"
                onClick={() => {
                  setDetailAgentId(null)
                  setDetailMaximized(false)
                }}
                className="px-4 py-2 rounded-lg bg-white/10 text-sm font-medium text-[var(--text-primary)] hover:bg-white/20 transition"
              >
                {d.drawerClose}
              </button>
            </div>
          </div>
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