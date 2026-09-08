import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { previewMarketFocus, refreshMarketFocus } from '@/lib/market-focus'
import { triggerSocialPublish } from '@/lib/social-trigger'
import { sendMarketFocusAlert, sendMarketFocusSummary, isSummaryFallback } from '@/lib/email'
import { getMarketFocusMeta, migrate } from '@stock/database'
import { revalidateTag } from 'next/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  let body: { mode?: string; alsoSocial?: boolean } = {}
  try {
    body = await req.json()
  } catch {}
  const mode = body.mode === 'publish' ? 'publish' : 'dry'
  try {
    if (mode === 'dry') {
      const { items, summary } = await previewMarketFocus()
      return NextResponse.json({
        success: true,
        mode: 'dry',
        count: items.length,
        summary,
        items: items.map((it) => ({
          title: it.title,
          source: it.source,
          url: it.url,
          reason: it.reason,
          summary: it.summary,
        })),
      })
    }

    // publish
    const items = await refreshMarketFocus()
    revalidateTag('market-focus')
    const meta = await getMarketFocusMeta()
    if (meta?.summary && isSummaryFallback(meta.summary)) {
      await sendMarketFocusAlert('LLM 每日總覽回退', '主模型與備援皆失敗,每日總覽以新聞標題拼接呈現。')
    } else {
      await sendMarketFocusSummary()
    }
    let social = null
    if (body.alsoSocial) {
      social = await triggerSocialPublish().catch((e) => ({ triggered: false, error: e.message }))
    }
    return NextResponse.json({
      success: true,
      mode: 'publish',
      count: items.length,
      timestamp: new Date().toISOString(),
      social,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'market-focus 失敗' }, { status: 500 })
  }
}
