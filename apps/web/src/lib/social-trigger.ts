import { getMarketFocusMeta, getMarketFocus, getAgentSetting } from '@stock/database'
import type { SocialPostPlatform } from '@stock/database'
import { generateSocialCaptions, generateMemeConcept, type SocialCaptions } from '@/lib/social'
import { renderSocialCard } from '@/lib/social-canvas'
import { publishSocialPost, alreadyPosted } from '@/lib/social-publish'
import { sendMarketFocusAlert } from '@/lib/email'

// ─── 社群發布協調層 ───────────────────────────────────────────────
// 供 market-focus/refresh 尾端內嵌觸發，也可由 publish route 獨立呼叫。

const SITE_BASE = process.env.AUTH_BASE_URL ?? 'https://vestential.com'

export interface SocialPublishOutcome {
  triggered: boolean
  skipped?: boolean
  editionKey?: string | null
  dryRun?: boolean
  message?: string
  results?: { platform: SocialPostPlatform; status: string; error?: string | null }[]
  /** 僅 dryRun 時回傳：目前 social.card_style 設定值（作為預設選卡）。 */
  cardStyle?: 'classic' | 'meme'
  /** 僅 dryRun 時回傳：classic 品牌卡 + meme 梗圖大字卡，各一張 data URL。 */
  cards?: { classic: string; meme: string }
  captions?: SocialCaptions
  meme?: { title: string; punchline: string } | null
  error?: string
}

/**
 * 依目前市場焦點總覽執行社群發布（有新版 edition 才發）。
 * @param dryRun 只生成文案＋圖卡（classic＋meme 兩版）供預覽，不動 Meta API、不寫去重。
 * @param platforms 預設兩平台皆發。
 * @param force 發布時忽略去重強制重發（乾跑不受影響）。
 * @param imageUrl+captions 手動發布：用乾跑後上傳的圖卡 URL 與改寫後的文案（不再自動生成）。
 */
export async function triggerSocialPublish(
  options: {
    dryRun?: boolean
    platforms?: SocialPostPlatform[]
    force?: boolean
    imageUrl?: string | null
    imageUrls?: Partial<Record<SocialPostPlatform, string | null>>
    captions?: SocialCaptions
  } = {},
): Promise<SocialPublishOutcome> {
  const dryRun = options.dryRun ?? false
  const force = options.force ?? false
  const platforms = options.platforms?.length ? options.platforms : (['instagram', 'threads'] as SocialPostPlatform[])
  const manual = !!((options.imageUrl || options.imageUrls) && options.captions)

  const meta = await getMarketFocusMeta()
  if (!meta?.summary) {
    return { triggered: false, skipped: true, error: 'market_focus_meta 尚無內容' }
  }

  const editionKey = meta.generated_at
  const items = await getMarketFocus(6, 2)

  // 乾跑保持單純：不讀去重、不寫任何發布狀態。固定產生 classic＋meme 兩版圖卡供選。
  if (dryRun) {
    const captions = await generateSocialCaptions(meta, items)
    const cardStyle = ((await getAgentSetting('social.card_style').catch(() => null)) ?? 'classic') as 'classic' | 'meme'
    const meme = await generateMemeConcept(meta, items)
    const toDataUrl = (buf: Buffer) => `data:image/jpeg;base64,${buf.toString('base64')}`
    const [classicBuf, memeBuf] = await Promise.all([
      renderSocialCard({ meta, items }, { style: 'classic' }),
      renderSocialCard({ meta, items }, { style: 'meme', meme }),
    ])
    return {
      triggered: true,
      editionKey,
      dryRun: true,
      cardStyle,
      cards: { classic: toDataUrl(classicBuf), meme: toDataUrl(memeBuf) },
      captions,
      meme,
      results: platforms.map((p) => ({ platform: p, status: 'dry_run', error: null })),
    }
  }

  // 發布：去重與發布綁定。force 重發時清除去重紀錄並全部重跑；否則只處理未發布過的平台。
  const unresolved = force
    ? platforms.map((p) => ({ platform: p, posted: false }))
    : (
        await Promise.all(platforms.map(async (p) => ({ platform: p, posted: await alreadyPosted(p, editionKey!) })))
      ).filter((x) => !x.posted)

  if (unresolved.length === 0) {
    return { triggered: false, skipped: true, editionKey, message: 'edition 已發布或無新內容' }
  }

  // 手動發布（乾跑後選定圖卡＋改文案）：直接用指定的圖與文字；自動發布則產出文案＋og 圖。
  const contentByPlatform = manual ? options.captions! : await generateSocialCaptions(meta, items)

  const results: SocialPublishOutcome['results'] = []
  for (const { platform } of unresolved) {
    const content = platform === 'instagram' ? contentByPlatform.instagram : contentByPlatform.threads
    // IG 預設用 meme 梗圖大字卡，Threads 預設用 classic 品牌資訊卡
    const defaultStyle: 'classic' | 'meme' = platform === 'instagram' ? 'meme' : 'classic'
    const imageUrl =
      options.imageUrls?.[platform] ??
      options.imageUrl ??
      buildImageUrl(editionKey!, defaultStyle)

    const res = await publishSocialPost(platform, editionKey!, content, imageUrl, false, force)
    results.push({ platform, status: res.status, error: res.error })
  }

  const failed = results.filter((r) => r.status === 'failed')
  if (failed.length > 0) {
    await sendMarketFocusAlert(
      '社群發布部分失敗',
      `${failed.map((f) => `${f.platform}: ${f.error}`).join('\n')}\nedition: ${editionKey}`,
    )
  }

  return { triggered: true, editionKey, dryRun: false, results }
}

export function buildImageUrl(editionKey: string, style: 'classic' | 'meme' = 'classic'): string {
  return `${SITE_BASE}/api/social/og?edition=${encodeURIComponent(editionKey)}&style=${style}`
}

/** 手動發布用的圖卡快照 URL（乾跑後選定上傳的那張，與預覽完全一致）。 */
export function buildCardImageUrl(editionKey: string, style: 'classic' | 'meme'): string {
  return `${SITE_BASE}/api/social/card-image?edition=${encodeURIComponent(editionKey)}&style=${style}`
}