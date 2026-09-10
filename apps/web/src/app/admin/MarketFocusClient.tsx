'use client'

import { useState } from 'react'
import { btn, btnGhost, Card, getJson, Help, post, ResultBanner, SectionPageWrapper, type Result } from './_components'

interface MfPreview {
  summary: string
  items: Array<{ title: string; source: string | null; reason: string | null }>
}

interface Job {
  id: string
  kind: string
  status: 'running' | 'done' | 'failed'
  error?: string | null
  count?: number | null
  editionKey?: string | null
  summary?: string | null
  items?: MfPreview['items'] | null
  socialResults?: Array<{ platform: string; status: string; error?: string | null }> | null
  startedAt?: string
}

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 20 * 60 * 1000

function waitForJob(jobId: string): Promise<Job> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS
    const tick = async () => {
      if (Date.now() > deadline) {
        reject(new Error('等待逾時（20 分鐘）'))
        return
      }
      const r = await getJson('/api/market-focus/refresh/status?jobId=' + encodeURIComponent(jobId), 30000)
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

export function MarketFocusClient() {
  const [result, setResult] = useState<Result>(null)
  const [preview, setPreview] = useState<MfPreview | null>(null)
  const [alsoSocial, setAlsoSocial] = useState(false)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const runJob = async (mode: 'dry' | 'publish', cb: (job: Job) => void) => {
    setBusy(true)
    setElapsed(0)
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    try {
      const r = await post('/api/admin/market-focus', { mode, alsoSocial })
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
        setPreview({ summary: job.summary ?? '', items: job.items ?? [] })
        setResult({ ok: true, message: `乾跑完成：精選 ${job.count ?? 0} 則（未寫入 DB）` })
      } else {
        setResult({ ok: false, message: `乾跑失敗：${job.error ?? '未知錯誤'}` })
      }
    })

  const runPublish = () =>
    runJob('publish', (job) => {
      if (job.status === 'done') {
        const social = job.socialResults?.length
          ? `，社群：${JSON.stringify(job.socialResults)}`
          : alsoSocial
            ? '，社群：無新內容可發'
            : ''
        setResult({ ok: true, message: `已發布 ${job.count ?? 0} 則新聞（edition ${job.editionKey ?? '?'}）${social}` })
      } else {
        setResult({ ok: false, message: `發布失敗：${job.error ?? '未知錯誤'}` })
      }
    })

  return (
    <SectionPageWrapper title="市場焦點小編" subtitle="乾跑預覽後再決定是否寫入 DB；也可同步觸發社群發布。執行與發布皆為背景任務，頁面會自動等待結果。">
      <ResultBanner result={result} onDismiss={() => setResult(null)} />
      <Card title="操作">
        <div className="flex flex-wrap items-center gap-3">
          <button className={btn} onClick={runDry} disabled={busy}>
            乾跑預覽（不寫 DB）
          </button>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input type="checkbox" checked={alsoSocial} onChange={(e) => setAlsoSocial(e.target.checked)} />
            發布後同步觸發社群
          </label>
          <div className="flex items-center gap-1">
            <button className={btnGhost} onClick={runPublish} disabled={busy}>
              發布（寫入 DB）
            </button>
            <Help text="每日收盤後執行一次：選新聞＋寫每日總覽。勾選「同步觸發社群」會接著跑社群小編（IG / Threads 發布）。" />
          </div>
        </div>
        {busy && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            ⏳ 背景執行中…（已等待 {elapsed} 秒，首次需 1~4 分鐘；完成前請勿關閉頁面）
          </p>
        )}
      </Card>

      {preview && (
        <Card title="乾跑預覽">
          <h3 className="font-semibold text-[var(--text-primary)] mb-2">每日總覽</h3>
          <p className="text-[var(--text-secondary)] whitespace-pre-wrap mb-4">{preview.summary}</p>
          <h3 className="font-semibold text-[var(--text-primary)] mb-2">精選新聞</h3>
          <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
            {preview.items.map((it, i) => (
              <li key={i}>
                • <span className="text-[var(--text-primary)]">{it.title}</span>
                {it.reason ? `（${it.reason}）` : ''} <span className="text-xs opacity-70">[{it.source}]</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </SectionPageWrapper>
  )
}