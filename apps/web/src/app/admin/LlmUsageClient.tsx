'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, getJson, SectionPageWrapper } from './_components'

interface AgentReport {
  agent: string
  callCount: number
  models: Record<string, number>
  fallbackCalls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

interface LlmReport {
  from: string
  to: string
  agents: AgentReport[]
  total: {
    callCount: number
    fallbackCalls: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

function todayStr(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  return now.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+08:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

const PRESETS: Array<{ label: string; from: string | null; to: string | null }> = [
  { label: '今日', from: null, to: null },
  { label: '近 7 天', from: null, to: null },
  { label: '近 30 天', from: null, to: null },
]

export function LlmUsageClient() {
  const [from, setFrom] = useState(() => todayStr())
  const [to, setTo] = useState(() => todayStr())
  const [report, setReport] = useState<LlmReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const applyPreset = useCallback((label: string) => {
    const today = todayStr()
    const from = label === '今日' ? today : label === '近 7 天' ? addDays(today, -6) : addDays(today, -29)
    setFrom(from)
    setTo(today)
  }, [])

  const load = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams()
      if (fromDate) q.set('from', fromDate)
      if (toDate) q.set('to', toDate)
      const r = await getJson(`/api/admin/llm-usage?${q.toString()}`)
      if (r.ok && r.body && r.body.success) {
        setReport(r.body as LlmReport)
      } else {
        setReport(null)
        setError(r.body?.error ?? '載入失敗')
      }
    } catch (e: any) {
      setReport(null)
      setError(e?.message ?? '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(from, to)
  }, [load, from, to])

  const total = report?.total
  const fallbackRatio = total && total.callCount > 0 ? Math.round((total.fallbackCalls / total.callCount) * 100) : 0

  return (
    <SectionPageWrapper
      title="LLM 用量報表"
      subtitle="各 LLM Agent 的呼叫次數、實際服務模型與 token 消耗。Arena 八大 agent 與市場焦點／社群路徑的每次成功 LLM 呼叫皆會記錄。"
    >
      <Card title="期間篩選">
        <div className="flex flex-wrap items-end gap-3">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.label)}
              className="px-3 py-1.5 text-sm rounded-lg border border-white/10 text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)] transition"
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-2 text-sm">
            <label className="text-[var(--text-secondary)]">從</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[var(--text-primary)]"
            />
            <label className="text-[var(--text-secondary)]">至</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[var(--text-primary)]"
            />
          </div>
        </div>
      </Card>

      {total && (
        <Card title="期間總計">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-[var(--text-secondary)]">呼叫次數</div>
              <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{total.callCount}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-secondary)]">total tokens</div>
              <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{fmtTokens(total.totalTokens)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-secondary)]">備援呼叫（non-primary）</div>
              <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                {total.fallbackCalls}
                <span className="ml-2 text-sm text-[var(--text-secondary)]">{fallbackRatio}%</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-secondary)]">Prompt / Completion</div>
              <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                {fmtTokens(total.promptTokens)}
                <span className="mx-1 text-sm text-[var(--text-secondary)]">/</span>
                {fmtTokens(total.completionTokens)}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card title="依 Agent 聚合">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-secondary)] uppercase tracking-wide">
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4 text-right">呼叫</th>
                <th className="py-2 pr-4">模型分佈</th>
                <th className="py-2 pr-4 text-right">Prompt</th>
                <th className="py-2 pr-4 text-right">Completion</th>
                <th className="py-2 text-right">合計</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={6} className="py-4 text-[var(--accent-red)]">{error}</td>
                </tr>
              ) : report === null && loading ? (
                <tr>
                  <td colSpan={6} className="py-4 text-[var(--text-secondary)]">載入中…</td>
                </tr>
              ) : !report || report.agents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-[var(--text-secondary)]">
                    此區間無 LLM 呼叫紀錄。Arena 分析或市場焦點排程執行後才會產生資料。
                  </td>
                </tr>
              ) : (
                report.agents.map((a) => (
                  <tr key={a.agent} className="border-t border-white/5">
                    <td className="py-2 pr-4">
                      <span className="text-[var(--text-primary)]">{a.agent}</span>
                      {a.fallbackCalls > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-[var(--accent)]/15 text-[var(--accent)]">備援</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--text-primary)]">{a.callCount}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(a.models).map(([model, count]) => (
                          <span key={model} className="px-1.5 py-0.5 rounded text-xs bg-white/5 text-[var(--text-secondary)]">
                            {model} ×{count}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtTokens(a.promptTokens)}</td>
                    <td className="py-2 pr-4 text-right">{fmtTokens(a.completionTokens)}</td>
                    <td className="py-2 text-right font-medium text-[var(--text-primary)]">{fmtTokens(a.totalTokens)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </SectionPageWrapper>
  )
}