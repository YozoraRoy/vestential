import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { listArenaRoundDates } from '@stock/database'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

/** 歷史輪次日期清單（時間軸＋分頁）：GET ?limit=10&cursor=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawLimit = Number(searchParams.get('limit') ?? PAGE_SIZE)
  const limit = Math.min(Math.max(Math.floor(rawLimit) || PAGE_SIZE, 1), 30)
  const cursor = searchParams.get('cursor')?.trim() || undefined
  if (cursor && !/^\d{4}-\d{2}-\d{2}$/.test(cursor)) {
    return NextResponse.json({ error: 'cursor 格式錯誤（需 YYYY-MM-DD）' }, { status: 400 })
  }

  // 多取一筆判斷是否還有下一頁（keyset 分頁）
  const rows = await listArenaRoundDates(limit + 1, cursor)
  const dates = rows.map((r) => r.round_date)
  const hasMore = dates.length > limit
  const page = hasMore ? dates.slice(0, limit) : dates
  return NextResponse.json(
    {
      dates: page,
      nextCursor: hasMore ? page[page.length - 1] : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
