import { yahooFinanceProvider } from '@stock/market-data'
import { getPortfolioRecords, getPortfolioRecordsByGuest } from '@stock/database'
import {
  computeConcentration,
  computeStress,
  resolveFallbackSector,
  UNCATEGORIZED_SECTOR,
  type RiskHoldingInput,
  type RiskMarket,
  type StressScenarioResult,
  type WeightRow,
  type SectorSlice,
} from './portfolio-risk'

function toFinite(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? v : null
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sector lookup timeout')), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

async function fetchYahooSector(symbol: string, market: RiskMarket): Promise<string | null> {
  const upper = symbol.trim().toUpperCase()
  const candidates = market === 'tw'
    ? (/\.(TW|TWO)$/i.test(upper) ? [upper] : [`${upper}.TW`, `${upper}.TWO`])
    : [upper]
  for (const c of candidates) {
    try {
      const profile = await withTimeout(
        yahooFinanceProvider.getProfile(c, market === 'tw' ? 'TW' : 'US'),
        4000,
      )
      const sector = (profile?.sector ?? '').trim()
      if (sector) return sector
      const industry = (profile?.industry ?? '').trim()
      if (industry) return industry
    } catch {
      // 試下一個候選；全滅則回 null
    }
  }
  return null
}

export interface RiskGroupSnapshot {
  market: RiskMarket
  totalMarketValue: number
  includedCount: number
  weights: WeightRow[]
  top1Pct: number
  top3Pct: number
  weightSumPct: number
  sectors: SectorSlice[]
  sectorWeightSumPct: number
  scenarios: StressScenarioResult[]
}

export interface RiskSnapshot {
  asOf: string
  holdingsCount: number
  sectorSource: 'yahoo' | 'fallback' | 'mixed' | 'none'
  groups: RiskGroupSnapshot[]
}

/**
 * 組合風險快照（records → 最新去重 → 產業解析 → 集中度＋壓力試算）。
 * 純計算，零 LLM；供 GET /api/portfolio/risk 與 POST /risk/summary 共用。
 */
export async function loadRiskSnapshot(
  fetcher: (limit: number) => Promise<Array<{
    market: string
    symbol: string
    symbol_name?: string | null
    shares?: unknown
    current_price?: unknown
  }>>,
): Promise<RiskSnapshot> {
  const records = await fetcher(100)

  const latest = new Map<string, (typeof records)[number]>()
  for (const r of records) {
    const m = r.market === 'us' ? 'us' : 'tw'
    const key = `${m}:${String(r.symbol ?? '').trim().toUpperCase()}`
    if (!latest.has(key)) latest.set(key, r)
  }

  const base = [...latest.values()].map((r) => {
    const market: RiskMarket = r.market === 'us' ? 'us' : 'tw'
    const symbol = String(r.symbol ?? '').trim().toUpperCase()
    const shares = toFinite(r.shares)
    const price = toFinite(r.current_price)
    const marketValue = shares != null && price != null ? shares * price : NaN
    return { market, symbol, symbolName: r.symbol_name ?? null, marketValue }
  }).filter((h) => h.symbol)

  const holdings: RiskHoldingInput[] = await Promise.all(
    base.map(async (h) => {
      if (!Number.isFinite(h.marketValue) || h.marketValue <= 0) {
        return { ...h, sector: null, sectorSource: 'none' as const }
      }
      const yahoo = await fetchYahooSector(h.symbol, h.market)
      if (yahoo) return { ...h, sector: yahoo, sectorSource: 'yahoo' as const }
      const fb = resolveFallbackSector(h.symbol)
      if (fb) return { ...h, sector: fb, sectorSource: 'fallback' as const }
      return { ...h, sector: null, sectorSource: 'none' as const }
    }),
  )

  const groups: RiskGroupSnapshot[] = (['tw', 'us'] as RiskMarket[]).map((market) => {
    const concentration = computeConcentration(holdings.filter((h) => h.market === market))
    return {
      market,
      totalMarketValue: concentration.totalMarketValue,
      includedCount: concentration.includedCount,
      weights: concentration.weights,
      top1Pct: concentration.top1Pct,
      top3Pct: concentration.top3Pct,
      weightSumPct: concentration.weightSumPct,
      sectors: concentration.sectors,
      sectorWeightSumPct: concentration.sectorWeightSumPct,
      scenarios: computeStress(concentration),
    }
  })

  const sectorSources = new Set(holdings.map((h) => h.sectorSource))
  const sectorSource: RiskSnapshot['sectorSource'] = sectorSources.size > 1
    ? 'mixed'
    : ([...sectorSources][0] as RiskSnapshot['sectorSource'] | undefined) ?? 'none'

  return {
    asOf: new Date().toISOString(),
    holdingsCount: groups.reduce((s, g) => s + g.includedCount, 0),
    sectorSource,
    groups,
  }
}

export { UNCATEGORIZED_SECTOR }
