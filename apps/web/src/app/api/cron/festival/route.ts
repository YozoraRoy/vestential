import { NextResponse } from 'next/server'
import { migrate } from '@stock/database'
import { authorizeSync } from '@/lib/sync-auth'
import { triggerFestivalPublish } from '@/lib/social-festival-trigger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * 節慶排程發布（中秋 MVP）：由 GitHub Actions 每日 00:00 UTC（= 08:00 Asia/Taipei）
 * 呼叫。非節慶日一律回 skipped（不發文、不寫 DB、不打外部 API）。
 *
 * POST body (JSON, 選填):
 *   - dryRun: true → 只生成文案＋賀圖，不發布
 *   - force: true → 忽略去重強制重發
 *   - dateOverride: 'YYYY-MM-DD' → 覆寫判定日期（手動補發／測試用）
 */
export async function POST(req: Request) {
  if (!authorizeSync(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  let body: { dryRun?: boolean; force?: boolean; dateOverride?: string } = {}
  try {
    body = await req.json().catch(() => ({}))
  } catch {}
  try {
    await migrate()
    const outcome = await triggerFestivalPublish({
      dryRun: body.dryRun === true,
      force: body.force === true,
      dateOverride: typeof body.dateOverride === 'string' ? body.dateOverride : undefined,
    })
    return NextResponse.json({ success: true, ...outcome })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? 'festival publish 失敗' },
      { status: 500 },
    )
  }
}
