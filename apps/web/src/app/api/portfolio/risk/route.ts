import { NextResponse } from 'next/server'
import { getCurrentUserFromCookies } from '../../../../lib/auth'
import { applyGuestCookie, getCurrentGuestFromCookies, newGuestUid } from '../../../../lib/guest'
import { loadRiskSnapshot, UNCATEGORIZED_SECTOR } from '../../../../lib/portfolio-risk-server'
import { getPortfolioRecords, getPortfolioRecordsByGuest } from '@stock/database'

/**
 * GET /api/portfolio/risk — 組合風險儀表板資料（純計算，零 LLM、不碰 quota）。
 * 以「每 (market, symbol) 最新一筆」去重，台/美股分幣別成組（不混加金額）。
 */
export async function GET() {
  try {
    const user = await getCurrentUserFromCookies()
    let guestUid: string | null = null
    let createdGuest = false
    if (!user) {
      guestUid = await getCurrentGuestFromCookies()
      if (!guestUid) {
        guestUid = newGuestUid()
        createdGuest = true
      }
    }

    const snapshot = user
      ? await loadRiskSnapshot((limit) => getPortfolioRecords(user.id, limit))
      : await loadRiskSnapshot((limit) => getPortfolioRecordsByGuest(guestUid as string, limit))

    const res = NextResponse.json({
      success: true,
      ...snapshot,
      uncategorizedLabel: UNCATEGORIZED_SECTOR,
    })
    if (createdGuest && guestUid) await applyGuestCookie(res, guestUid)
    return res
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '風險試算失敗'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
