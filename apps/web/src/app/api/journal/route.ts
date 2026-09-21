import { NextResponse } from 'next/server'
import { listTradeJournalEntries, saveTradeJournalEntry } from '@stock/database'
import { getCurrentUserFromCookies } from '../../../lib/auth'
import { validateJournalInput } from '../../../lib/journal'

/**
 * GET /api/journal — 列出本人的交易日誌（需登入；未登入回 401）。
 * Query: ?month=YYYY-MM（月篩選）&limit=（預設 100，上限 500）
 */
export async function GET(req: Request) {
  try {
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return NextResponse.json({ error: 'login required' }, { status: 401 })
    }
    const url = new URL(req.url)
    const month = url.searchParams.get('month')?.trim() || undefined
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '月份格式錯誤（請用 YYYY-MM）' }, { status: 400 })
    }
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500)
    const entries = await listTradeJournalEntries(user.id, { limit, month })
    return NextResponse.json({ success: true, entries })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * POST /api/journal — 新增一筆交易日誌（需登入；未登入回 401）。
 * 必填缺一即擋，錯誤訊息具名指出欄位。
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return NextResponse.json({ error: 'login required' }, { status: 401 })
    }
    const body = await req.json().catch(() => null)
    const parsed = validateJournalInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, missing: parsed.missing }, { status: 400 })
    }
    const id = await saveTradeJournalEntry({ userId: user.id, ...parsed.data })
    if (id <= 0) {
      return NextResponse.json({ error: '日誌儲存失敗' }, { status: 500 })
    }
    return NextResponse.json({ success: true, id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
