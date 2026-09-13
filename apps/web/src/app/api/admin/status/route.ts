import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { dbQueryFirst, listArenaRoundProgress, getUserUsageReport, migrate } from '@stock/database'
import { runHealthChecks } from '@/lib/health'
import { isAdminUser, getCurrentUserFromReq } from '@/lib/auth'
import { isTaiwanMarketTradingDay, getLastMarketTradingDay } from '@/utils/taiwan-calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function twDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d)
}

async function counts() {
  const c = async (table: string) => {
    try {
      const r = await dbQueryFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)
      return r?.n ?? 0
    } catch {
      return -1
    }
  }
  const users = await c('users')
  const agents = await c('arena_agents')
  const marketFocus = await c('market_focus')
  const socialPosts = await c('social_posts')
  const arenaRounds = await c('arena_equity_snapshots')
  return { users, agents, marketFocus, socialPosts, arenaRounds }
}

export async function GET(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  try {
    const health = await runHealthChecks()
    const [summary, usage] = await Promise.all([
      counts(),
      getUserUsageReport().catch(() => []),
    ])
    const todayTw = new Date(`${twDateStr(new Date())}T00:00:00`)
    let progressDate = twDateStr(new Date())
    let progress = await listArenaRoundProgress(progressDate).catch(() => [] as any[])
    if (progress.length === 0) {
      const lastTrading = twDateStr(getLastMarketTradingDay(todayTw))
      progress = await listArenaRoundProgress(lastTrading).catch(() => [] as any[])
      if (progress.length > 0) progressDate = lastTrading
    }

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      health,
      summary,
      arenaProgress: progress,
      arenaProgressDate: progressDate,
      todayIsTradingDay: isTaiwanMarketTradingDay(todayTw),
      usage: {
        totalUsers: usage.length,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'status 失敗' }, { status: 500 })
  }
}
