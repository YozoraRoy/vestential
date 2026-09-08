import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  getActiveArenaSeason,
  getArenaLeaderboard,
  listActiveArenaAgents,
  listArenaRoundProgress,
  migrate,
} from '@stock/database'
import { isAdminUser, getCurrentUserFromReq } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function twDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d)
}

export async function GET(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  try {
    const season = await getActiveArenaSeason().catch(() => null)
    const roundDate = twDateStr(new Date())
    const [progress, agents, leaderboard] = await Promise.all([
      listArenaRoundProgress(roundDate).catch(() => [] as any[]),
      listActiveArenaAgents().catch(() => [] as any[]),
      season ? getArenaLeaderboard(season.id, null).catch(() => [] as any[]) : Promise.resolve([] as any[]),
    ])
    return NextResponse.json({ success: true, roundDate, season, progress, agents, leaderboard })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'arena 查詢失敗' }, { status: 500 })
  }
}
