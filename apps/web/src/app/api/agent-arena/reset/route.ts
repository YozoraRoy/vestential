import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { listActiveArenaAgents, getArenaAgentById, resetArenaAgentLedger, updateArenaAgentCash } from '@stock/database'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '僅管理員可重設' }, { status: 403 })
  }

  const agents = await listActiveArenaAgents()
  for (const agent of agents) {
    const row = await getArenaAgentById(agent.id)
    if (!row) continue
    await resetArenaAgentLedger(row.id)
    await updateArenaAgentCash(row.id, row.initial_capital)
  }
  return NextResponse.json({ message: `已重設 ${agents.length} 位 agent` })
}