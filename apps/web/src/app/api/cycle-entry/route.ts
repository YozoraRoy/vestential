import { NextResponse } from 'next/server'
import { getLatestCycleEntryMeta, getCycleEntrySignalsByEdition } from '@stock/database'
import { resolveStockName } from '@stock/cycle-entry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/** 公開：回傳最新版次的週期進場標的清單與當日總覽。未產出時 404/空清單。 */
export async function GET() {
  try {
    const meta = await getLatestCycleEntryMeta()
    if (!meta) {
      return NextResponse.json(
        { success: true, editionDate: null, signalCount: 0, signals: [], summary: null },
        { status: 200 },
      )
    }
    const signals = await getCycleEntrySignalsByEdition(meta.editionDate)
    const resolvedSignals = signals.map((s) => ({
      ...s,
      name: resolveStockName(s.symbol, s.name),
    }))
    return NextResponse.json({
      success: true,
      editionDate: meta.editionDate,
      generatedAt: meta.generatedAt,
      signalCount: meta.signalCount,
      summary: meta.summary,
      signals: resolvedSignals,
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? 'Failed to load cycle entry edition' },
      { status: 500 },
    )
  }
}