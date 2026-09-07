import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { authorizeSync } from '@/lib/sync-auth'
import { runArenaTick } from '@/lib/arena'
import { isTaiwanMarketTradingDay, getLastMarketTradingDay } from '@/utils/taiwan-calendar'

export const dynamic = 'force-dynamic'

export const runtime = 'nodejs'

export const maxDuration = 300

function twDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d)
}

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const key = new URL(req.url).searchParams.get('key')
  if (secret && key && key === secret) return true
  if (authorizeSync(req)) return true
  const user = await getCurrentUserFromReq(req)
  return !!user && (await isAdminUser(user))
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: '無權限（需 admin 或 cron key）' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get('date')
  const todayTw = new Date(`${twDateStr(new Date())}T00:00:00`)
  const roundDate = dateParam?.trim() || (isTaiwanMarketTradingDay(todayTw)
    ? twDateStr(todayTw)
    : twDateStr(getLastMarketTradingDay(todayTw)))

  try {
    const result = await runArenaTick(roundDate)
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[Arena/Tick] failed:', e)
    return NextResponse.json({ success: false, error: e.message ?? '收官失敗' }, { status: 500 })
  }
}