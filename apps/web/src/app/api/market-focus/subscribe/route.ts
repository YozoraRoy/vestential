import { NextResponse } from 'next/server'
import { migrate, subscribeMarketFocus } from '@stock/database'
import { sendMarketFocusConfirmEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 公開訂閱（double opt-in 第一段）：前台市場焦點頁的 Email 訂閱按鈕。建立 pending 並寄確認信。 */
export async function POST(req: Request) {
  await migrate()
  let body: { email?: string } = {}
  try {
    body = await req.json()
  } catch {}
  const email = (body.email ?? '').trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return NextResponse.json({ success: false, error: '請輸入有效的 Email 地址' }, { status: 400 })
  }
  try {
    const row = await subscribeMarketFocus(email)
    const emailSent = await sendMarketFocusConfirmEmail(row.email, row.token)
    return NextResponse.json({ success: true, email: row.email, status: row.status, emailSent })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? '訂閱失敗' }, { status: 500 })
  }
}