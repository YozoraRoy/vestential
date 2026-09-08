import { NextResponse } from 'next/server'
import { getMarketFocus, getMarketFocusMeta } from '@stock/database'
import { renderSocialCard } from '@/lib/social-canvas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 圖卡公開端點（方案 C）：依 edition（market_focus_meta.generated_at）
 * 從 DB 重繪同一張深色品牌卡。IG/Threads 在發布時會即時下載本 URL。
 * 不需授權（對 Meta 伺服器公開）。
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const edition = searchParams.get('edition')?.trim()
    const meta = await getMarketFocusMeta()
    if (!meta?.summary) {
      return new Response('no data', { status: 404 })
    }

    // 若指定 edition 且與目前總覽不同（舊的），仍以目前資料重繪（保相容）
    const items = await getMarketFocus(6, 2)
    const buf = await renderSocialCard({ meta, items })

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': edition ? 'public, max-age=3600, immutable' : 'no-store',
        'Content-Length': String(buf.length),
      },
    })
  } catch (error: any) {
    console.error('[API/social/og] Failed:', error)
    return new Response(`render failed: ${error.message}`, { status: 500 })
  }
}