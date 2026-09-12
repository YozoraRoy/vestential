import { getMarketFocusMeta, getMarketFocus, getAgentSetting, saveSocialCardImage, getSocialCardImage, countSocialPublishedPosts } from '@stock/database'
import type { SocialPostPlatform } from '@stock/database'
import { generateSocialCaptions, generateMemeConcept, type SocialCaptions } from '@/lib/social'
import { renderSocialCard, type SocialCardStyle } from '@/lib/social-canvas'
import { generateSocialBackgroundImage, generateSocialArtworkImage } from '@/lib/social-ai-image'
import { publishSocialPost, alreadyPosted } from '@/lib/social-publish'
import { sendMarketFocusAlert } from '@/lib/email'

// ─── 社群發布協調層 ───────────────────────────────────────────────
// 供 market-focus/refresh 尾端內嵌觸發，也可由 publish route 獨立呼叫。

const SITE_BASE = process.env.AUTH_BASE_URL ?? 'https://vestential.com'

/**
 * IG 圖卡風格輪換：每 2 則發文為一區間，交錯使用 ai → meme。
 * 已發布數 0、1 → ai；2、3 → meme；4、5 → ai …（只計算 published）。
 */
export function pickIgCardStyle(postCount: number): 'ai' | 'meme' {
  return Math.floor(postCount / 2) % 2 === 0 ? 'ai' : 'meme'
}

export interface SocialPublishOutcome {
  triggered: boolean
  skipped?: boolean
  editionKey?: string | null
  dryRun?: boolean
  message?: string
  results?: { platform: SocialPostPlatform; status: string; error?: string | null }[]
  /** 僅 dryRun 時回傳：目前 social.card_style 設定值（作為預設選卡）。 */
  cardStyle?: SocialCardStyle
  /** 僅 dryRun 時回傳：依 IG 已發布數輪換建議的 IG 圖卡風格（ai | meme）。 */
  igCardStyle?: 'ai' | 'meme'
  /** 僅 dryRun 時回傳：classic 品牌卡 + meme 梗圖大字卡 + ai 全圖藝術卡，各一張 data URL。 */
  cards?: { classic: string; meme: string; ai: string }
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

  // 乾跑保持單純：不讀去重、不寫任何發布狀態。固定產生 classic＋meme＋ai 三版圖卡供選。
  if (dryRun) {
    const [captions, meme, bgImage] = await Promise.all([
      generateSocialCaptions(meta, items),
      generateMemeConcept(meta, items),
      generateSocialBackgroundImage({ headline: items[0]?.title, summary: meta.summary, items }).catch(() => null),
    ])
    // ai 全圖卡：依梗圖主軸另生成專屬不打字藝術構圖（無梗圖或生圖失敗時以一般底圖兜底）
    const aiArt = meme?.title ? await generateSocialArtworkImage(meme).catch(() => null) : null
    const cardStyle = ((await getAgentSetting('social.card_style').catch(() => null)) ?? 'classic') as SocialCardStyle
    const igCardStyle = pickIgCardStyle(await countSocialPublishedPosts('instagram').catch(() => 0))
    const toDataUrl = (buf: Buffer) => `data:image/jpeg;base64,${buf.toString('base64')}`
    const [classicBuf, memeBuf, aiBuf] = await Promise.all([
      renderSocialCard({ meta, items }, { style: 'classic', backgroundImage: bgImage }),
      renderSocialCard({ meta, items }, { style: 'meme', meme, backgroundImage: bgImage }),
      renderSocialCard({ meta, items }, { style: 'ai', meme, backgroundImage: aiArt ?? bgImage }),
    ])
    return {
      triggered: true,
      editionKey,
      dryRun: true,
      cardStyle,
      igCardStyle,
      cards: { classic: toDataUrl(classicBuf), meme: toDataUrl(memeBuf), ai: toDataUrl(aiBuf) },
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

  // 確保自動發布所需的圖卡快照皆已預先繪製並快取至 DB，避免 Meta API 抓取時動態調用 LLM 導致逾時 (9004)
  const igDefaultStyle = pickIgCardStyle(await countSocialPublishedPosts('instagram').catch(() => 0))
  const stylesNeeded = new Set<SocialCardStyle>()
  for (const { platform } of unresolved) {
    if (!options.imageUrls?.[platform] && !options.imageUrl) {
      stylesNeeded.add(platform === 'instagram' ? igDefaultStyle : 'classic')
    }
  }

  if (stylesNeeded.size > 0) {
    const missingStyles: SocialCardStyle[] = []
    for (const style of stylesNeeded) {
      const existing = await getSocialCardImage(editionKey!, style).catch(() => null)
      if (!existing) {
        missingStyles.push(style)
      }
    }

    if (missingStyles.length > 0) {
      const sharedBg = await generateSocialBackgroundImage({
        headline: items[0]?.title,
        summary: meta.summary,
        items,
      }).catch(() => null)

      for (const style of missingStyles) {
        let meme = null
        if (style === 'meme' || style === 'ai') {
          meme = await generateMemeConcept(meta, items)
        }
        // ai 全圖卡以 FLUX 專屬吉祥物藝術圖為主，失敗時退回一般底圖
        let backgroundImage = sharedBg
        if (style === 'ai' && meme?.title) {
          backgroundImage = (await generateSocialArtworkImage(meme).catch(() => null)) ?? sharedBg
        }
        const buf = await renderSocialCard({ meta, items }, { style, meme, backgroundImage })
        await saveSocialCardImage(editionKey!, style, buf).catch((e) => {
          console.warn(`[Social] 預先快取 ${style} 圖卡失敗:`, e)
        })
      }
    }
  }

  const results: SocialPublishOutcome['results'] = []
  for (const { platform } of unresolved) {
    const content = platform === 'instagram' ? contentByPlatform.instagram : contentByPlatform.threads
    // IG 依已發布數輪換 ai / meme；Threads 固定 classic 品牌資訊卡
    const defaultStyle: SocialCardStyle = platform === 'instagram' ? igDefaultStyle : 'classic'
    const imageUrl =
      options.imageUrls?.[platform] ??
      options.imageUrl ??
      buildCardImageUrl(editionKey!, defaultStyle)

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

export function buildImageUrl(editionKey: string, style: SocialCardStyle = 'classic'): string {
  return `${SITE_BASE}/api/social/og?edition=${encodeURIComponent(editionKey)}&style=${style}`
}

/** 手動發布用的圖卡快照 URL（乾跑後選定上傳的那張，與預覽完全一致）。 */
export function buildCardImageUrl(editionKey: string, style: SocialCardStyle): string {
  return `${SITE_BASE}/api/social/card-image?edition=${encodeURIComponent(editionKey)}&style=${style}`
}