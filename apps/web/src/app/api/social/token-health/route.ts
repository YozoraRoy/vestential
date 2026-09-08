import { NextResponse } from 'next/server'
import { migrate } from '@stock/database'
import { authorizeSync } from '@/lib/sync-auth'
import { sendMarketFocusAlert } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface TokenCheck {
  platform: 'instagram' | 'threads'
  ok: boolean
  configured: boolean
  user?: string | null
  error?: string
}

/**
 * 每日 cron 呼叫：以 read-only /me 驗證兩平台 token 仍有效。
 * IG/Threads 皆為「長效型 token」（IGAA/THAA，不設到期日；
 * debug_token 也無法解析此格式），故只驗證可存取性。
 * 任一平台無法驗證 → sendMarketFocusAlert 告警。
 */
export async function GET(req: Request) {
  if (!authorizeSync(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await migrate()
    const checks: TokenCheck[] = []

    const igToken = process.env.IG_ACCESS_TOKEN
    if (igToken) {
      checks.push(await checkUser('instagram', 'https://graph.instagram.com/v21.0/me', igToken))
    } else {
      checks.push({ platform: 'instagram', ok: false, configured: false, error: 'IG_ACCESS_TOKEN 未設定' })
    }

    const thToken = process.env.THREADS_ACCESS_TOKEN
    if (thToken) {
      checks.push(await checkUser('threads', 'https://graph.threads.net/v1.0/me', thToken))
    } else {
      checks.push({ platform: 'threads', ok: false, configured: false, error: 'THREADS_ACCESS_TOKEN 未設定' })
    }

    const broken = checks.filter((c) => !c.ok && c.configured)
    if (broken.length > 0) {
      await sendMarketFocusAlert(
        '社群 Token 失效告警',
        broken.map((c) => `${c.platform}: ${c.error}`).join('\n'),
      )
    }

    return NextResponse.json({ success: true, checks })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 })
  }
}

async function checkUser(platform: 'instagram' | 'threads', url: string, token: string): Promise<TokenCheck> {
  try {
    const res = await fetch(`${url}?fields=id,username&access_token=${encodeURIComponent(token)}`, {
      headers: { 'Content-Type': 'application/json' },
    })
    const json = await res.json()
    if (!res.ok || !json?.id) {
      return { platform, ok: false, configured: true, error: json?.error?.message || `HTTP ${res.status}` }
    }
    return { platform, ok: true, configured: true, user: json.username ?? null }
  } catch (e: any) {
    return { platform, ok: false, configured: true, error: e?.message || 'network error' }
  }
}