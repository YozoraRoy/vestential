import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  getArenaDiscussion,
  getArenaIntradayPrices,
  getArenaMarketBriefing,
  getActiveArenaSeason,
  getArenaLeaderboard,
  getArenaRoundUniverse,
  getArenaSnapshots,
  migrate,
} from '@stock/database'
import { isAdminUser, getCurrentUserFromReq } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  const roundDate = req.nextUrl.searchParams.get('round_date')?.trim() ?? ''
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
  const date = roundDate || today
  try {
    const [briefing, discussion, universe, intraday, season] = await Promise.all([
      getArenaMarketBriefing(date).catch(() => null),
      getArenaDiscussion(date).catch(() => null),
      getArenaRoundUniverse(date).catch(() => [] as any[]),
      getArenaIntradayPrices(date).catch(() => [] as any[]),
      getActiveArenaSeason().catch(() => null),
    ])
    const leaderboard = season
      ? await getArenaLeaderboard(season.id, null).catch(() => [] as any[])
      : []
    const bySlot: Record<number, { timeLabel: string | null; rows: any[] }> = {}
    for (const p of intraday as any[]) {
      const key = p.slot
      bySlot[key] ??= { timeLabel: p.time_label, rows: [] }
      bySlot[key].rows.push({
        symbol: p.symbol,
        price: p.price,
        changePct: p.change_pct,
      })
    }
    const equitySeries: Record<number, any[]> = {}
    for (const lb of leaderboard as any[]) {
      const agentId = lb.agent_id
      const snapshots = await getArenaSnapshots(agentId).catch(() => [] as any[])
      equitySeries[agentId] = snapshots.map((s: any) => ({
        roundDate: s.round_date,
        cash: s.cash,
        equity: s.equity,
        returnPct: s.return_pct,
      }))
    }
    return NextResponse.json({
      success: true,
      roundDate: date,
      briefing: briefing
        ? {
            content: briefing.content,
            model: briefing.model,
            fallbackUsed: briefing.fallback_used === 1,
            createdAt: briefing.created_at ?? null,
          }
        : null,
      discussion: discussion
        ? {
            content: discussion.content,
            model: discussion.model,
            fallbackUsed: discussion.fallback_used === 1,
            createdAt: discussion.created_at ?? null,
          }
        : null,
      universe: universe.map((u: any) => ({ symbol: u.symbol, name: u.name })),
      intraday: bySlot,
      standings: leaderboard.map((l: any) => ({
        agentId: l.agent_id,
        agentName: l.agent_name,
        strategyId: l.strategy_id,
        tone: l.tone,
        equity: l.equity,
        cash: l.cash,
        returnPct: l.return_pct,
        roundDate: l.round_date,
        rounds: l.rounds,
      })),
      equitySeries,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'round 查詢失敗' }, { status: 500 })
  }
}