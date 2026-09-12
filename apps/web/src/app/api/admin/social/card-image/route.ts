import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { migrate, saveSocialCardImage } from '@stock/database'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { buildCardImageUrl } from '@/lib/social-trigger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const editionKey = String(body?.editionKey ?? '').trim()
    const style = String(body?.style ?? '').trim()
    const dataUrl = String(body?.dataUrl ?? '')
    if (!editionKey || !style || !/^(classic|meme|ai)$/.test(style)) {
      return NextResponse.json({ success: false, error: 'editionKey/style 不正確' }, { status: 400 })
    }
    const cardStyle = style as 'classic' | 'meme' | 'ai'
    const comma = dataUrl.indexOf(',')
    if (comma < 0) {
      return NextResponse.json({ success: false, error: 'dataUrl 格式不正確' }, { status: 400 })
    }
    const buf = Buffer.from(dataUrl.slice(comma + 1), 'base64')
    if (buf.length === 0) {
      return NextResponse.json({ success: false, error: '圖卡資料為空' }, { status: 400 })
    }
    // 防呆限制：圖卡不應超過 5MB，避免 DB 異常膨脹
    if (buf.length > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: '圖卡檔案大小超過 5MB 限制' }, { status: 400 })
    }
    await saveSocialCardImage(editionKey, cardStyle, buf)
    return NextResponse.json({ success: true, url: buildCardImageUrl(editionKey, cardStyle) })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? '圖卡上傳失敗' }, { status: 500 })
  }
}