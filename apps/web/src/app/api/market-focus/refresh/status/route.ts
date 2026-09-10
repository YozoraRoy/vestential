import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getMarketFocusJob } from '@/lib/market-focus-job'
import { authorizeSync } from '@/lib/sync-auth'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/** 查詢市場焦點背景 Job 的執行結果（GitHub 排程用 SYNC_TOKEN，後台用管理員登入）。 */
export async function GET(req: NextRequest) {
  const syncOk = authorizeSync(req)
  let adminOk = false
  if (!syncOk) {
    try {
      const user = await getCurrentUserFromReq(req)
      adminOk = !!(user && (await isAdminUser(user)))
    } catch {}
  }
  if (!syncOk && !adminOk) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('jobId') ?? ''
  if (!jobId) {
    return NextResponse.json({ success: false, error: '缺少 jobId' }, { status: 400 })
  }
  const job = getMarketFocusJob(jobId)
  if (!job) {
    return NextResponse.json({ success: false, error: 'job not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true, job })
}