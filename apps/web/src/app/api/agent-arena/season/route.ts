import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { saveArenaSeason, updateArenaSeasonStatus } from '@stock/database'

export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set(['registration', 'live', 'closed'])

async function requireAdmin(req: NextRequest) {
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return { error: '僅管理員可操作賽季', status: 403 }
  }
  return null
}

// 建立新賽季（admin）
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: '請輸入賽季名稱' }, { status: 400 })
  if (body?.status !== undefined && !VALID_STATUS.has(body.status)) {
    return NextResponse.json({ error: '狀態必須為 registration / live / closed' }, { status: 400 })
  }

  const id = await saveArenaSeason({
    name,
    status: body.status,
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    registrationStart: body.registrationStart ?? null,
    registrationEnd: body.registrationEnd ?? null,
  })
  if (id <= 0) return NextResponse.json({ error: '建立賽季失敗' }, { status: 500 })

  return NextResponse.json({ id, message: '賽季已建立' }, { status: 201 })
}

// 更新賽季狀態（admin，例如 registration → live → closed）
export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  const status = body?.status
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: '請提供賽季 id' }, { status: 400 })
  if (!VALID_STATUS.has(status)) {
    return NextResponse.json({ error: '狀態必須為 registration / live / closed' }, { status: 400 })
  }

  await updateArenaSeasonStatus(id, status)
  return NextResponse.json({ id, status, message: '賽季狀態已更新' })
}