import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { migrate } from '@stock/database'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { triggerSocialPublish } from '@/lib/social-trigger'
import type { SocialPostPlatform } from '@stock/database'
import type { SocialCaptions } from '@/lib/social'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  let body: {
    dryRun?: boolean
    force?: boolean
    platforms?: string[]
    imageUrl?: string | null
    captions?: SocialCaptions
  } = {}
  try {
    body = await req.json()
  } catch {}
  const platforms = (body.platforms ?? ['instagram', 'threads']).filter(
    (p): p is SocialPostPlatform => p === 'instagram' || p === 'threads',
  )
  try {
    const outcome = await triggerSocialPublish({
      dryRun: !!body.dryRun,
      force: !!body.force,
      platforms,
      imageUrl: body.imageUrl ?? null,
      captions: body.captions ?? undefined,
    })
    return NextResponse.json({ success: true, ...outcome })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'social publish 失敗' }, { status: 500 })
  }
}
