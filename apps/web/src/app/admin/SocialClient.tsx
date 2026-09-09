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

type SocialPlatform = 'instagram' | 'threads'

const IG_LIMIT = 2200
const TH_LIMIT = 500

export function SocialClient() {
  const [result, setResult] = useState<Result>(null)
  const [preview, setPreview] = useState<DryRunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(['instagram', 'threads'])
  const [igCardStyle, setIgCardStyle] = useState<'classic' | 'meme'>('meme')
  const [threadsCardStyle, setThreadsCardStyle] = useState<'classic' | 'meme'>('classic')
  const [draftIg, setDraftIg] = useState('')
  const [draftThreads, setDraftThreads] = useState('')

  const togglePlatform = (p: SocialPlatform) => {
    setPlatforms((prev) => {
      if (prev.includes(p)) {
        if (prev.length === 1) return prev // 至少保留一個平台
        return prev.filter((x) => x !== p)
      }
      return [...prev, p]
    })
  }

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
    const r = await post('/api/admin/social/publish', { dryRun, force, platforms }, 180000)
    setBusy(false)
    if (r.ok && r.body.success) {
      if (dryRun) {
        setPreview(r.body as DryRunResult)
        setIgCardStyle('meme')
        setThreadsCardStyle('classic')
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
    if (!preview?.cards || !preview.editionKey || platforms.length === 0) return
    setBusy(true)

    const imageUrls: Partial<Record<SocialPlatform, string | null>> = {}

    if (platforms.includes('instagram')) {
      const upIg = await post(
        '/api/admin/social/card-image',
        { editionKey: preview.editionKey, style: igCardStyle, dataUrl: preview.cards[igCardStyle] },
        60000,
      )
      if (!upIg.ok || !upIg.body?.success) {
        setBusy(false)
        setResult({ ok: false, message: `上傳 Instagram 圖卡失敗：${upIg.body?.error ?? 'network'}` })
        return
      }
      imageUrls.instagram = upIg.body.url
    }

    if (platforms.includes('threads')) {
      if (platforms.includes('instagram') && threadsCardStyle === igCardStyle && imageUrls.instagram) {
        imageUrls.threads = imageUrls.instagram
      } else {
        const upTh = await post(
          '/api/admin/social/card-image',
          { editionKey: preview.editionKey, style: threadsCardStyle, dataUrl: preview.cards[threadsCardStyle] },
          60000,
        )
        if (!upTh.ok || !upTh.body?.success) {
          setBusy(false)
          setResult({ ok: false, message: `上傳 Threads 圖卡失敗：${upTh.body?.error ?? 'network'}` })
          return
        }
        imageUrls.threads = upTh.body.url
      }
    }

    const r = await post(
      '/api/admin/social/publish',
      {
        dryRun: false,
        force: false,
        platforms,
        imageUrls,
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
  const isIgSelected = platforms.includes('instagram')
  const isThSelected = platforms.includes('threads')
  const manualDisabled =
    busy ||
    platforms.length === 0 ||
    (isIgSelected && (overIg || draftIg.trim() === '')) ||
    (isThSelected && (overTh || draftThreads.trim() === ''))

  const publishButtonText =
    platforms.length === 2
      ? '確認發布（IG 梗圖 ＋ Threads 資訊卡）'
      : isIgSelected
        ? '確認發布（僅 Instagram）'
        : '確認發布（僅 Threads）'

  return (
    <SectionPageWrapper title="社群小編" subtitle="IG (梗圖大字卡) 與 Threads (品牌資訊卡) 文案＋圖卡預覽與發布">
      <ResultBanner result={result} onDismiss={() => setResult(null)} />
      <Card title="操作">
        <div className="mb-4 flex flex-wrap items-center gap-5 pb-3 border-b border-[var(--border)]">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">發布目標平台：</span>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isIgSelected}
              onChange={() => togglePlatform('instagram')}
              className="accent-[var(--accent)] h-4 w-4 rounded cursor-pointer"
            />
            <span className={isIgSelected ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
              📷 Instagram
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isThSelected}
              onChange={() => togglePlatform('threads')}
              className="accent-[var(--accent)] h-4 w-4 rounded cursor-pointer"
            />
            <span className={isThSelected ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
              🧵 Threads
            </span>
          </label>
          <span className="text-xs text-[var(--text-secondary)]">（可單選或複選，直接發布與手動發布皆會套用）</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className={btn} onClick={() => run(true, false)} disabled={busy}>
            {busy ? '處理中…' : '乾跑預覽（文案＋圖卡×2）'}
          </button>
          <button className={btnGhost} onClick={() => run(false, false)} disabled={busy || platforms.length === 0}>
            直接發布（僅未發布平台）
          </button>
          <button className={btnGhost} onClick={() => run(false, true)} disabled={busy || platforms.length === 0}>
            強制重發選定平台（清去重）
          </button>
          <div className="flex items-center">
            <Help text="IG 預設搭配「梗圖大字卡」，Threads 預設搭配「品牌資訊卡」。乾跑只產出預覽，不呼叫 Meta API 也不寫去重。" />
          </div>
        </div>
        {busy && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            ⏳ 呼叫 AI 生成文案與兩種圖卡中…（已等待 {elapsed} 秒，通常需 30~120 秒）。完成前請勿關閉頁面。
          </p>
        )}
        {!preview && !busy && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">尚未乾跑。按下「乾跑預覽」會產出 Instagram（梗圖大字卡）與 Threads（品牌資訊卡）圖卡與文案。</p>
        )}
      </Card>

      {preview?.cards && !busy && (
        <>
          <div className={`grid gap-6 ${isIgSelected && isThSelected ? 'lg:grid-cols-2' : 'max-w-2xl mx-auto'}`}>
            {/* Instagram 設定與預覽 */}
            {isIgSelected && (
              <Card title="📷 Instagram 發布設定">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">圖卡配圖：</span>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="igCardStyle"
                          checked={igCardStyle === 'meme'}
                          onChange={() => setIgCardStyle('meme')}
                          className="accent-[var(--accent)]"
                        />
                        梗圖大字卡 (預設)
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="igCardStyle"
                          checked={igCardStyle === 'classic'}
                          onChange={() => setIgCardStyle('classic')}
                          className="accent-[var(--accent)]"
                        />
                        品牌資訊卡
                      </label>
                    </div>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.cards[igCardStyle]}
                    alt="Instagram 圖卡預覽"
                    className="w-full max-w-[400px] mx-auto rounded-2xl border border-[var(--accent)]/40 shadow-lg mb-4"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[var(--accent)]">Instagram 文案</h3>
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
              </Card>
            )}

            {/* Threads 設定與預覽 */}
            {isThSelected && (
              <Card title="🧵 Threads 發布設定">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">圖卡配圖：</span>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="threadsCardStyle"
                          checked={threadsCardStyle === 'classic'}
                          onChange={() => setThreadsCardStyle('classic')}
                          className="accent-[var(--accent)]"
                        />
                        品牌資訊卡 (預設)
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="threadsCardStyle"
                          checked={threadsCardStyle === 'meme'}
                          onChange={() => setThreadsCardStyle('meme')}
                          className="accent-[var(--accent)]"
                        />
                        梗圖大字卡
                      </label>
                    </div>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.cards[threadsCardStyle]}
                    alt="Threads 圖卡預覽"
                    className="w-full max-w-[400px] mx-auto rounded-2xl border border-white/20 shadow-lg mb-4"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[var(--accent)]">Threads 文案</h3>
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
              </Card>
            )}
          </div>

          <Card title="確認發布">
            {preview.meme && (
              <p className="mb-4 text-sm text-[var(--text-secondary)]">
                💡 本次 AI 生成梗圖概念：主標題 <b>{preview.meme.title}</b> ／ {preview.meme.punchline}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                className={btn}
                onClick={publishManual}
                disabled={manualDisabled}
              >
                {busy ? '處理中…' : publishButtonText}
              </button>
              <Help text="會將選定平台的對應圖卡快照上傳，再以編輯後的文案對選定平台發布。" />
            </div>
          </Card>
        </>
      )}
    </SectionPageWrapper>
  )
}