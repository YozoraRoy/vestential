import { NextResponse } from 'next/server'
import { getActiveArenaSeason, getArenaLeaderboard, listActiveArenaAgents } from '@stock/database'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const season = await getActiveArenaSeason()
    if (!season) {
      return NextResponse.json({ season: null, leaderboards: {}, agents: [] })
    }
    const [seasonLb, openLb] = await Promise.all([
      getArenaLeaderboard(season.id, 'season'),
      getArenaLeaderboard(season.id, 'open'),
    ])
    const agents = await listActiveArenaAgents()
    return NextResponse.json(
      {
        season,
        leaderboards: { season: seasonLb, open: openLb },
        agentsCount: agents.length,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '取得競技場狀態失敗' }, { status: 500 })
  }
}