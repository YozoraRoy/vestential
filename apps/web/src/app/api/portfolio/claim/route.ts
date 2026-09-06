import { NextResponse } from 'next/server'
import { applyGuestCookie, createClaimCodeFor, getCurrentGuestFromCookies, newGuestUid, redeemClaimCode } from '@/lib/guest'

// ── 兌換嘗試速率限制：同 IP 15 分鐘內最多 8 次（碼為 120-bit 隨機，暴力破解不現實） ──
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const ATTEMPT_LIMIT = 8
const attemptIp = new Map<string, number[]>()

function tooManyAttempts(ip: string): boolean {
  const now = Date.now()
  const list = (attemptIp.get(ip) ?? []).filter((t) => now - t < ATTEMPT_WINDOW_MS)
  if (list.length >= ATTEMPT_LIMIT) {
    attemptIp.set(ip, list)
    return true
  }
  list.push(now)
  attemptIp.set(ip, list)
  return false
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const action = body?.action
    if (!action) {
      return NextResponse.json({ error: 'action 必填（create | redeem）' }, { status: 400 })
    }

    if (action === 'create') {
      let gid = await getCurrentGuestFromCookies()
      if (!gid) gid = newGuestUid()
      const code = await createClaimCodeFor(gid)
      const res = NextResponse.json({ success: true, code })
      await applyGuestCookie(res, gid)
      return res
    }

    if (action === 'redeem') {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      if (tooManyAttempts(ip)) {
        return NextResponse.json({ error: '嘗試次數過多，請 15 分鐘後再試' }, { status: 429 })
      }
      const fromGid = await getCurrentGuestFromCookies()
      const result = await redeemClaimCode(String(body?.code ?? ''), fromGid)
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 404 })
      }
      const res = NextResponse.json({ success: true, guestUid: result.gid })
      await applyGuestCookie(res, result.gid)
      return res
    }

    return NextResponse.json({ error: '不支援的 action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}