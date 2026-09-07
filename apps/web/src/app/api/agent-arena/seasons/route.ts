import { NextResponse } from 'next/server'
import { listArenaSeasons } from '@stock/database'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const seasons = await listArenaSeasons()
    return NextResponse.json({ seasons }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '取得季列表失敗' }, { status: 500 })
  }
}