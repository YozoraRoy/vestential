'use client'

import { useEffect, useState } from 'react'
import { getJson, SectionPageWrapper, Card } from './_components'

interface StatusData {
  success: boolean
  generatedAt?: string
  health?: {
    ok: boolean
    issues: Array<{ code: string; severity: string; message: string }>
  }
  summary?: Record<string, number>
  arenaProgress?: Array<{ phase: string; note: string | null; created_at: string | null }>
  usage?: { totalUsers: number }
}

export function OverviewClient() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getJson('/api/admin/status').then((r) => {
      if (!alive) return
      if (r.ok && r.body.success) setStatus(r.body)
      else setError(r.body?.error ?? '載入失敗')
    })
    return () => {
      alive = false
    }
  }, [])

  const health = status?.health
  return (
    <SectionPageWrapper title="後台總覽" subtitle="系統狀態・統計・今日競技場進度">
      <Card title="系統狀態">
        {error ? (
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        ) : !status ? (
          <p className="text-sm text-[var(--text-secondary)]">載入中…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge label="Health" ok={health?.ok} />
              <Stat label="使用者" value={status.summary?.users} />
              <Stat label="競技場 Agent" value={status.summary?.agents} />
              <Stat label="市場焦點" value={status.summary?.marketFocus} />
              <Stat label="社群貼文" value={status.summary?.socialPosts} />
              <Stat label="競技場輪次" value={status.summary?.arenaRounds} />
              <Stat label="用量使用者" value={status.usage?.totalUsers} />
            </div>
            {(health?.issues?.length ?? 0) > 0 ? (
              <ul className="text-sm space-y-1.5">
                {health!.issues.map((i) => (
                  <li key={i.code} className={i.severity === 'error' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-violet)]'}>
                    {i.severity === 'error' ? '⚠' : '◆'} <code>{i.code}</code> {i.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--accent-green)]">✓ 全部檢查通過（生成時間 {status.generatedAt}）</p>
            )}
          </div>
        )}
      </Card>

      <Card title="今日競技場階段進度">
        {!status ? (
          <p className="text-sm text-[var(--text-secondary)]">載入中…</p>
        ) : (status?.arenaProgress?.length ?? 0) === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">今日尚未有階段完成</p>
        ) : (
          <ul className="text-sm space-y-1">
            {status!.arenaProgress!.map((p) => (
              <li key={p.phase}>
                <code className="text-[var(--accent)]">{p.phase}</code>{' '}
                <span className="text-[var(--text-secondary)]">— {p.note ?? ''}（{p.created_at}）</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </SectionPageWrapper>
  )
}

function Badge({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
        ok === true ? 'bg-[var(--accent-green)]/15 text-[var(--accent-green)]' : ok === false ? 'bg-[var(--accent-red)]/15 text-[var(--accent-red)]' : 'bg-white/10 text-[var(--text-secondary)]'
      }`}
    >
      {label}: {ok === true ? 'OK' : ok === false ? 'FAIL' : '…'}
    </span>
  )
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs">
      {label} <b className="text-[var(--text-primary)]">{value ?? '—'}</b>
    </span>
  )
}