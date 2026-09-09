'use client'

import { useEffect, useState } from 'react'
import { btn, btnGhost, Card, Help, input, post, ResultBanner, SectionPageWrapper, type Result } from './_components'

interface DryRunResult {
  editionKey?: string | null
  cardStyle?: 'classic' | 'meme'
  cards?: { classic: string; meme: string }
  captions?: { instagram: string; threads: string }
  meme?: { title: string; punchline: string } | null
  results?: Array<{ platform: string; status: string; error?: string | null }>
  message?: string
  skipped?: boolean
  triggered?: boolean
  error?: string
}

const IG_LIMIT = 2200
const TH_LIMIT = 500

export function SocialClient() {
  const [result, setResult] = useState<Result>(null)
  const [preview, setPreview] = useState<DryRunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [selectedCard, setSelectedCard] = useState<'classic' | 'meme'>('classic')
  const [draftIg, setDraftIg] = useState('')
  const [draftThreads, setDraftThreads] = useState('')

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
        setSelectedCard(r.body.cardStyle ?? 'classic')
        setDraftIg(r.body.captions?.instagram ?? '')
        setDraftThreads(r.body.captions?.threads ?? '')
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

  const publishManual = async () => {
    if (!preview?.cards || !preview.editionKey) return
    setBusy(true)
    const style = selectedCard
    const up = await post(
      '/api/admin/social/card-image',
      { editionKey: preview.editionKey, style, dataUrl: preview.cards[style] },
      60000,
    )
    if (!up.ok || !up.body?.success) {
      setBusy(false)
      setResult({ ok: false, message: `上傳圖卡失敗：${up.body?.error ?? 'network'}` })
      return
    }
    const r = await post(
      '/api/admin/social/publish',
      {
        dryRun: false,
        force: false,
        platforms: ['instagram', 'threads'],
        imageUrl: up.body.url,
        captions: { instagram: draftIg, threads: draftThreads },
      },
      180000,
    )
    setBusy(false)
    if (r.ok && r.body.success) {
      setResult({ ok: true, message: `手動發布結果：${JSON.stringify(r.body.results ?? r.body)}` })
    } else {
      setResult({ ok: false, message: r.body?.error ? `發布失敗：${r.body.error}` : '連線逾時或網路錯誤' })
    }
  }

  const overIg = draftIg.length > IG_LIMIT
  const overTh = draftThreads.length > TH_LIMIT

  return (
    <SectionPageWrapper title="社群小編" subtitle="IG / Threads 文案＋圖卡乾跑預覽，可選梗圖版式或改文案後手動發布">
      <ResultBanner result={result} onDismiss={() => setResult(null)} />
      <Card title="操作">
        <div className="flex flex-wrap gap-3">
          <button className={btn} onClick={() => run(true, false)} disabled={busy}>
            {busy ? '處理中…' : '乾跑預覽（文案＋圖卡×2）'}
          </button>
          <button className={btnGhost} onClick={() => run(false, false)} disabled={busy}>
            直接發布（僅未發布平台）
          </button>
          <button className={btnGhost} onClick={() => run(false, true)} disabled={busy}>
            強制重發全部（清去重）
          </button>
          <div className="flex items-center">
            <Help text="乾跑會同時產生「品牌資訊卡」與「梗圖大字卡」各一張，並生成 IG/Threads 文案；可選圖卡、微調文案後以「發布選定內容」手動發布（圖以快照上傳，與預覽完全一致）。圖卡樣式預設值與 max_chars 可在「Agent 設定」調整。" />
          </div>
        </div>
        {busy && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            ⏳ 呼叫 AI 生成文案與兩種圖卡中…（已等待 {elapsed} 秒，通常需 30~120 秒）。完成前請勿關閉頁面。
          </p>
        )}
        {!preview && !busy && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">尚未乾跑。按下「乾跑預覽」會產出 Instagram／Threads 文案與兩張 1080×1080 圖卡（不發布）。</p>
        )}
      </Card>

      {preview?.cards && !busy && (
        <>
          <Card title="圖卡預覽 — 點選要發布的版式">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-2 mb-3 text-sm font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="cardStyle"
                    checked={selectedCard === 'classic'}
                    onChange={() => setSelectedCard('classic')}
                    className="accent-[var(--accent)]"
                  />
                  品牌資訊卡（classic）
                </label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.cards.classic}
                  alt="品牌資訊卡預覽"
                  className={`w-full max-w-[420px] rounded-2xl border ${selectedCard === 'classic' ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40' : 'border-white/10 opacity-80'}`}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 mb-3 text-sm font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="cardStyle"
                    checked={selectedCard === 'meme'}
                    onChange={() => setSelectedCard('meme')}
                    className="accent-[var(--accent)]"
                  />
                  梗圖大字卡（meme）
                </label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.cards.meme}
                  alt="梗圖大字卡預覽"
                  className={`w-full max-w-[420px] rounded-2xl border ${selectedCard === 'meme' ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40' : 'border-white/10 opacity-80'}`}
                />
              </div>
            </div>
            {preview.meme && (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                梗圖概念（v1 文字式）：主標題 <b>{preview.meme.title}</b> ／ {preview.meme.punchline}
              </p>
            )}
          </Card>

          <Card title="文案編輯（發布會用改寫後的文字）">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[var(--accent)]">Instagram</h3>
                  <span className={`text-xs ${overIg ? 'text-[var(--accent-red)]' : 'text-[var(--text-secondary)]'}`}>
                    {draftIg.length}/{IG_LIMIT}
                  </span>
                </div>
                <textarea
                  className={input}
                  rows={8}
                  maxLength={IG_LIMIT + 200}
                  value={draftIg}
                  onChange={(e) => setDraftIg(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[var(--accent)]">Threads</h3>
                  <span className={`text-xs ${overTh ? 'text-[var(--accent-red)]' : 'text-[var(--text-secondary)]'}`}>
                    {draftThreads.length}/{TH_LIMIT}
                  </span>
                </div>
                <textarea
                  className={input}
                  rows={8}
                  maxLength={TH_LIMIT + 100}
                  value={draftThreads}
                  onChange={(e) => setDraftThreads(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                className={btn}
                onClick={publishManual}
                disabled={busy || overIg || overTh || draftIg.trim() === '' || draftThreads.trim() === ''}
              >
                {busy ? '處理中…' : '發布選定內容（此圖＋改寫文案）'}
              </button>
              <Help text="會先用選定的版式上傳圖卡快照，再以編輯後的文案對 IG＋Threads 發布；已發布過的 edition 會跳過（去重）。" />
            </div>
          </Card>
        </>
      )}
    </SectionPageWrapper>
  )
}