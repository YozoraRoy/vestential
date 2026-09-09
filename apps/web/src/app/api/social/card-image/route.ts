import { NextRequest, NextResponse } from 'next/server'
import { getSocialCardImage } from '@stock/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 圖卡快照公開端點：回傳後台手動發布前選定並上傳的那張圖卡 bytes。
 * 對 Meta 伺服器公開。找不到則 404。
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const edition = searchParams.get('edition')?.trim() ?? ''
    const style = searchParams.get('style')?.trim() ?? 'classic'
    const buf = await getSocialCardImage(edition, style)
    if (!buf || buf.length === 0) {
      return new Response('not found', { status: 404 })
    }
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': edition ? 'public, max-age=3600, immutable' : 'no-store',
        'Content-Length': String(buf.length),
      },
    })
  } catch (e: any) {
    console.error('[API/social/card-image] Failed:', e)
    return new Response(`load failed: ${e?.message ?? e}`, { status: 500 })
  }
}