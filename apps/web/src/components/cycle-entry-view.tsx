'use client'

import { useState } from 'react'
import { LayoutGrid, LayoutList, Sparkles } from 'lucide-react'
import type { CycleEntrySignalRow } from '@stock/database'

export interface CycleEntryDict {
  viewModeList: string
  viewModeCard: string
  colRank: string
  colName: string
  colStage: string
  colRules: string
  colPrice: string
  colScore: string
  colBacktest: string
  aiNoteTitle: string
  btSignals: string
  btWinRate: string
  btAvgDays: string
  stageNearHigh: string
  stageMildPullback: string
  stagePullback: string
  stageDeepPullback: string
  ruleR1: string
  ruleR2: string
  ruleR3: string
  ruleR4: string
  ruleR5: string
}

type ViewMode = 'list' | 'card'

const STAGES: Record<string, keyof CycleEntryDict> = {
  'near-high': 'stageNearHigh',
  'mild-pullback': 'stageMildPullback',
  pullback: 'stagePullback',
  'deep-pullback': 'stageDeepPullback',
}

const STAGE_STYLE: Record<string, string> = {
  'near-high': 'bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/25',
  'mild-pullback': 'bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/25',
  pullback: 'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/25',
  'deep-pullback': 'bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/25',
}

const RULE_KEYS: Record<string, keyof CycleEntryDict> = {
  R1: 'ruleR1',
  R2: 'ruleR2',
  R3: 'ruleR3',
  R4: 'ruleR4',
  R5: 'ruleR5',
}

function ruleList(matchedRules: string, dict: CycleEntryDict) {
  return (matchedRules || '')
    .split(',')
    .filter((r) => RULE_KEYS[r])
    .map((r) => ({ key: r, label: dict[RULE_KEYS[r]] }))
}

function shortSymbol(symbol: string) {
  return symbol.replace(/\.(TW|TWO)$/, '')
}

function fmt(n: number | null | undefined, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('zh-TW', { maximumFractionDigits: digits })
}

function formatWinRate(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return '—'
  // 向下相容：若歷史版次資料庫仍存 0~1 小數（如 0.5），自動換算為百分比（50）
  const pct = rate > 0 && rate <= 1 ? rate * 100 : rate
  return `${Math.round(pct)}%`
}

interface Props {
  signals: CycleEntrySignalRow[]
  dict: CycleEntryDict
}

export function CycleEntryView({ signals, dict }: Props) {
  const [mode, setMode] = useState<ViewMode>('list')

  const btnClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active
        ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
        : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
    }`

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 border border-white/10 rounded-lg p-1">
          <button type="button" onClick={() => setMode('list')} className={btnClass(mode === 'list')}>
            <LayoutList className="w-3.5 h-3.5" />
            {dict.viewModeList}
          </button>
          <button type="button" onClick={() => setMode('card')} className={btnClass(mode === 'card')}>
            <LayoutGrid className="w-3.5 h-3.5" />
            {dict.viewModeCard}
          </button>
        </div>
      </div>

      {mode === 'list' ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm min-w-full">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-[var(--text-secondary)]">
                <th className="px-3 py-2.5 font-medium">{dict.colRank}</th>
                <th className="px-3 py-2.5 font-medium">{dict.colName}</th>
                <th className="px-3 py-2.5 font-medium">{dict.colStage}</th>
                <th className="px-3 py-2.5 font-medium">{dict.colRules}</th>
                <th className="px-3 py-2.5 font-medium text-right">{dict.colPrice}</th>
                <th className="px-3 py-2.5 font-medium text-right">{dict.colScore}</th>
                <th className="px-3 py-2.5 font-medium">{dict.colBacktest}</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => {
                const rules = ruleList(s.matchedRules, dict)
                return (
                  <tr key={s.symbol} className="border-b border-white/5 last:border-b-0 align-top hover:bg-white/[0.03]">
                    <td className="px-3 py-3 text-[var(--text-secondary)]">#{s.signalRank ?? '—'}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-[var(--text-primary)]">{shortSymbol(s.symbol)}</div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{s.name}</div>
                    </td>
                    <td className="px-3 py-3">
                      {s.cycleStage ? (
                        <span className={STAGE_STYLE[s.cycleStage] ?? STAGE_STYLE.pullback}>{dict[STAGES[s.cycleStage] ?? 'pullback']}</span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rules.map((r) => (
                          <span key={r.key} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20">
                            {r.key}·{r.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(s.price, 2)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] font-semibold tabular-nums">
                        {s.score}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                        {dict.btSignals} {s.btTotalSignals ?? '—'}
                      </div>
                      <div className="text-xs text-[var(--accent-green)] font-semibold whitespace-nowrap tabular-nums">
                        勝率 {formatWinRate(s.btWinRate)}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] whitespace-nowrap tabular-nums">
                        {dict.btAvgDays} {s.btAvgDays ?? '—'}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {signals.map((s) => {
            const rules = ruleList(s.matchedRules, dict)
            return (
              <li key={s.symbol} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">#{s.signalRank ?? '—'}</span>
                      <span className="font-semibold text-[var(--text-primary)]">{shortSymbol(s.symbol)}</span>
                      {s.cycleStage ? (
                        <span className={STAGE_STYLE[s.cycleStage] ?? STAGE_STYLE.pullback}>{dict[STAGES[s.cycleStage] ?? 'pullback']}</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">{s.name}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] font-semibold tabular-nums text-sm">
                    {s.score}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {rules.map((r) => (
                    <span key={r.key} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20">
                      {r.key}·{r.label}
                    </span>
                  ))}
                </div>

                <dl className="grid grid-cols-3 gap-2 text-xs border-t border-white/5 pt-3 mb-3">
                  <div>
                    <dt className="text-[var(--text-secondary)]">{dict.colPrice}</dt>
                    <dd className="text-[var(--text-primary)] font-semibold tabular-nums mt-0.5">{fmt(s.price, 2)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-secondary)]">{dict.btWinRate}</dt>
                    <dd className="text-[var(--accent-green)] font-semibold tabular-nums mt-0.5">{formatWinRate(s.btWinRate)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-secondary)]">{dict.btSignals}</dt>
                    <dd className="text-[var(--text-primary)] font-semibold tabular-nums mt-0.5">{s.btTotalSignals ?? '—'}</dd>
                  </div>
                </dl>

                {s.llmNote ? (
                  <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-[var(--accent)] mb-1">
                      <Sparkles className="w-3 h-3" />
                      {dict.aiNoteTitle}
                    </div>
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{s.llmNote}</p>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}