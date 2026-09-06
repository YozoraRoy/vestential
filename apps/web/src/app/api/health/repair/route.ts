import { NextResponse } from 'next/server'
import { runHealthChecks, shouldRepairOddLot } from '@/lib/health'
import { sendHealthAlert } from '@/lib/email'
import { authorizeSync } from '@/lib/sync-auth'

function syncRequest(url: string) {
  return new Request(url, {
    method: 'POST',
    headers: { 'x-sync-token': process.env.SYNC_TOKEN ?? '' },
  })
}

const MARKET_FOCUS_ISSUES = ['mf_empty', 'mf_meta_missing', 'mf_stale', 'mf_null_content']

export async function POST(req: Request) {
  if (!authorizeSync(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const kind = new URL(req.url).searchParams.get('kind') ?? 'repair'
  const before = await runHealthChecks()
  if (before.ok) {
    return NextResponse.json({ success: true, needed: false, repairs: [], issues: [] })
  }

  const repairs: { action: string; done: boolean }[] = []

  if (before.issues.some((i) => MARKET_FOCUS_ISSUES.includes(i.code))) {
    try {
      const refreshRoute = await import('@/app/api/market-focus/refresh/route')
      const res = await refreshRoute.POST(syncRequest('http://localhost/api/market-focus/refresh'))
      repairs.push({ action: 'market-focus refresh', done: res.ok })
      if (!res.ok) console.error('[health/repair] market-focus refresh failed:', await res.text())
    } catch (e: any) {
      repairs.push({ action: 'market-focus refresh', done: false })
      console.error('[health/repair] market-focus refresh failed:', e)
    }
  }

  if (shouldRepairOddLot(before)) {
    try {
      const oddLotRoute = await import('@/app/api/odd-lot/refresh/route')
      const res = await oddLotRoute.POST(syncRequest('http://localhost/api/odd-lot/refresh'))
      repairs.push({ action: 'odd-lot refresh', done: res.ok })
      if (!res.ok) console.error('[health/repair] odd-lot refresh failed:', await res.text())
    } catch (e: any) {
      repairs.push({ action: 'odd-lot refresh', done: false })
      console.error('[health/repair] odd-lot refresh failed:', e)
    }
  }

  const after = await runHealthChecks()
  const needsAttention = after.issues.some((i) => i.severity === 'error')
  const alertEmailSent = needsAttention
    ? await sendHealthAlert({
        kind,
        issues: after.issues,
        repairs,
      })
    : false

  return NextResponse.json(
    {
      success: !needsAttention,
      needed: true,
      ok: !needsAttention,
      repairs,
      issuesBefore: before.issues,
      issuesAfter: after.issues,
      alertEmailSent,
    },
    { status: needsAttention ? 500 : 200 },
  )
}