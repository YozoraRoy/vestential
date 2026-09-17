import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { migrate } from '@stock/database'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { startArenaTickJob } from '@/lib/arena'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  let body: { date?: string; phase?: string; slot?: number; force?: boolean } = {}
  try {
    body = await req.json()
  } catch {}
  const phaseRaw = (body.phase ?? '').toString().trim().toLowerCase()
  const phase: 'premarket' | 'slot' | 'close' | undefined =
    phaseRaw === 'premarket' || phaseRaw === 'slot' || phaseRaw === 'close' ? phaseRaw : undefined
  const slot = phase === 'slot' && body.slot != null ? Number(body.slot) : undefined
  const date = body.date?.trim() || undefined

  try {
    const started = await startArenaTickJob(date!, { phase, slot, force: !!body.force })
    return NextResponse.json({
      success: true,
      jobId: started.jobId,
      roundDate: started.roundDate,
      phase: started.phaseKey,
      deduplicated: started.deduplicated,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? '建立 arena tick job 失敗' }, { status: 500 })
  }
}