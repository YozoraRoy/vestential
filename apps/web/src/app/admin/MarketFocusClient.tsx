'use client'

import { useState } from 'react'
import { btn, btnGhost, Card, Help, post, ResultBanner, SectionPageWrapper, type Result } from './_components'

interface MfPreview {
  summary: string
  items: Array<{ title: string; source: string; reason: string | null }>
}

export function MarketFocusClient() {
  const [result, setResult] = useState<Result>(null)
  const [preview, setPreview] = useState<MfPreview | null>(null)
  const [alsoSocial, setAlsoSocial] = useState(false)
  const [busy, setBusy] = useState(false)

  const runDry = async () => {
    setBusy(true)
    const r = await post('/api/admin/market-focus', { mode: 'dry' })
    setBusy(false)
    if (r.ok && r.body.success) {
      setPreview({ summary: r.body.summary ?? '', items: r.body.items ?? [] })
      setResult({ ok: true, message: `乾跑完成：精選 ${r.body.count} 則（未寫入 DB）` })
    } else {
      setResult({ ok: false, message: `乾跑失敗：${r.body?.error ?? ''}` })
    }
  }

  const runPublish = async () => {
    setBusy(true)
    const r = await post('/api/admin/market-focus', { mode: 'publish', alsoSocial })
    setBusy(false)
    setResult(
      r.ok
        ? { ok: true, message: `已發布 ${r.body.count} 則新聞` + (alsoSocial ? `，社群：${JSON.stringify(r.body.social?.results ?? r.body.social ?? {})}` : '') }
        : { ok: false, message: `發布失敗：${r.body?.error ?? ''}` },
    )
  }

  return (
    <SectionPageWrapper title="市場焦點小編" subtitle="乾跑預覽後再決定是否寫入 DB；也可同步觸發社群發布">
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