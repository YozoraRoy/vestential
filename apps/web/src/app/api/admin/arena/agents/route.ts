import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  getActiveArenaSeason,
  getArenaHoldings,
  getArenaLeaderboard,
  listActiveArenaAgents,
  updateArenaAgentConfig,
  migrate,
} from '@stock/database'
import { isAdminUser, getCurrentUserFromReq } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STRATEGIES: Record<string, { nameZh: string }> = {
  momentum: { nameZh: '動能' },
  mean_reversion: { nameZh: '均值回歸' },
  value: { nameZh: '價值' },
  trend_following: { nameZh: '趨勢跟隨' },
}
const TONE_NAMES: Record<string, string> = {
  aggressive: '激進',
  neutral: '中性',
  conservative: '保守',
}

export async function GET(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  try {
    const season = await getActiveArenaSeason().catch(() => null)
    const agents = await listActiveArenaAgents().catch(() => [] as any[])
    const leaderboard = season
      ? await getArenaLeaderboard(season.id, null).catch(() => [] as any[])
      : []
    const lbById = new Map(leaderboard.map((r: any) => [r.agent_id, r]))
    const seasonId = season?.id ?? null

    const enriched = await Promise.all(
      agents.map(async (a: any) => {
        const lb = lbById.get(a.id)
        const holdings = await getArenaHoldings(a.id).catch(() => [] as any[])
        const strategyParams = (() => {
          try {
            return a.strategy_params ? JSON.parse(a.strategy_params) : null
          } catch {
            return null
          }
        })()
        return {
          id: a.id,
          name: a.name,
          division: a.division,
          strategyId: a.strategy_id,
          strategyNameZh: STRATEGIES[a.strategy_id]?.nameZh ?? a.strategy_id,
          tone: a.tone,
          toneName: TONE_NAMES[a.tone] ?? a.tone,
          personality: a.personality ?? '',
          strategyParams,
          initialCapital: a.initial_capital,
          cash: lb?.cash ?? a.cash,
          equity: lb?.equity ?? a.cash,
          returnPct: lb?.return_pct ?? null,
          rounds: lb?.rounds ?? 0,
          isSystem: a.is_system === 1,
          status: a.status,
          lastRoundDate: a.last_round_date ?? null,
          joinedAt: a.joined_at ?? null,
          holdings: holdings.map((h: any) => ({
            symbol: h.symbol,
            name: h.symbol_name,
            shares: h.shares,
            avgCost: h.avg_cost,
            updatedRoundDate: h.updated_round_date,
          })),
        }
      }),
    )

    return NextResponse.json({ success: true, seasonId, agents: enriched })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'agents 查詢失敗' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON body 解析失敗' }, { status: 400 })
  }
  const id = Number(body.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
  }
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined && typeof body.name === 'string') patch.name = body.name.trim()
  if (body.strategyId !== undefined && typeof body.strategyId === 'string') patch.strategyId = body.strategyId
  if (body.tone !== undefined && typeof body.tone === 'string') patch.tone = body.tone
  if (body.personality !== undefined && typeof body.personality === 'string') patch.personality = body.personality
  if (body.strategyParams !== undefined) patch.strategyParams = body.strategyParams
  try {
    const ok = await updateArenaAgentConfig(id, patch)
    if (!ok) return NextResponse.json({ success: false, error: `agent ${id} 不存在` }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? '更新失敗' }, { status: 500 })
  }
}