import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { getArenaAgentById, setArenaAgentStatus } from '@stock/database'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string; action: string }>
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id, action } = await params
  const agentId = Number(id)
  if (!Number.isInteger(agentId) || agentId <= 0) return NextResponse.json({ error: '無效的 agent id' }, { status: 400 })
  if (action !== 'pause' && action !== 'resume') {
    return NextResponse.json({ error: '不支援的操作' }, { status: 400 })
  }

  const user = await getCurrentUserFromReq(req)
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const agent = await getArenaAgentById(agentId)
  if (!agent) return NextResponse.json({ error: '找不到該 agent' }, { status: 404 })
  const isAdmin = await isAdminUser(user)
  if (user.id !== agent.owner_user_id && !isAdmin) return NextResponse.json({ error: '無權限' }, { status: 403 })

  if (action === 'pause') {
    if (agent.status !== 'active') return NextResponse.json({ error: '只有 active 狀態可暫停' }, { status: 409 })
    await setArenaAgentStatus(agentId, 'paused', '使用者暫停')
    return NextResponse.json({ message: '已暫停' })
  }
  if (agent.status !== 'paused') return NextResponse.json({ error: '只有 paused 狀態可復活' }, { status: 409 })
  await setArenaAgentStatus(agentId, 'active')
  return NextResponse.json({ message: '已復活' })
}