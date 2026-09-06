import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getUserById, getUserIdentities, type UserRow } from '@stock/database'

export const COOKIE_NAME = 'stock_session'
export const DAILY_ANALYSIS_LIMIT = 3
export const DAILY_RECOGNITION_LIMIT = 10
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

/** 管理者判定：LINE 帳號 Roy（可透過 ADMIN_LINE_USER_IDS 指定 LINE User ID 覆寫）。 */
export async function isAdminUser(user: UserRow): Promise<boolean> {
  const configuredIds = (process.env.ADMIN_LINE_USER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const identities = await getUserIdentities(user.id)
  const lineIdentities = identities.filter(i => i.provider === 'line')
  if (lineIdentities.length === 0) return false
  return lineIdentities.some(i =>
    configuredIds.length > 0
      ? configuredIds.includes(i.provider_user_id)
      : (user.display_name || '').trim().toLowerCase() === 'roy',
  )
}

export function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET || 'dev-only-insecure-secret-change-me'
  return new TextEncoder().encode(secret)
}

export async function signSession(userId: number): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return typeof payload.uid === 'number' ? payload.uid : null
  } catch {
    return null
  }
}

/** Taiwan (Asia/Taipei) date as YYYY-MM-DD — quota resets by calendar day in TW time. */
export function getTaiwanDateStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(date)
}

export function applySessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return res
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}

/** Resolve the session token from the incoming request. */
function getToken(req: NextRequest): string | null {
  return req.cookies.get(COOKIE_NAME)?.value ?? null
}

/** Resolve the session token from the current server context (route handlers). */
async function getTokenFromCookies(): Promise<string | null> {
  const store = await cookies()
  return store.get(COOKIE_NAME)?.value ?? null
}

/** Returns the logged-in user, or null when unauthenticated / session invalid. */
export async function getCurrentUserFromReq(req: NextRequest): Promise<UserRow | null> {
  const token = getToken(req)
  if (!token) return null
  const uid = await verifySession(token)
  if (!uid) return null
  return getUserById(uid)
}

/** Same as getCurrentUserFromReq but reads from next/headers cookies(). */
export async function getCurrentUserFromCookies(): Promise<UserRow | null> {
  const token = await getTokenFromCookies()
  if (!token) return null
  const uid = await verifySession(token)
  if (!uid) return null
  return getUserById(uid)
}
