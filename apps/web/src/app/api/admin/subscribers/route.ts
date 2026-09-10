import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import {
  listMarketFocusSubscribers,
  countMarketFocusSubscribers,
  setMarketFocusSubscriberStatus,
  deleteMarketFocusSubscriber,
  migrate,
} from '@stock/database'
import type { MarketFocusSubscriberRow } from '@stock/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function withStats() {
  const [rows, stats] = await Promise.all([listMarketFocusSubscribers(), countMarketFocusSubscribers()])
  return { subscribers: rows as MarketFocusSubscriberRow[], stats }
}

export async function GET(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  try {
    return NextResponse.json({ success: true, ...(await withStats()) })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? '讀取訂閱名單失敗' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  let body: { action?: string; id?: number } = {}
  try {
    body = await req.json()
  } catch {}
  const id = Number(body.id)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ success: false, error: '缺少有效的 id' }, { status: 400 })
  }
  try {
    if (body.action === 'restore') {
      await setMarketFocusSubscriberStatus(id, 'active')
    } else if (body.action === 'delete') {
      await deleteMarketFocusSubscriber(id)
    } else if (body.action === 'cancel') {
      await setMarketFocusSubscriberStatus(id, 'unsubscribed')
    } else {
      return NextResponse.json({ success: false, error: '未知 action' }, { status: 400 })
    }
    return NextResponse.json({ success: true, ...(await withStats()) })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? '操作失敗' }, { status: 500 })
  }
}