import { NextResponse } from 'next/server'
import {
  getActiveArenaSeason,
  getArenaLeaderboard,
  listActiveArenaAgents,
  getArenaMarketBriefing,
  getArenaDiscussion,
  dbQueryFirst,
} from '@stock/database'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const season = await getActiveArenaSeason()
    if (!season) {
      return NextResponse.json({ season: null, leaderboards: {}, agents: [] })
    }
    const [seasonLb, openLb, latestRound] = await Promise.all([
      getArenaLeaderboard(season.id, 'season'),
      getArenaLeaderboard(season.id, 'open'),
      dbQueryFirst<{ max_date: string }>(
        'SELECT MAX(round_date) AS max_date FROM arena_equity_snapshots WHERE season_id = @seasonId',
        { seasonId: season.id },
      ),
    ])
    const maxDate = latestRound?.max_date ?? null
    let briefing: { content: string; model?: string | null } | null = null
    let discussion: { content: string; model?: string | null } | null = null
    if (maxDate) {
      const [b, d] = await Promise.all([
        getArenaMarketBriefing(maxDate),
        getArenaDiscussion(maxDate),
      ])
      if (b) briefing = { content: b.content, model: b.model }
      if (d) discussion = { content: d.content, model: d.model }
    }

    const agents = await listActiveArenaAgents()
    return NextResponse.json(
      {
        season,
        leaderboards: { season: seasonLb, open: openLb },
        agentsCount: agents.length,
        latestRound: maxDate ? { roundDate: maxDate, briefing, discussion } : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '取得競技場狀態失敗' }, { status: 500 })
  }
}