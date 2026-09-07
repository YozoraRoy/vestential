import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  getArenaMarketBriefing,
  getArenaDiscussion,
  getArenaRoundDecisionLogs,
  getArenaIntradayPrices,
  dbQueryFirst,
} from '@stock/database'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  let roundDate = searchParams.get('date')?.trim()

  if (!roundDate) {
    const latest = await dbQueryFirst<{ round_date: string }>(
      'SELECT round_date FROM arena_equity_snapshots ORDER BY round_date DESC LIMIT 1',
    )
    roundDate = latest?.round_date ?? ''
  }

  if (!roundDate) {
    return NextResponse.json({
      roundDate: null,
      briefing: null,
      discussion: null,
      decisionLogs: [],
      intradayPrices: [],
    })
  }

  const [briefing, discussion, decisionLogs, intradayPrices] = await Promise.all([
    getArenaMarketBriefing(roundDate),
    getArenaDiscussion(roundDate),
    getArenaRoundDecisionLogs(roundDate),
    getArenaIntradayPrices(roundDate),
  ])

  return NextResponse.json({
    roundDate,
    briefing: briefing ? { content: briefing.content, model: briefing.model } : null,
    discussion: discussion ? { content: discussion.content, model: discussion.model } : null,
    decisionLogs,
    intradayPrices,
  })
}
