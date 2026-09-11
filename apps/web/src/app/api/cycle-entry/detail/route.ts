import { NextResponse } from 'next/server'
import { getLatestCycleEntryMeta, getCycleEntrySignalsByEdition } from '@stock/database'
import type { CycleEntrySignalRow } from '@stock/database'
import { resolveStockName, runSignalBacktestDetail, evaluateLastBar } from '@stock/cycle-entry'
import { registry } from '@stock/market-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const SUFFIX_RE = /\.(TW|TWO)$/i

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(SUFFIX_RE, '')
}

/** 公開：回傳最新版次中單一標的的專屬詳情（近 1 年 OHLCV、逐筆擬合回測交易、今日規則符合狀態）。 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const rawSymbol = url.searchParams.get('symbol') ?? ''
    const target = normalizeSymbol(rawSymbol)
    if (!target) {
      return NextResponse.json({ success: false, error: 'Missing symbol' }, { status: 400 })
    }

    const meta = await getLatestCycleEntryMeta()
    if (!meta) {
      return NextResponse.json({ success: false, error: 'No cycle entry edition yet' }, { status: 404 })
    }
    const signals = await getCycleEntrySignalsByEdition(meta.editionDate)
    const found = signals.find((s) => normalizeSymbol(s.symbol) === target)
    if (!found) {
      return NextResponse.json(
        { success: false, error: `Symbol ${rawSymbol} not found in latest edition` },
        { status: 404 },
      )
    }

    const provider = registry.get('yahoo-finance')
    const end = new Date()
    const start = new Date(end)
    start.setFullYear(start.getFullYear() - 1)
    const history = await provider.getHistory(
      found.symbol,
      'TW',
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
    )

    const detail = runSignalBacktestDetail(history)
    const lastEval = evaluateLastBar(history)

    const signal: CycleEntrySignalRow & { name: string } = {
      ...found,
      name: resolveStockName(found.symbol, found.name),
    }

    return NextResponse.json({
      success: true,
      editionDate: meta.editionDate,
      signal,
      stats: detail.stats,
      trades: detail.trades,
      history,
      lastEval,
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? 'Failed to load cycle entry detail' },
      { status: 500 },
    )
  }
}