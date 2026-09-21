import { NextRequest, NextResponse } from 'next/server'
import { deleteTradeJournalEntry, getTradeJournalEntryById, updateTradeJournalEntry } from '@stock/database'
import { getCurrentUserFromReq } from '../../../../lib/auth'
import { validateJournalInput } from '../../../../lib/journal'

async function requireUser(req: NextRequest) {
  const user = await getCurrentUserFromReq(req)
  if (!user) return null
  return user
}

function parseId(id: string): number | null {
  const n = parseInt(id, 10)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * PUT /api/journal/[id] — 更新一筆交易日誌（需登入＋本人；否則 401/404）。
 * 送 full body，沿用 validateJournalInput 全欄位驗證（具名錯誤）。
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req)
    if (!user) {
      return NextResponse.json({ error: 'login required' }, { status: 401 })
    }
    const { id } = await params
    const entryId = parseId(id)
    if (!entryId) {
      return NextResponse.json({ error: 'invalid journal id' }, { status: 400 })
    }
    const existing = await getTradeJournalEntryById(entryId, user.id)
    if (!existing) {
      return NextResponse.json({ error: '找不到該筆日誌' }, { status: 404 })
    }
    const body = await req.json().catch(() => null)
    const parsed = validateJournalInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, missing: parsed.missing }, { status: 400 })
    }
    const ok = await updateTradeJournalEntry(entryId, user.id, {
      tradeDate: parsed.data.tradeDate,
      symbol: parsed.data.symbol,
      direction: parsed.data.direction,
      entryPrice: parsed.data.entryPrice,
      exitPrice: parsed.data.exitPrice,
      shares: parsed.data.shares,
      reason: parsed.data.reason,
      stopLossObeyed: parsed.data.stopLossObeyed,
    })
    if (!ok) {
      return NextResponse.json({ error: '日誌更新失敗' }, { status: 500 })
    }
    return NextResponse.json({ success: true, id: entryId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/** DELETE /api/journal/[id] — 刪除一筆交易日誌（需登入＋本人；否則 401/404）。 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req)
    if (!user) {
      return NextResponse.json({ error: 'login required' }, { status: 401 })
    }
    const { id } = await params
    const entryId = parseId(id)
    if (!entryId) {
      return NextResponse.json({ error: 'invalid journal id' }, { status: 400 })
    }
    const deleted = await deleteTradeJournalEntry(entryId, user.id)
    if (!deleted) {
      return NextResponse.json({ error: '找不到該筆日誌' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
