import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { migrate, hasSocialPosted } from '@stock/database'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { draftThreadReply, resolveThreadsPost, THREADS_REPLY_MAX_CHARS } from '@/lib/threads-reply'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const REPLY_PREFIX = 'threads-reply:'

export async function POST(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  let body: { url?: string } = {}
  try {
    body = await req.json()
  } catch {}
  const url = (body.url ?? '').trim()
  if (!url) return NextResponse.json({ error: '請貼上 Threads 貼文網址或短代碼' }, { status: 400 })

  try {
    const post = await resolveThreadsPost(url)
    const alreadyReplied = post.mediaId ? await hasSocialPosted('threads', `${REPLY_PREFIX}${post.mediaId}`) : false
    let draft = ''
    let draftError: string | undefined
    try {
      draft = await draftThreadReply(post)
    } catch (e: any) {
      draftError = e?.message || '擬稿失敗'
    }
    return NextResponse.json({
      success: true,
      post: {
        shortcode: post.shortcode,
        mediaId: post.mediaId,
        author: post.author,
        text: post.text,
        permalink: post.permalink,
      },
      alreadyReplied,
      maxChars: THREADS_REPLY_MAX_CHARS,
      draft,
      draftError,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? '讀取貼文失敗' }, { status: 500 })
  }
}