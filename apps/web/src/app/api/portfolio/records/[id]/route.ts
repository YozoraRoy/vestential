import { NextResponse } from 'next/server'
import { getCurrentUserFromCookies } from '../../../../../lib/auth'
import { computePnL, validatePortfolioInput } from '../../../../../lib/portfolio'
import { updatePortfolioRecord } from '@stock/database'

function parseId(raw: string | null): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * PUT /api/portfolio/records/[id] — 更新一筆持股紀錄（限登入本人，Issue #26）。
 * 授權風格沿用 #25 DELETE（records route）＋ journal [id] PUT：
 * 未登入 401；id 不存在或非本人皆回 404（不洩漏存在性）。
 * Body 全欄位驗證沿用 validatePortfolioInput；strategy/strategyId 為選填（沿用 analyze 存法：framework id）。
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return NextResponse.json({ error: 'login required' }, { status: 401 })
    }
    const { id: rawId } = await params
    const id = parseId(rawId)
    if (!id) {
      return NextResponse.json({ error: 'invalid record id' }, { status: 400 })
    }
    const body = await req.json().catch(() => null)
    const parsed = validatePortfolioInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const strategyRaw = body?.strategy ?? body?.strategyId
    const strategy = typeof strategyRaw === 'string' && strategyRaw.trim() ? strategyRaw.trim().slice(0, 50) : null
    const pnl = computePnL(parsed.data)
    const ok = await updatePortfolioRecord(id, user.id, {
      market: parsed.data.market,
      symbol: parsed.data.symbol,
      symbolName: parsed.data.symbolName ?? null,
      shares: parsed.data.shares,
      cost: parsed.data.cost,
      currentPrice: parsed.data.currentPrice,
      dividend: parsed.data.dividend,
      costBasis: pnl.costBasis,
      marketValue: pnl.marketValue,
      unrealizedPnl: pnl.unrealizedPnl,
      unrealizedPnlPct: pnl.unrealizedPnlPct,
      totalReturn: pnl.totalReturn,
      totalReturnPct: pnl.totalReturnPct,
      yieldOnCost: pnl.yieldOnCost,
      strategy,
    })
    if (!ok) {
      return NextResponse.json({ error: 'record not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, id })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'record update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
