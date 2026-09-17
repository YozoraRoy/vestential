import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { authorizeSync } from '@/lib/sync-auth'
import { getArenaTickJobById } from '@stock/database'
import { interpretArenaTickJobStatus } from '@/lib/arena'

export const dynamic = 'force-dynamic'

export const runtime = 'nodejs'

export const maxDuration = 60

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const key = new URL(req.url).searchParams.get('key')
  if (secret && key && key === secret) return true
  if (authorizeSync(req)) return true
  const user = await getCurrentUserFromReq(req)
  return !!user && (await isAdminUser(user))
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: '無權限（需 admin 或 cron key）' }, { status: 401 })
  }

  const jobId = Number(new URL(req.url).searchParams.get('jobId') ?? '')
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return NextResponse.json(
      { success: true, status: 'failed', error: 'jobId 遺失或格式錯誤，請重新觸發' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const job = await getArenaTickJobById(jobId)
  if (!job) {
    return NextResponse.json(
      { success: true, status: 'failed', error: 'job 不存在（可能已流失或 DB 重置），請重新觸發' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const view = interpretArenaTickJobStatus(job)
  return NextResponse.json({ success: true, ...view }, { headers: { 'Cache-Control': 'no-store' } })
}