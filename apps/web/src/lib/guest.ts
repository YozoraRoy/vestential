import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getSecret } from '@/lib/auth'
import { findGuestByClaimCode, reassignGuestRecords, saveClaimCode } from '@stock/database'

export const GUEST_COOKIE = 'vest_guest'
const GUEST_MAX_AGE_SECONDS = 60 * 60 * 24 * 370 // ~1 年

/** 規格化認領碼：去空白、轉大寫，同時去除易混淆字元 (I/L/O/0/1)。 */
export const CLAIM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CLAIM_CODE_BYTES = 15 // 15 bytes ≈ 24 base32 chars ≈ 120 bits 熵

export function generateClaimCode(): string {
  const bytes = randomBytes(CLAIM_CODE_BYTES)
  let out = ''
  for (const b of bytes) out += CLAIM_CODE_ALPHABET[b % CLAIM_CODE_ALPHABET.length]
  return out
}

export function normalizeClaimCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashClaimCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/** 產生新的訪客 workspace id（UUID v4）。 */
export function newGuestUid(): string {
  const bytes = randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 簽名訪客 token（內含 gid）。 */
export async function signGuest(gid: string): Promise<string> {
  return new SignJWT({ gid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('370d')
    .sign(getSecret())
}

export async function verifyGuest(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return typeof payload.gid === 'string' && payload.gid.length > 0 ? payload.gid : null
  } catch {
    return null
  }
}

export async function applyGuestCookie(res: NextResponse, gid: string): Promise<NextResponse> {
  const token = await signGuest(gid)
  res.cookies.set({
    name: GUEST_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GUEST_MAX_AGE_SECONDS,
  })
  return res
}

/** 從 next/headers 讀取並驗證訪客 cookie，無則 null。 */
export async function getCurrentGuestFromCookies(): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(GUEST_COOKIE)?.value ?? null
  if (!raw) return null
  return verifyGuest(raw)
}

/** 建立／兌換認領碼共用流程（route 層呼叫）。 */
export async function createClaimCodeFor(gid: string): Promise<string> {
  const code = generateClaimCode()
  await saveClaimCode(gid, hashClaimCode(code))
  return code
}

export async function redeemClaimCode(code: string, fromGid: string | null): Promise<{ ok: true; gid: string } | { ok: false; error: string }> {
  const normalized = normalizeClaimCode(code)
  if (normalized.length < 4) return { ok: false, error: '認領碼格式錯誤' }
  const gid = await findGuestByClaimCode(hashClaimCode(normalized))
  if (!gid) return { ok: false, error: '認領碼無效或已失效' }
  if (fromGid && fromGid !== gid) {
    await reassignGuestRecords(fromGid, gid)
  }
  return { ok: true, gid }
}