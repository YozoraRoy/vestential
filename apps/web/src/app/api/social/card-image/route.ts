import { NextRequest, NextResponse } from 'next/server'
import { getSocialCardImage, getMarketFocus, getMarketFocusMeta } from '@stock/database'
import { renderSocialCard } from '@/lib/social-canvas'
import { getFallbackMemeConcept } from '@/lib/social'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 圖卡快照公開端點：回傳已儲存的圖卡 bytes。
 * 對 Meta 伺服器公開。若 DB 快照遺失，以純 Canvas 即時兜底（不調用 LLM），確保 Meta 爬蟲必能取得合法 JPEG。
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const edition = searchParams.get('edition')?.trim() ?? ''
    const styleParam = searchParams.get('style')?.trim() ?? 'classic'
    const style: 'classic' | 'meme' = styleParam === 'meme' ? 'meme' : 'classic'

    let buf = await getSocialCardImage(edition, style).catch(() => null)
    if (!buf || buf.length === 0) {
      const meta = await getMarketFocusMeta().catch(() => null)
      if (meta?.summary) {
        const items = await getMarketFocus(6, 2).catch(() => [])
        const meme = style === 'meme' ? getFallbackMemeConcept(items) : null
        buf = await renderSocialCard({ meta, items }, { style, meme }).catch(() => null)
      }
    }

    if (!buf || buf.length === 0) {
      return new Response('not found', { status: 404 })
    }
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': edition ? 'public, max-age=3600, immutable' : 'no-store',
        'Content-Length': String(buf.length),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e: any) {
    console.error('[API/social/card-image] Failed:', e)
    return new Response('Internal Server Error', { status: 500 })
  }
}