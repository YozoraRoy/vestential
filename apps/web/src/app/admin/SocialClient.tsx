'use client'

import { useEffect, useState } from 'react'
import { btn, btnGhost, Card, Help, input, post, ResultBanner, SectionPageWrapper, type Result } from './_components'

type SocialCardStyle = 'classic' | 'meme' | 'ai'

interface DryRunResult {
  editionKey?: string | null
  cardStyle?: SocialCardStyle
  igCardStyle?: 'ai' | 'meme'
  cards?: { classic: string; meme: string; ai: string }
  captions?: { instagram: string; threads: string; facebook: string }
  meme?: { title: string; punchline: string } | null
  results?: Array<{ platform: string; status: string; error?: string | null }>
  message?: string
  skipped?: boolean
  triggered?: boolean
  error?: string
}

type SocialPlatform = 'instagram' | 'threads' | 'facebook'

const IG_LIMIT = 2200
const TH_LIMIT = 500
const FB_LIMIT = 2200

const BG_PRESET_OPTIONS = [
  { id: 'auto', label: '🤖 AI 智能匹配新聞' },
  { id: 'chip', label: '🔬 晶片半導體' },
  { id: 'ai', label: '🧠 AI 算力中心' },
  { id: 'finance', label: '📈 金融趨勢線' },
  { id: 'energy', label: '⚡ 綠能智慧電網' },
  { id: 'shipping', label: '🚢 航運貨櫃巨輪' },
  { id: 'none', label: '⬛ 純色漸層 (無底圖)' },
]

export function SocialClient() {
  const [result, setResult] = useState<Result>(null)
  const [preview, setPreview] = useState<DryRunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(['instagram', 'threads', 'facebook'])
  const [threadsCardStyle, setThreadsCardStyle] = useState<SocialCardStyle>('classic')
  const [fbCardStyle, setFbCardStyle] = useState<SocialCardStyle>('classic')
  const [draftIg, setDraftIg] = useState('')
  const [draftThreads, setDraftThreads] = useState('')
  const [draftFb, setDraftFb] = useState('')
  const [bgPreset, setBgPreset] = useState('auto')
  const [bgCustomPrompt, setBgCustomPrompt] = useState('')
  const [generatingBg, setGeneratingBg] = useState(false)

  // Threads 回覆小編
  const [replyUrl, setReplyUrl] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [replyPost, setReplyPost] = useState<{ shortcode: string; mediaId: string | null; author: string; text: string; permalink: string } | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [replyDraftError, setReplyDraftError] = useState<string | undefined>(undefined)
  const [replyAlreadyReplied, setReplyAlreadyReplied] = useState(false)
  const [replyMaxChars, setReplyMaxChars] = useState(500)

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
        setThreadsCardStyle('classic')
        setFbCardStyle('classic')
        setDraftIg(r.body.captions?.instagram ?? '')
        setDraftThreads(r.body.captions?.threads ?? '')
        setDraftFb(r.body.captions?.facebook ?? '')
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

  const handleRegenerateBg = async (presetChoice = bgPreset) => {
    if (!preview?.editionKey) return
    setGeneratingBg(true)
    const r = await post(
      '/api/admin/social/generate-image',
      {
        preset: presetChoice,
        prompt: bgCustomPrompt.trim() || undefined,
        editionKey: preview.editionKey,
        meme: preview.meme,
      },
      60000,
    )
    setGeneratingBg(false)
    if (r.ok && r.body?.success && r.body?.cards) {
      setPreview((prev) => (prev ? { ...prev, cards: r.body.cards } : prev))
      setResult({
        ok: true,
        message: presetChoice === 'none' ? '已切換為純色深色漸層' : '科技底圖已成功重新生成並套用至所有圖卡！',
      })
    } else {
      setResult({
        ok: false,
        message: r.body?.error ? `底圖生成失敗：${r.body.error}` : '底圖生成連線逾時或網路錯誤',
      })
    }
  }

  const runThreadsReplyDraft = async () => {
    if (!replyUrl.trim()) return
    setReplyBusy(true)
    setReplyPost(null)
    setReplyDraft('')
    setReplyDraftError(undefined)
    setReplyAlreadyReplied(false)
    const r = await post('/api/admin/social/threads-reply/draft', { url: replyUrl }, 90000)
    setReplyBusy(false)
    if (r.ok && r.body.success && r.body.post) {
      setReplyPost(r.body.post)
      setReplyDraft(r.body.draft ?? '')
      setReplyDraftError(r.body.draftError)
      setReplyAlreadyReplied(!!r.body.alreadyReplied)
      setReplyMaxChars(r.body.maxChars ?? 500)
      setResult({ ok: true, message: `貼文讀取完成（@${r.body.post.author}），以下是擬稿。` })
    } else {
      setResult({ ok: false, message: r.body?.error ? `失敗：${r.body.error}` : '連線逾時或網路錯誤' })
    }
  }

  const publishThreadsReplyDraft = async () => {
    if (!replyPost?.mediaId || !replyDraft.trim()) return
    setReplyBusy(true)
    const r = await post(
      '/api/admin/social/threads-reply/publish',
      { mediaId: replyPost.mediaId, replyText: replyDraft, force: false },
      90000,
    )
    setReplyBusy(false)
    if (r.ok && r.body.success) {
      setReplyAlreadyReplied(true)
      setResult({ ok: true, message: `回覆已發布（${r.body.externalId}）` })
    } else {
      setResult({ ok: false, message: r.body?.error ? `發布失敗：${r.body.error}` : '連線逾時或網路錯誤' })
    }
  }

  const overReply = replyPost && Array.from(replyDraft).length > replyMaxChars

  const publishManual = async () => {
    if (!preview?.cards || !preview.editionKey || platforms.length === 0) return
    setBusy(true)

    const imageUrls: Partial<Record<SocialPlatform, string | null>> = {}

    if (platforms.includes('instagram')) {
      const upIg = await post(
        '/api/admin/social/card-image',
        { editionKey: preview.editionKey, style: 'ai', dataUrl: preview.cards.ai },
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
      if (platforms.includes('instagram') && threadsCardStyle === 'ai' && imageUrls.instagram) {
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

    if (platforms.includes('facebook')) {
      if (platforms.includes('instagram') && fbCardStyle === 'ai' && imageUrls.instagram) {
        imageUrls.facebook = imageUrls.instagram
      } else {
        const upFb = await post(
          '/api/admin/social/card-image',
          { editionKey: preview.editionKey, style: fbCardStyle, dataUrl: preview.cards[fbCardStyle] },
          60000,
        )
        if (!upFb.ok || !upFb.body?.success) {
          setBusy(false)
          setResult({ ok: false, message: `上傳 Facebook 圖卡失敗：${upFb.body?.error ?? 'network'}` })
          return
        }
        imageUrls.facebook = upFb.body.url
      }
    }

    const r = await post(
      '/api/admin/social/publish',
      {
        dryRun: false,
        force: false,
        platforms,
        imageUrls,
        captions: { instagram: draftIg, threads: draftThreads, facebook: draftFb },
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
  const overFb = draftFb.length > FB_LIMIT
  const isIgSelected = platforms.includes('instagram')
  const isThSelected = platforms.includes('threads')
  const isFbSelected = platforms.includes('facebook')
  const manualDisabled =
    busy ||
    platforms.length === 0 ||
    (isIgSelected && (overIg || draftIg.trim() === '')) ||
    (isThSelected && (overTh || draftThreads.trim() === '')) ||
    (isFbSelected && (overFb || draftFb.trim() === ''))

  const publishButtonText =
    isIgSelected && isThSelected && isFbSelected
      ? '確認發布（IG AI吉祥物全圖卡 ＋ Threads 資訊卡 ＋ Facebook 資訊卡）'
      : isIgSelected && isThSelected
        ? '確認發布（IG AI吉祥物全圖卡 ＋ Threads 資訊卡）'
        : isIgSelected && isFbSelected
          ? '確認發布（IG AI吉祥物全圖卡 ＋ Facebook 資訊卡）'
          : isThSelected && isFbSelected
            ? '確認發布（Threads ＋ Facebook 資訊卡）'
            : isIgSelected
              ? '確認發布（僅 Instagram）'
              : isThSelected
                ? '確認發布（僅 Threads）'
                : '確認發布（僅 Facebook）'

  return (
    <SectionPageWrapper title="社群小編" subtitle="IG (AI 吉祥物全圖卡)、Threads 與 Facebook (品牌資訊卡) 文案＋圖卡預覽與發布">
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
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isFbSelected}
              onChange={() => togglePlatform('facebook')}
              className="accent-[var(--accent)] h-4 w-4 rounded cursor-pointer"
            />
            <span className={isFbSelected ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
              🅵 Facebook
            </span>
          </label>
          <span className="text-xs text-[var(--text-secondary)]">（可單選或複選，直接發布與手動發布皆會套用）</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className={btn} onClick={() => run(true, false)} disabled={busy}>
            {busy ? '處理中…' : '乾跑預覽（文案＋圖卡×3）'}
          </button>
          <button className={btnGhost} onClick={() => run(false, false)} disabled={busy || platforms.length === 0}>
            直接發布（僅未發布平台）
          </button>
          <button className={btnGhost} onClick={() => run(false, true)} disabled={busy || platforms.length === 0}>
            強制重發選定平台（清去重）
          </button>
          <div className="flex items-center">
            <Help text="IG 一律搭配「AI 吉祥物全圖卡」；Threads 與 Facebook 預設搭配「品牌資訊卡」。乾跑只產出預覽，不呼叫 Meta API 也不寫去重。" />
          </div>
        </div>
        {busy && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            ⏳ 呼叫 AI 生成文案與三種圖卡中…（已等待 {elapsed} 秒，通常需 30~120 秒）。完成前請勿關閉頁面。
          </p>
        )}
        {!preview && !busy && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">尚未乾跑。按下「乾跑預覽」會產出 Instagram（固定 AI 吉祥物全圖卡）與 Threads／Facebook（品牌資訊卡），外加梗圖大字卡供選，共三種圖卡與文案。</p>
        )}
      </Card>

      {preview?.cards && !busy && (
        <>
          {/* AI 科技底圖工作室 */}
          <Card title="🎨 AI 科技底圖工作室 (Cloudflare FLUX.1-schnell)">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">底圖風格預設：</span>
                {BG_PRESET_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={generatingBg || busy}
                    onClick={() => {
                      setBgPreset(opt.id)
                      handleRegenerateBg(opt.id)
                    }}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                      bgPreset === opt.id
                        ? 'bg-[var(--accent)] text-black font-semibold border-[var(--accent)]'
                        : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[280px]">
                  <input
                    type="text"
                    className={input}
                    placeholder="自訂 Prompt (選填，如: cyberpunk futuristic data center in taipei)"
                    value={bgCustomPrompt}
                    onChange={(e) => setBgCustomPrompt(e.target.value)}
                    disabled={generatingBg || busy}
                  />
                </div>
                <button
                  className={btn}
                  type="button"
                  onClick={() => handleRegenerateBg()}
                  disabled={generatingBg || busy}
                >
                  {generatingBg ? '🎨 科技底圖生成中…' : '🔄 重新生成底圖'}
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                💡 採用 Cloudflare Workers AI 免費額度生成，每次約耗時 2~3 秒。點擊上方風格標籤即可一鍵替換底圖；若需極簡版面可點「純色深色漸層」。
              </p>
            </div>
          </Card>

          <div className={`grid gap-6 ${isIgSelected && isThSelected ? 'lg:grid-cols-2' : 'max-w-2xl mx-auto'}`}>
            {/* Instagram 設定與預覽 */}
            {isIgSelected && (
              <Card title="📷 Instagram 發布設定">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">圖卡配圖：</span>
                    <span className="text-sm">🤖 AI 吉祥物全圖卡（固定）</span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.cards.ai}
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
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="threadsCardStyle"
                          checked={threadsCardStyle === 'ai'}
                          onChange={() => setThreadsCardStyle('ai')}
                          className="accent-[var(--accent)]"
                        />
                        🎨 AI 吉祥物全圖卡
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

            {/* Facebook 設定與預覽 */}
            {isFbSelected && (
              <Card title="🅵 Facebook 發布設定">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">圖卡配圖：</span>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="fbCardStyle"
                          checked={fbCardStyle === 'classic'}
                          onChange={() => setFbCardStyle('classic')}
                          className="accent-[var(--accent)]"
                        />
                        品牌資訊卡 (預設)
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="fbCardStyle"
                          checked={fbCardStyle === 'meme'}
                          onChange={() => setFbCardStyle('meme')}
                          className="accent-[var(--accent)]"
                        />
                        梗圖大字卡
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="fbCardStyle"
                          checked={fbCardStyle === 'ai'}
                          onChange={() => setFbCardStyle('ai')}
                          className="accent-[var(--accent)]"
                        />
                        🎨 AI 吉祥物全圖卡
                      </label>
                    </div>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.cards[fbCardStyle]}
                    alt="Facebook 圖卡預覽"
                    className="w-full max-w-[400px] mx-auto rounded-2xl border border-white/20 shadow-lg mb-4"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[var(--accent)]">Facebook 文案</h3>
                    <span className={`text-xs ${overFb ? 'text-[var(--accent-red)]' : 'text-[var(--text-secondary)]'}`}>
                      {draftFb.length}/{FB_LIMIT}
                    </span>
                  </div>
                  <textarea
                    className={input}
                    rows={8}
                    maxLength={FB_LIMIT + 200}
                    value={draftFb}
                    onChange={(e) => setDraftFb(e.target.value)}
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

      <Card title="🧵 Threads 回覆小編（擬稿 → 審核 → 發布）">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[300px]">
            <input
              type="text"
              className={input}
              placeholder="貼上 Threads 貼文網址或短代碼（例如 https://www.threads.com/@user/post/Dc2VzRiElRJ）"
              value={replyUrl}
              onChange={(e) => setReplyUrl(e.target.value)}
              disabled={replyBusy}
            />
          </div>
          <button className={btn} onClick={runThreadsReplyDraft} disabled={replyBusy || !replyUrl.trim()}>
            {replyBusy ? '處理中…' : '讀取貼文並擬稿'}
          </button>
          <button
            className={btnGhost}
            onClick={runThreadsReplyDraft}
            disabled={replyBusy || !replyPost}
          >
            🔄 重新擬稿
          </button>
          <Help text="帶 LLM 依品牌語氣「順著話題自然接話」擬稿；發布前可自行修改。回覆是純文字。注意：Threads API 目前只允許回覆「自家／可讀取」的貼文，回覆別人熱門貼文常被平台拒絕（需 App Review 打通）。" />
        </div>

        {replyPost && (
          <div className="mt-3 space-y-3">
            {replyAlreadyReplied && (
              <p className="text-sm text-[var(--accent-red)]">⚠️ 這則貼文已回覆過（去重擋下），發布按鈕已停用。</p>
            )}
            <div className="rounded-xl border border-[var(--border)] bg-black/20 p-3">
              <p className="text-xs text-[var(--text-secondary)] mb-1">
                @{replyPost.author} 的原串文{' '}
                <a
                  href={replyPost.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent)] underline break-all"
                >
                  {replyPost.permalink}
                </a>
              </p>
              <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">{replyPost.text}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-[var(--accent)]">擬稿回覆（可編輯）</h3>
                <span className={`text-xs ${overReply ? 'text-[var(--accent-red)]' : 'text-[var(--text-secondary)]'}`}>
                  {Array.from(replyDraft).length}/{replyMaxChars}
                </span>
              </div>
              <textarea
                className={input}
                rows={5}
                maxLength={replyMaxChars + 100}
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                disabled={replyBusy}
              />
              {replyDraftError && (
                <p className="mt-1 text-xs text-[var(--accent-red)]">AI 擬稿失敗：{replyDraftError}（可自行撰寫後發布）</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                className={btn}
                onClick={publishThreadsReplyDraft}
                disabled={replyBusy || replyAlreadyReplied || !replyPost.mediaId || !replyDraft.trim() || !!overReply}
              >
                {replyBusy ? '處理中…' : '發布回覆（人工審核後）'}
              </button>
              <Help text="按下才會真正發布（TEXT 回覆載具 → threads_publish）。發布過程約需 40 秒等待容器就緒。" />
            </div>
          </div>
        )}
      </Card>
    </SectionPageWrapper>
  )
}