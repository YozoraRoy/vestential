import { NextResponse } from 'next/server'
import { getMarketFocus, getMarketFocusMeta } from '@stock/database'
import { renderSocialCard } from '@/lib/social-canvas'
import { generateMemeConcept } from '@/lib/social'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 圖卡公開端點：依 edition（market_focus_meta.generated_at）與 style（classic | meme）
 * 從 DB 重繪對應圖卡。IG/Threads 在發布時會即時下載本 URL。
 * 不需授權（對 Meta 伺服器公開）。
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const edition = searchParams.get('edition')?.trim()
    const styleParam = searchParams.get('style')?.trim()
    const style: 'classic' | 'meme' = styleParam === 'meme' ? 'meme' : 'classic'

    const meta = await getMarketFocusMeta()
    if (!meta?.summary) {
      return new Response('no data', { status: 404 })
    }

    // 若指定 edition 且與目前總覽不同（舊的），仍以目前資料重繪（保相容）
    const items = await getMarketFocus(6, 2)
    let meme = null
    if (style === 'meme') {
      meme = await generateMemeConcept(meta, items)
    }
    const buf = await renderSocialCard({ meta, items }, { style, meme })

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': edition ? 'public, max-age=3600, immutable' : 'no-store',
        'Content-Length': String(buf.length),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: any) {
    console.error('[API/social/og] Failed:', error)
    return new Response('render failed', { status: 500 })
  }
}