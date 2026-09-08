import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getUserUsageReport, migrate } from '@stock/database'
import { isAdminUser, getCurrentUserFromReq } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  try {
    const rows = await getUserUsageReport()
    return NextResponse.json({ success: true, users: rows })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'usage 失敗' }, { status: 500 })
  }
}
