import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  getArenaDecisionLogs,
  getArenaRoundDecisionLogs,
  getArenaTradesAllByRound,
  getArenaTradesByRound,
  migrate,
} from '@stock/database'
import { isAdminUser, getCurrentUserFromReq } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PHASE_NAMES: Record<string, string> = {
  premarket: '盤前',
  slot0: '盤中 09:30',
  slot1: '盤中 10:30',
  slot2: '盤中 11:30',
  slot3: '盤中 12:30/13:25',
  close: '收盤結算',
}

export async function GET(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  const roundDate = req.nextUrl.searchParams.get('round_date')?.trim() ?? ''
  if (!roundDate) {
    return NextResponse.json({ success: false, error: 'round_date required' }, { status: 400 })
  }
  const agentId = Number(req.nextUrl.searchParams.get('agent_id') || '')
  const agentIdOrNull = Number.isFinite(agentId) && agentId > 0 ? agentId : null
  try {
    // 有 agent_id 時只撈該 agent 的決策＋成交（後台「每 Agent 決策歷程」按需載入用）
    const logs = agentIdOrNull != null
      ? await getArenaDecisionLogs(agentIdOrNull, roundDate).catch(() => [] as any[])
      : await getArenaRoundDecisionLogs(roundDate).catch(() => [] as any[])
    const trades = agentIdOrNull != null
      ? await getArenaTradesByRound(agentIdOrNull, roundDate).catch(() => [] as any[])
      : await getArenaTradesAllByRound(roundDate).catch(() => [] as any[])
    const phaseOptions = [...new Set(logs.map((l: any) => l.phase))]
    const perAgent: Record<number, any[]> = {}
    for (const l of logs as any[]) {
      const agentIdKey = l.agent_id
      if (agentIdOrNull != null && agentIdKey !== agentIdOrNull) continue
      ;(perAgent[agentIdKey] ??= []).push({
        id: l.id,
        phase: l.phase,
        phaseName: PHASE_NAMES[l.phase] ?? l.phase,
        slot: l.slot,
        content: l.content,
        model: l.model,
        fallbackUsed: l.fallback_used === 1,
        createdAt: l.created_at ?? null,
      })
    }
    const tradeList = (trades as any[]).map((t) => ({
      id: t.id,
      agentId: t.agent_id,
      roundDate: t.round_date,
      slot: t.slot,
      action: t.action,
      symbol: t.symbol,
      symbolName: t.symbol_name,
      shares: t.shares,
      price: t.price,
      fee: t.fee,
      tax: t.tax,
      reason: t.reason,
      model: t.model,
      fallbackUsed: t.fallback_used === 1,
      error: t.error,
    }))
    return NextResponse.json({
      success: true,
      roundDate,
      phases: phaseOptions,
      perAgent,
      trades: tradeList,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'decisions 查詢失敗' }, { status: 500 })
  }
}