import { NextResponse } from 'next/server'
import { listTradeJournalEntries } from '@stock/database'
import { getCurrentUserFromCookies } from '../../../../lib/auth'
import { computeJournalStats } from '../../../../lib/journal'

/**
 * GET /api/journal/stats — 月統計（需登入；未登入回 401）。
 * 純計算、零 LLM、不碰 quota：由明細經 computeJournalStats 重算
 * （筆數/勝率/平均賺賠/最大回撤筆），與明細加總一致。
 * Query: ?month=YYYY-MM（預設當月）
 */
export async function GET(req: Request) {
  try {
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return NextResponse.json({ error: 'login required' }, { status: 401 })
    }
    const url = new URL(req.url)
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const month = url.searchParams.get('month')?.trim() || defaultMonth
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '月份格式錯誤（請用 YYYY-MM）' }, { status: 400 })
    }
    const entries = await listTradeJournalEntries(user.id, { limit: 500, month })
    const stats = computeJournalStats(entries)
    return NextResponse.json({ success: true, month, stats, entries })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
