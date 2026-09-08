import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { listAgentSettings, setAgentSetting, getAgentSetting, migrate } from '@stock/database'
import { isAdminUser, getCurrentUserFromReq } from '@/lib/auth'
import { DEFAULT_AGENT_SETTINGS } from '@/lib/agent-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  const url = new URL(req.url)
  const category = url.searchParams.get('category') ?? undefined
  let rows = await listAgentSettings(category).catch(() => [] as any[])
  const present = new Set(rows.map((r) => r.key))
  const merged = Object.entries(DEFAULT_AGENT_SETTINGS).map(([key, meta]) => {
    const existing = present.has(key) ? rows.find((r) => r.key === key) : null
    return {
      key,
      category: meta.category,
      label: meta.label,
      value: existing?.value ?? meta.defaultValue,
      updatedAt: existing?.updated_at ?? null,
    }
  })
  // 加上 DB 中使用者自行新增、不在預設清單內的設定
  for (const row of rows) {
    if (!DEFAULT_AGENT_SETTINGS[row.key]) {
      merged.push({
        key: row.key,
        category: row.category ?? 'custom',
        label: row.label ?? row.key,
        value: row.value ?? '',
        updatedAt: row.updated_at ?? null,
      })
    }
  }
  return NextResponse.json({ success: true, settings: merged })
}

export async function POST(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }
  let body: { key?: string; value?: string; category?: string; label?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }
  const key = body.key?.trim()
  if (!key) return NextResponse.json({ success: false, error: 'key required' }, { status: 400 })
  const value = body.value ?? ''
  const meta = DEFAULT_AGENT_SETTINGS[key]
  await setAgentSetting({
    key,
    value,
    category: body.category || meta?.category || 'custom',
    label: body.label || meta?.label || key,
  })
  const saved = await getAgentSetting(key)
  return NextResponse.json({ success: true, key, value: saved })
}
