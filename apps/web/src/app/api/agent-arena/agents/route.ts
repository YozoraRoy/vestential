import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUserFromReq } from '@/lib/auth'
import { createArenaAgent, countArenaAgentsByOwner, ARENA_MAX_AGENTS_PER_USER, getActiveArenaSeason } from '@stock/database'
import { INVESTMENT_FRAMEWORKS } from '@stock/ai-engine'

export const dynamic = 'force-dynamic'

const VALID_TONES = new Set(['aggressive', 'neutral', 'conservative'])
const VALID_DIVISIONS = new Set(['season', 'open'])
const VALID_STRATEGIES = new Set(INVESTMENT_FRAMEWORKS.map((f) => f.id))

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromReq(req)
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const season = await getActiveArenaSeason()
  if (!season) return NextResponse.json({ error: '目前沒有進行中的賽季' }, { status: 404 })
  if (season.status !== 'registration' && season.status !== 'live') {
    return NextResponse.json({ error: '目前賽季不接受加入' }, { status: 409 })
  }

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const division = body?.division
  const strategyId = body?.strategyId
  const tone = body?.tone

  if (name.length < 1 || name.length > 30) return NextResponse.json({ error: 'Agent 名稱需為 1~30 字元' }, { status: 400 })
  if (!VALID_DIVISIONS.has(division)) return NextResponse.json({ error: '組別必須為 season 或 open' }, { status: 400 })
  if (!VALID_STRATEGIES.has(strategyId)) return NextResponse.json({ error: '無效的策略' }, { status: 400 })
  if (!VALID_TONES.has(tone)) return NextResponse.json({ error: '無效的風險偏好' }, { status: 400 })

  const existing = await countArenaAgentsByOwner(user.id)
  if (existing >= ARENA_MAX_AGENTS_PER_USER) {
    return NextResponse.json({ error: `每位使用者最多可建立 ${ARENA_MAX_AGENTS_PER_USER} 位 agent` }, { status: 409 })
  }

  const personality = typeof body?.personality === 'string' && body.personality.trim() ? body.personality.trim().slice(0, 40) : null
  const strategyParams = body?.strategyParams ? body.strategyParams : undefined

  const id = await createArenaAgent(user.id, { name, division, strategyId, tone, personality, strategyParams })
  if (id <= 0) return NextResponse.json({ error: '建立失敗' }, { status: 500 })

  return NextResponse.json({ id, message: '已建立' }, { status: 201 })
}