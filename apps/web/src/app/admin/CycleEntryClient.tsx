'use client'

import { useEffect, useState } from 'react'
import { btn, btnGhost, Card, getJson, Help, post, ResultBanner, SectionPageWrapper, type Result } from './_components'
import type { CycleEntrySignalRow } from '@stock/database'

interface Job {
  id: string
  kind: string
  status: 'running' | 'done' | 'failed'
  error?: string | null
  count?: number | null
  editionDate?: string | null
  signals?: Omit<CycleEntrySignalRow, 'editionDate'>[] | null
  summary?: string | null
  startedAt?: string
}

interface EditionRow {
  editionDate: string
  count: number
  generatedAt: string | null
}

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 26 * 60 * 1000

function waitForJob(jobId: string): Promise<Job> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS
    const tick = async () => {
      if (Date.now() > deadline) {
        reject(new Error('等待逾時（26 分鐘）'))
        return
      }
      const r = await getJson('/api/cycle-entry/refresh/status?jobId=' + encodeURIComponent(jobId), 30000)
      const job = (r.body as { job?: Job })?.job
      if (r.ok && job) {
        if (job.status === 'done' || job.status === 'failed') {
          resolve(job)
          return
        }
      }
      setTimeout(tick, POLL_INTERVAL_MS)
    }
    tick()
  })
}

function shortSymbol(symbol: string) {
  return symbol.replace(/\.(TW|TWO)$/, '')
}

export function CycleEntryClient() {
  const [result, setResult] = useState<Result>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [editions, setEditions] = useState<EditionRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<CycleEntrySignalRow[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [preview, setPreview] = useState<{ summary: string; signals: Omit<CycleEntrySignalRow, 'editionDate'>[] } | null>(null)

  const loadEditions = async () => {
    const r = await getJson('/api/admin/cycle-entry', 15000)
    if (r.ok) setEditions((r.body as { editions?: EditionRow[] }).editions ?? [])
  }

  useEffect(() => {
    void loadEditions()
  }, [])

  const runJob = async (action: 'dry' | 'refresh', cb: (job: Job) => void) => {
    setBusy(true)
    setElapsed(0)
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    try {
      const r = await post('/api/admin/cycle-entry', { action })
      if (!r.ok || !(r.body as { accepted?: boolean }).accepted) {
        setResult({ ok: false, message: `啟動失敗：${(r.body as { error?: string })?.error ?? '未知錯誤'}` })
        return
      }
      const jobId = (r.body as { jobId?: string }).jobId!
      const job = await waitForJob(jobId)
      cb(job)
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? '執行失敗' })
    } finally {
      clearInterval(timer)
      setBusy(false)
      setElapsed(0)
    }
  }

  const runDry = () =>
    runJob('dry', (job) => {
      if (job.status === 'done') {
        setPreview({ summary: job.summary ?? '', signals: job.signals ?? [] })
        setResult({ ok: true, message: `乾跑完成：${job.count ?? 0} 檔通過門檻（未寫入 DB）` })
      } else {
        setResult({ ok: false, message: `乾跑失敗：${job.error ?? '未知錯誤'}` })
      }
    })

  const runRefresh = () =>
    runJob('refresh', (job) => {
      if (job.status === 'done') {
        setResult({ ok: true, message: `已正式掃描並寫入 DB：${job.count ?? 0} 檔（版次 ${job.editionDate ?? '?'}）` })
        void loadEditions()
      } else {
        setResult({ ok: false, message: `掃描失敗：${job.error ?? '未知錯誤'}` })
      }
    })

  const openEdition = async (date: string) => {
    setSelected(date)
    setDetail(null)
    setDetailLoading(true)
    try {
      const r = await getJson('/api/admin/cycle-entry?edition=' + encodeURIComponent(date), 15000)
      if (r.ok) setDetail((r.body as { signals?: CycleEntrySignalRow[] }).signals ?? [])
      else setDetail([])
    } finally {
      setDetailLoading(false)
    }
  }

  const fmtSignals = (signals: Array<{ symbol: string; name: string | null; score: number; matchedRules: string; price: number | null; llmNote: string | null }>) => (
    <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
      {signals.map((s, i) => (
        <li key={s.symbol + i}>
          • <span className="text-[var(--text-primary)]">{shortSymbol(s.symbol)}</span>
          {s.name ? ` ${s.name}` : ''}（score {s.score}，{s.matchedRules}，price {s.price ?? '—'}）
          {s.llmNote ? <span className="text-xs opacity-80"> — {s.llmNote}</span> : ''}
        </li>
      ))}
    </ul>
  )

  return (
    <SectionPageWrapper
      title="週期進場小編"
      subtitle="每日盤後掃描市值前 100 大台股，以 R1–R5 規則初篩＋LLM 評述產生「已現進場點標的」。乾跑預覽再決定是否寫入 DB；正式寫入為背景任務，頁面會自動等待結果。"
    >
      <ResultBanner result={result} onDismiss={() => setResult(null)} />
      <Card title="操作">
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnGhost} onClick={runDry} disabled={busy}>
            乾跑預覽（不寫 DB）
          </button>
          <div className="flex items-center gap-1">
            <button className={btn} onClick={runRefresh} disabled={busy}>
              {busy ? '執行中…' : '正式掃描（寫入 DB）'}
            </button>
            <Help text="每交易日 16:00 自動執行一次。正式掃描會覆寫當日版次並寫入總覽；乾跑僅預覽。背景 Job 最長 25 分鐘（超過自動標記失敗）。" />
          </div>
        </div>
        {busy && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            ⏳ 背景執行中…（已等待 {elapsed} 秒，需 3~10 分鐘；完成前請勿關閉頁面）
          </p>
        )}
      </Card>

      {preview && (
        <Card title="乾跑預覽">
          <h3 className="font-semibold text-[var(--text-primary)] mb-2">今日總覽（AI）</h3>
          <p className="text-[var(--text-secondary)] whitespace-pre-wrap mb-4">{preview.summary || '（未產生）'}</p>
          <h3 className="font-semibold text-[var(--text-primary)] mb-2">候選標的（{preview.signals.length}）</h3>
          {preview.signals.length > 0 ? fmtSignals(preview.signals) : <p className="text-sm text-[var(--text-secondary)]">今日無標的通過門檻。</p>}
        </Card>
      )}

      <Card title="歷史版次">
        {editions.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">尚無版次紀錄。執行「正式掃描」產生第一版。注意：全無訊號的版次不會出現在此清單（DB 仍會寫入 meta）。</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {editions.map((e) => (
              <li key={e.editionDate}>
                <button
                  type="button"
                  onClick={() => openEdition(e.editionDate)}
                  className={`w-full flex items-center justify-between py-2.5 text-left text-sm transition ${
                    selected === e.editionDate ? 'text-[var(--accent)]' : 'text-[var(--text-primary)] hover:text-[var(--accent)]'
                  }`}
                >
                  <span>
                    {e.editionDate}
                    <span className="ml-2 text-xs text-[var(--text-secondary)]">（{e.count} 檔）</span>
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] tabular-nums">{e.generatedAt ? new Date(e.generatedAt).toLocaleString('zh-TW') : ''}</span>
                </button>
                {selected === e.editionDate && (
                  <div className="pb-3 text-sm">
                    {detailLoading ? (
                      <p className="text-[var(--text-secondary)]">讀取中…</p>
                    ) : detail && detail.length > 0 ? (
                      fmtSignals(detail)
                    ) : (
                      <p className="text-[var(--text-secondary)]">該版次查無訊號明細。</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </SectionPageWrapper>
  )
}