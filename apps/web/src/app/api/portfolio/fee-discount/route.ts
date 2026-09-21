import { NextResponse } from 'next/server'
import { getAgentSetting } from '@stock/database'
import { DEFAULT_FEE_DISCOUNT } from '@/lib/portfolio-net'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * #27：公開試算頁手續費折讓（免登入；試算性質）。
 * 後台 `portfolio.fee_discount` 可調（預設 0.6），前端試算頁／紀錄詳情即時生效。
 */
export async function GET() {
  let discount = DEFAULT_FEE_DISCOUNT
  try {
    const raw = await getAgentSetting('portfolio.fee_discount').catch(() => null)
    const n = raw == null || raw === '' ? NaN : Number(raw)
    if (Number.isFinite(n) && n >= 0 && n <= 1) discount = n
  } catch {
    // DB 失敗兜底預設值，不炸版
  }
  return NextResponse.json({ discount, default: DEFAULT_FEE_DISCOUNT })
}
