import { NextRequest, NextResponse } from 'next/server'
import { findOrCreateUser, dbExecute } from '@stock/database'
import { applySessionCookie, signSession } from '../../../../lib/auth'

/** Dev-only login so local testing works without OAuth providers configured. */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'not available in production' }, { status: 403 })
  }
  try {
    const body = (await req.json().catch(() => null)) as { name?: string; email?: string } | null
    const user = await findOrCreateUser({
      provider: 'google',
      providerUserId: 'dev-local-user',
      displayName: body?.name || '開發者',
      email: body?.email ?? null,
    })
    if (!user) {
      return NextResponse.json({ success: false, error: 'failed to create dev user' }, { status: 500 })
    }
    if (body?.email) {
      await dbExecute(
        `UPDATE user_identities SET provider_email = @email
         WHERE user_id = @uid AND provider = 'google' AND provider_user_id = 'dev-local-user'`,
        { email: body.email, uid: user.id },
      )
    }
    const token = await signSession(user.id)
    const res = NextResponse.json({ success: true, user: { id: user.id, displayName: user.display_name } })
    applySessionCookie(res, token)
    return res
  } catch (error) {
    console.error('[API/Auth/DevLogin] Failed:', error)
    return NextResponse.json({ success: false, error: 'internal error' }, { status: 500 })
  }
}
