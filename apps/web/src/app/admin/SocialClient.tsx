'use client'

import { useEffect, useState } from 'react'
import { btn, btnGhost, Card, Help, post, ResultBanner, SectionPageWrapper, type Result } from './_components'

interface DryRunResult {
  editionKey?: string | null
  cardStyle?: 'classic' | 'meme'
  captions?: { instagram: string; threads: string }
  imageDataUrl?: string
  meme?: { title: string; punchline: string } | null
  results?: Array<{ platform: string; status: string; error?: string | null }>
  message?: string
  skipped?: boolean
  triggered?: boolean
  error?: string
}

export function SocialClient() {
  const [result, setResult] = useState<Result>(null)
  const [preview, setPreview] = useState<DryRunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [busy])

  const run = async (dryRun: boolean, force: boolean) => {
    setBusy(true)
    const r = await post('/api/admin/social/publish', { dryRun, force }, 180000)
    setBusy(false)
    if (r.ok && r.body.success) {
      if (dryRun) {
        setPreview(r.body as DryRunResult)
        setResult({
          ok: true,
          message: r.body.triggered ? `乾跑完成（edition ${r.body.editionKey}）` : `${r.body.message ?? 'skipped'}（${r.body.error ?? ''}）`,
        })
      } else {
        setResult({
          ok: true,
          message: `發布結果：${JSON.stringify(r.body.results ?? r.body)}`,
        })
      }
    } else {
      setResult({ ok: false, message: r.body?.error ? `失敗：${r.body.error}` : (r.ok ? '失敗：未知錯誤' : '連線逾時或網路錯誤') })
    }
  }

  return (
    <SectionPageWrapper title="社群小編" subtitle="IG / Threads 文案＋圖卡乾跑預覽，確認後再發布">
      <ResultBanner result={result} onDismiss={() => setResult(null)} />
      <Card title="操作">
        <div className="flex flex-wrap gap-3">
          <button className={btn} onClick={() => run(true, false)} disabled={busy}>
            {busy ? '處理中…' : '乾跑預覽（文案＋圖卡）'}
          </button>
          <button className={btnGhost} onClick={() => run(false, false)} disabled={busy}>
            發布（僅未發布平台）
          </button>
          <button className={btnGhost} onClick={() => run(false, true)} disabled={busy}>
            強制重發全部（清去重）
          </button>
          <div className="flex items-center">
            <Help text="圖卡樣式與 max_chars 可在「Agent 設定」調整；card_style=meme 時走梗圖大字版式，會先產生梗圖概念。" />
          </div>
        </div>
        {busy && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            ⏳ 呼叫 AI 生成文案並渲染圖卡中…（已等待 {elapsed} 秒，通常需 30~90 秒）。完成前請勿關閉頁面。
          </p>
        )}
        {preview?.cardStyle === 'classic' && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            目前圖卡樣式為 classic，不會產生梗圖。到「Agent 設定」將 social.card_style 改為 meme 後，乾跑會多出梗圖概念與大字卡。
          </p>
        )}
        {!preview && !busy && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">尚未乾跑。按下「乾跑預覽」會產出 Instagram／Threads 文案與 1080×1080 圖卡（不發布）。</p>
        )}
      </Card>

      {preview?.captions && (
        <Card title="文案預覽">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-[var(--accent)] mb-2">Instagram</h3>
              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-4">{preview.captions.instagram}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--accent)] mb-2">Threads</h3>
              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-4">{preview.captions.threads}</p>
            </div>
          </div>
        </Card>
      )}

      {preview?.meme && (
        <Card title="梗圖概念（v1 文字式）">
          <p className="text-sm text-[var(--text-primary)]">
            主標題：<b>{preview.meme.title}</b>
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{preview.meme.punchline}</p>
        </Card>
      )}

      {preview?.imageDataUrl && (
        <Card title="圖卡預覽">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.imageDataUrl}
            alt="社群圖卡乾跑預覽"
            className="w-full max-w-[420px] rounded-2xl border border-white/10"
          />
        </Card>
      )}
    </SectionPageWrapper>
  )
}