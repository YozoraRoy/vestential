import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { authorizeSync } from '@/lib/sync-auth'
import { startArenaTickJob } from '@/lib/arena'
import { isTaiwanMarketTradingDay, getLastMarketTradingDay } from '@/utils/taiwan-calendar'

export const dynamic = 'force-dynamic'

export const runtime = 'nodejs'

// 非同步模式：route 只負責建 job（秒級返回），實際 LLM 在背景跑，故不需 300s。
export const maxDuration = 60

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

  const phaseRaw = (searchParams.get('phase') ?? '').trim().toLowerCase()
  const phase: 'premarket' | 'slot' | 'close' | undefined = phaseRaw === 'premarket' || phaseRaw === 'slot' || phaseRaw === 'close' ? phaseRaw : undefined
  const slotParam = searchParams.get('slot')
  const slot = phase === 'slot' && slotParam ? Number(slotParam) : undefined
  const force = searchParams.get('force') === '1' || searchParams.get('force') === 'true'

  try {
    const started = await startArenaTickJob(roundDate, { phase, slot, force })
    return NextResponse.json(
      { success: true, jobId: started.jobId, roundDate: started.roundDate, phase: started.phaseKey, deduplicated: started.deduplicated },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e: any) {
    console.error('[Arena/Tick] failed to start job:', e)
    return NextResponse.json({ success: false, error: e.message ?? '建立 tick job 失敗' }, { status: 500 })
  }
}