import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { migrate, getMarketFocusMeta } from '@stock/database'
import { refreshMarketFocus } from '@/lib/market-focus'
import { sendMarketFocusSummary, sendMarketFocusAlert, isSummaryFallback } from '@/lib/email'
import { authorizeSync } from '@/lib/sync-auth'
import { triggerSocialPublish } from '@/lib/social-trigger'

export async function POST(req: Request) {
  if (!authorizeSync(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await migrate()
    const items = await refreshMarketFocus()
    revalidateTag('market-focus')
    // 背景執行 Email 通知與社群小編發布，不阻塞 HTTP 回應，徹底避免 Azure 240s 網關逾時 (504)
    void (async () => {
      try {
        const meta = await getMarketFocusMeta()
        if (meta?.summary && isSummaryFallback(meta.summary)) {
          await sendMarketFocusAlert('LLM 每日總覽回退', '主模型與備援皆失敗,每日總覽以新聞標題拼接呈現。')
        } else {
          await sendMarketFocusSummary()
        }
      } catch (e: any) {
        console.error('[API/market-focus/refresh] Background email dispatch error:', e)
      }

      try {
        await triggerSocialPublish()
      } catch (e: any) {
        console.error('[API/market-focus/refresh] Background social publish error:', e)
      }
    })()

    return NextResponse.json({
      success: true,
      count: items.length,
      timestamp: new Date().toISOString(),
      background: 'dispatched',
    })
  } catch (error: any) {
    console.error('[API/market-focus/refresh] Failed:', error)
    await sendMarketFocusAlert('refresh 失敗', error?.message || '未知錯誤')
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to refresh market focus' },
      { status: 500 },
    )
  }
}