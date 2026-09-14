import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getLlmUsageReport, migrate } from '@stock/database'
import { isAdminUser, getCurrentUserFromReq } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const fromParam = searchParams.get('from') ?? undefined
  const toParam = searchParams.get('to') ?? undefined

  // from/to 需為 YYYY-MM-DD（台灣時區日期）；格式不合法直接 400。
  if ((fromParam && !DATE_RE.test(fromParam)) || (toParam && !DATE_RE.test(toParam))) {
    return NextResponse.json({ success: false, error: 'from/to 需為 YYYY-MM-DD 格式' }, { status: 400 })
  }

  try {
    const report = await getLlmUsageReport({ from: fromParam, to: toParam })
    return NextResponse.json({ success: true, ...report })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'llm-usage 失敗' }, { status: 500 })
  }
}