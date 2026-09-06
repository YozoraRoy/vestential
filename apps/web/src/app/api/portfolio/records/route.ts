import { NextResponse } from 'next/server'
import { getCurrentUserFromCookies } from '../../../../lib/auth'
import { applyGuestCookie, getCurrentGuestFromCookies, newGuestUid } from '../../../../lib/guest'
import { getPortfolioRecords, getPortfolioRecordsByGuest } from '@stock/database'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100)

  try {
    const user = await getCurrentUserFromCookies()
    if (user) {
      const records = await getPortfolioRecords(user.id, limit)
      return NextResponse.json({ success: true, records, mode: 'user' })
    }

    // 訪客模式：無 cookie 則建立一個 workspace（不回 401）。
    let gid = await getCurrentGuestFromCookies()
    if (!gid) gid = newGuestUid()
    const records = await getPortfolioRecordsByGuest(gid, limit)
    const res = NextResponse.json({ success: true, records, mode: 'guest' })
    await applyGuestCookie(res, gid)
    return res
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}