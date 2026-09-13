import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { migrate, hasSocialPosted, createSocialPost, updateSocialPost, deleteSocialPostByEdition } from '@stock/database'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { publishThreadsReply, THREADS_REPLY_MAX_CHARS } from '@/lib/threads-reply'

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
  let body: { mediaId?: string; replyText?: string; force?: boolean } = {}
  try {
    body = await req.json()
  } catch {}
  const mediaId = (body.mediaId ?? '').trim()
  const replyText = (body.replyText ?? '').trim()

  if (!mediaId) return NextResponse.json({ error: '缺少貼文 media id（讀取貼文後才能發布）' }, { status: 400 })
  if (!replyText) return NextResponse.json({ error: '回覆內容不可為空' }, { status: 400 })
  if (Array.from(replyText).length > THREADS_REPLY_MAX_CHARS) {
    return NextResponse.json({ error: `回覆內容超過 ${THREADS_REPLY_MAX_CHARS} 字` }, { status: 400 })
  }

  const editionKey = `${REPLY_PREFIX}${mediaId}`
  if (await hasSocialPosted('threads', editionKey)) {
    if (!body.force) {
      return NextResponse.json({ error: '這則貼文已經回覆過（去重擋下）。若要重發請勾選強制。' }, { status: 409 })
    }
    await deleteSocialPostByEdition('threads', editionKey)
  }

  try {
    const { replyMediaId } = await publishThreadsReply(replyText, mediaId)
    const row = await createSocialPost({ platform: 'threads', editionKey, content: replyText, imageUrl: null })
    await updateSocialPost(row.id, {
      status: 'published',
      external_id: replyMediaId,
      error: null,
      published_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    })
    return NextResponse.json({
      success: true,
      externalId: replyMediaId,
      editionKey,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? '回覆發布失敗' }, { status: 500 })
  }
}