import { NextResponse } from 'next/server'
import { getTwseDividendsByYear, migrate } from '@stock/database'
import { taipeiTodayStr } from '../../../../lib/twse-calendar'
import { getDividendsCacheInfo } from '../../../../lib/twse-dividends'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Issue #35：除息快取讀取（唯讀，不觸發抓取；抓取由同步鈕／16:00 排程順帶做）。
 * GET /api/portfolio/dividends?symbols=2002,2330&year=2026
 * 回傳 { success, year, today, dividends[{symbol,ex_date,cash_dividend}],
 *         cacheAsOf, isTradingDay, reason }。
 * reason（無檔原因，UI 顯示非空白）：'non-trading-day'（今日非交易日）|
 *   'cache-pending'（今日快取尚未同步）| 'empty-file'（今日 TWSE 無除息公告）| null（正常）。
 */
export async function GET(req: Request) {
  try {
    await migrate()
    const url = new URL(req.url)
    const today = taipeiTodayStr()
    const year = /^\d{4}$/.test(url.searchParams.get('year') ?? '') ? url.searchParams.get('year')! : today.slice(0, 4)
    const symbolsParam = (url.searchParams.get('symbols') ?? '').trim().toUpperCase()
    const wanted = new Set(
      symbolsParam.split(',').map((s) => s.trim()).filter(Boolean),
    )

    const all = await getTwseDividendsByYear(year)
    const dividends = (wanted.size > 0 ? all.filter((r) => wanted.has(r.symbol.toUpperCase())) : all).map((r) => ({
      symbol: r.symbol,
      ex_date: r.ex_date,
      cash_dividend: r.cash_dividend,
    }))

    const { cacheAsOf, isTradingDay } = await getDividendsCacheInfo(today)
    let reason: string | null = null
    if (!isTradingDay) reason = 'non-trading-day'
    else if (cacheAsOf !== today) reason = 'cache-pending'
    else if (dividends.length === 0) reason = 'empty-file'

    return NextResponse.json({
      success: true,
      year,
      today,
      dividends,
      cacheAsOf,
      isTradingDay,
      reason,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'dividends read failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
