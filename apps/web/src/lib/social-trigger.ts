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
  /** 僅 dryRun 時回傳：本次渲染的文案與圖卡，供後台乾跑預覽。 */
  captions?: SocialCaptions
  imageDataUrl?: string
  meme?: { title: string; punchline: string } | null
  error?: string
}

/**
 * 依目前市場焦點總覽執行社群發布（有新版 edition 才發）。
 * @param dryRun 只生成文案＋圖卡＋紀錄，不動 Meta API。
 * @param platforms 預設兩平台皆發。
 */
export async function triggerSocialPublish(
  options: { dryRun?: boolean; platforms?: SocialPostPlatform[]; force?: boolean } = {},
): Promise<SocialPublishOutcome> {
  const dryRun = options.dryRun ?? false
  const force = options.force ?? false
  const platforms = options.platforms?.length ? options.platforms : (['instagram', 'threads'] as SocialPostPlatform[])

  const meta = await getMarketFocusMeta()
  if (!meta?.summary) {
    return { triggered: false, skipped: true, error: 'market_focus_meta 尚無內容' }
  }

  const editionKey = meta.generated_at
  const items = await getMarketFocus(6, 2)

  // force 重發時跳過去重，所有指定平台一律重跑；否則只處理未發布過的平台。
  const unresolved = force
    ? platforms.map((p) => ({ platform: p, posted: false }))
    : (
        await Promise.all(platforms.map(async (p) => ({ platform: p, posted: await alreadyPosted(p, editionKey!) })))
      ).filter((x) => !x.posted)

  if (unresolved.length === 0) {
    return { triggered: false, skipped: true, editionKey, message: 'edition 已發布或無新內容' }
  }

  const captions = await generateSocialCaptions(meta, items)
  const cardStyle = ((await getAgentSetting('social.card_style').catch(() => null)) ?? 'classic') as 'classic' | 'meme'
  const meme = cardStyle === 'meme' ? await generateMemeConcept(meta, items) : null
  const cardBuffer = await renderSocialCard({ meta, items }, { style: cardStyle, meme })
  const imageUrl = buildImageUrl(editionKey!)

  const results: SocialPublishOutcome['results'] = []
  for (const { platform } of unresolved) {
    const content = platform === 'instagram' ? captions.instagram : captions.threads
    const res = await publishSocialPost(platform, editionKey!, content, imageUrl, dryRun, force)
    results.push({ platform, status: res.status, error: res.error })
  }

  const failed = results.filter((r) => r.status === 'failed')
  if (failed.length > 0 && !dryRun) {
    await sendMarketFocusAlert(
      '社群發布部分失敗',
      `${failed.map((f) => `${f.platform}: ${f.error}`).join('\n')}\nedition: ${editionKey}`,
    )
  }

  const outcome: SocialPublishOutcome = { triggered: true, editionKey, dryRun, results }
  if (dryRun) {
    outcome.captions = captions
    outcome.imageDataUrl = `data:image/jpeg;base64,${cardBuffer.toString('base64')}`
    outcome.meme = meme
  }
  return outcome
}

export function buildImageUrl(editionKey: string): string {
  return `${SITE_BASE}/api/social/og?edition=${encodeURIComponent(editionKey)}`
}