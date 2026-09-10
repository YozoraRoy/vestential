import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { migrate, getMarketFocus, getMarketFocusMeta } from '@stock/database'
import { getCurrentUserFromReq, isAdminUser } from '@/lib/auth'
import { renderSocialCard } from '@/lib/social-canvas'
import { generateSocialBackgroundImage, BACKGROUND_PRESETS } from '@/lib/social-ai-image'
import { generateMemeConcept } from '@/lib/social'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  await migrate()
  const user = await getCurrentUserFromReq(req)
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ error: '未登入或無管理員權限' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : undefined
    const preset = typeof body?.preset === 'string' ? body.preset.trim() : 'auto'
    let meme = body?.meme ?? null

    const meta = await getMarketFocusMeta()
    if (!meta?.summary) {
      return NextResponse.json({ success: false, error: '目前無市場焦點內容' }, { status: 400 })
    }
    const items = await getMarketFocus(6, 2)

    if (!meme) {
      meme = await generateMemeConcept(meta, items).catch(() => null)
    }

    // 生成底圖（若 preset === 'none' 則為 null）
    const bgImage = await generateSocialBackgroundImage(
      {
        headline: items[0]?.title,
        summary: meta.summary,
        items,
      },
      { prompt, preset },
    )

    // 重新渲染圖卡
    const [classicBuf, memeBuf] = await Promise.all([
      renderSocialCard({ meta, items }, { style: 'classic', backgroundImage: bgImage }),
      renderSocialCard({ meta, items }, { style: 'meme', meme, backgroundImage: bgImage }),
    ])

    const toDataUrl = (buf: Buffer) => `data:image/jpeg;base64,${buf.toString('base64')}`

    return NextResponse.json({
      success: true,
      cards: {
        classic: toDataUrl(classicBuf),
        meme: toDataUrl(memeBuf),
      },
      preset,
      prompt,
      hasBgImage: !!bgImage,
    })
  } catch (e: any) {
    console.error('[API/social/generate-image] 錯誤:', e)
    return NextResponse.json({ success: false, error: e?.message ?? '生圖失敗' }, { status: 500 })
  }
}
