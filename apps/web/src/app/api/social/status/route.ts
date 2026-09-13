import { NextResponse } from 'next/server'
import { migrate, listSocialPosts } from '@stock/database'
import { authorizeSync } from '@/lib/sync-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 查詢社群發布紀錄（供 cron / 管理查看）。 */
export async function GET(req: Request) {
  if (!authorizeSync(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await migrate()
    const { searchParams } = new URL(req.url)
    const platform = (searchParams.get('platform') ?? undefined) as 'instagram' | 'threads' | 'facebook' | undefined
    const limit = Math.min(100, Number(searchParams.get('limit')) || 20)
    const rows = await listSocialPosts(platform, limit)
    return NextResponse.json({ success: true, count: rows.length, posts: rows })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 })
  }
}