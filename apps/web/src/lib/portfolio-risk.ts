/**
 * Issue #20 組合風險儀表板＋壓力測試 — 純計算函式（零 LLM）。
 *
 * 設計決策（見 issue 回報）：
 * - 台/美股分幣別成組計算（NT$/US$ 不混加；跨幣別對沖本就 out-of-scope）。
 * - 虧損公式：情境虧損金額 = Σ(持倉市值 × 情境跌幅)，虧損％ = 虧損金額 ÷ 該組納入試算市值。
 * - 產業分類優先採用 Yahoo profile sector；取不到時用下方簡版對照表，
 *   仍無則標示「未分類」——只有「單一產業重挫」情境會把未分類標的列為不納入試算，
 *   大盤型情境不需要產業資料故全部納入（市值有效者）。
 * - 所有除法皆有零守衛：空倉/零市值不回傳 NaN。
 */

export type RiskMarket = 'tw' | 'us'

/** 產業不明時的佔位分組名（與情境排除邏輯共用字串）。 */
export const UNCATEGORIZED_SECTOR = '未分類'

/**
 * 簡版產業對照（fallback）：只收錄常見權值/ETF。
 * 來源決策：既有程式只有 Yahoo `getProfile().sector` 可用（packages/market-data），
 * 無本地產業表；故優先 Yahoo，缺失時用此表補常見標的，其餘歸「未分類」。
 * key 為去後綴大寫代號（如 2330、AAPL）。
 */
export const FALLBACK_SECTOR_MAP: Record<string, string> = {
  '2330': '半導體',
  '2317': '電子零組件',
  '2454': '半導體',
  '2303': '半導體',
  '2881': '金融',
  '2882': '金融',
  '2412': '電信',
  '1301': '塑化',
  '2002': '鋼鐵',
  '0050': '台股 ETF',
  '0056': '台股 ETF',
  '00687B': '債券 ETF',
  '00679B': '債券 ETF',
  'AAPL': '科技',
  'MSFT': '科技',
  'NVDA': '半導體',
  'TSLA': '汽車',
  'META': '科技',
  'AMZN': '科技',
  'GOOGL': '科技',
  'GOOG': '科技',
  'AMD': '半導體',
  'TSM': '半導體',
  'VOO': '美股 ETF',
  'QQQ': '美股 ETF',
  'BND': '債券 ETF',
}

export function resolveFallbackSector(symbol: string): string | null {
  const key = (symbol ?? '').trim().toUpperCase().replace(/\.(TW|TWO)$/i, '')
  return FALLBACK_SECTOR_MAP[key] ?? null
}

export interface RiskHoldingInput {
  market: RiskMarket
  symbol: string
  symbolName?: string | null
  /** 持倉市值（shares × current_price）。無效值（<=0/NaN）會被列為不納入試算。 */
  marketValue: number
  /** Yahoo sector 或 fallback 對照結果；null 代表未知。 */
  sector?: string | null
  /** 產業來源：yahoo 優先，fallback 為簡版對照，none 為未知。 */
  sectorSource?: 'yahoo' | 'fallback' | 'none'
}

export interface ExcludedHolding {
  market: RiskMarket
  symbol: string
  symbolName?: string | null
  reason: string
  scenarioId?: string
}

export interface WeightRow {
  market: RiskMarket
  symbol: string
  symbolName?: string | null
  sector: string
  sectorSource: 'yahoo' | 'fallback' | 'none'
  marketValue: number
  /** 佔該幣別組市值百分比（全精度；顯示時格式化）。 */
  weightPct: number
}

export interface SectorSlice {
  sector: string
  marketValue: number
  weightPct: number
  count: number
}

export interface ConcentrationResult {
  totalMarketValue: number
  includedCount: number
  weights: WeightRow[]
  top1Pct: number
  top3Pct: number
  /** 權重合計（應為 100±0.1；空組為 0）。 */
  weightSumPct: number
  sectors: SectorSlice[]
  sectorWeightSumPct: number
  excluded: ExcludedHolding[]
}

function isValidValue(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/** 同幣別組集中度計算（含 Top-1/Top-3、產業分組）。空組回傳零值，不 NaN。 */
export function computeConcentration(holdings: RiskHoldingInput[]): ConcentrationResult {
  const excluded: ExcludedHolding[] = []
  const valid = holdings.filter((h) => {
    if (!isValidValue(h.marketValue)) {
      excluded.push({
        market: h.market,
        symbol: h.symbol,
        symbolName: h.symbolName,
        reason: 'missing-value',
      })
      return false
    }
    return true
  })

  const total = valid.reduce((s, h) => s + (h.marketValue as number), 0)
  if (valid.length === 0 || !(total > 0)) {
    return {
      totalMarketValue: 0,
      includedCount: 0,
      weights: [],
      top1Pct: 0,
      top3Pct: 0,
      weightSumPct: 0,
      sectors: [],
      sectorWeightSumPct: 0,
      excluded,
    }
  }

  const weights: WeightRow[] = valid
    .map((h) => ({
      market: h.market,
      symbol: h.symbol,
      symbolName: h.symbolName,
      sector: h.sector ?? UNCATEGORIZED_SECTOR,
      sectorSource: h.sectorSource ?? (h.sector ? 'yahoo' : 'none'),
      marketValue: h.marketValue as number,
      weightPct: ((h.marketValue as number) / total) * 100,
    }))
    .sort((a, b) => b.weightPct - a.weightPct)

  const top1Pct = weights.length >= 1 ? weights[0].weightPct : 0
  const top3Pct = weights.slice(0, 3).reduce((s, w) => s + w.weightPct, 0)

  const sectorMap = new Map<string, SectorSlice>()
  for (const w of weights) {
    const cur = sectorMap.get(w.sector) ?? { sector: w.sector, marketValue: 0, weightPct: 0, count: 0 }
    cur.marketValue += w.marketValue
    cur.count += 1
    sectorMap.set(w.sector, cur)
  }
  const sectors = [...sectorMap.values()]
    .map((s) => ({ ...s, weightPct: (s.marketValue / total) * 100 }))
    .sort((a, b) => b.weightPct - a.weightPct)

  return {
    totalMarketValue: total,
    includedCount: valid.length,
    weights,
    top1Pct,
    top3Pct,
    weightSumPct: weights.reduce((s, w) => s + w.weightPct, 0),
    sectors,
    sectorWeightSumPct: sectors.reduce((s, x) => s + x.weightPct, 0),
    excluded,
  }
}

export interface StressScenarioDef {
  id: 'market-10' | 'market-20' | 'sector-30'
  /** 全組統一跌幅（sector-30 只對目標產業生效，其餘 0）。 */
  dropPct: number
}

export const STRESS_SCENARIOS: StressScenarioDef[] = [
  { id: 'market-10', dropPct: 10 },
  { id: 'market-20', dropPct: 20 },
  { id: 'sector-30', dropPct: 30 },
]

export interface StressHoldingLoss {
  symbol: string
  symbolName?: string | null
  sector: string
  marketValue: number
  /** 該標的適用跌幅（sector-30 非目標產業為 0）。 */
  appliedDropPct: number
  lossAmount: number
}

export interface StressScenarioResult {
  id: StressScenarioDef['id']
  dropPct: number
  /** sector-30 的目標產業（占比最大者）；大盤型為 null。 */
  targetSector: string | null
  lossAmount: number
  /** 虧損％ = 虧損金額 ÷ 納入試算市值（全精度）。 */
  lossPct: number
  includedValue: number
  holdingLosses: StressHoldingLoss[]
  excluded: ExcludedHolding[]
}

/**
 * 三情境試算（持倉 × 情境跌幅純計算，可手算重現）。
 * - market-10/20：全部有效市值標的納入。
 * - sector-30：以占比最大產業為重挫目標（跌 30%），該產業外標的 appliedDropPct=0；
 *   產業未知（未分類）標的標示「不納入試算」，金額不補 0、不計入虧損。
 */
export function computeStress(concentration: ConcentrationResult): StressScenarioResult[] {
  const { weights, sectors } = concentration
  const topSector = sectors.length > 0 ? sectors[0].sector : null
  const topSectorIsKnown = topSector != null && topSector !== UNCATEGORIZED_SECTOR

  return STRESS_SCENARIOS.map((def) => {
    const holdingLosses: StressHoldingLoss[] = []
    const excluded: ExcludedHolding[] = []
    let lossAmount = 0
    let includedValue = 0

    for (const w of weights) {
      if (def.id === 'sector-30') {
        if (w.sector === UNCATEGORIZED_SECTOR) {
          excluded.push({
            market: w.market,
            symbol: w.symbol,
            symbolName: w.symbolName,
            reason: 'missing-sector',
            scenarioId: def.id,
          })
          continue
        }
        const inTarget = topSectorIsKnown && w.sector === topSector
        const applied = inTarget ? def.dropPct : 0
        const loss = (w.marketValue * applied) / 100
        lossAmount += loss
        includedValue += w.marketValue
        holdingLosses.push({
          symbol: w.symbol,
          symbolName: w.symbolName,
          sector: w.sector,
          marketValue: w.marketValue,
          appliedDropPct: applied,
          lossAmount: loss,
        })
      } else {
        const loss = (w.marketValue * def.dropPct) / 100
        lossAmount += loss
        includedValue += w.marketValue
        holdingLosses.push({
          symbol: w.symbol,
          symbolName: w.symbolName,
          sector: w.sector,
          marketValue: w.marketValue,
          appliedDropPct: def.dropPct,
          lossAmount: loss,
        })
      }
    }

    return {
      id: def.id,
      dropPct: def.dropPct,
      targetSector: def.id === 'sector-30' ? (topSectorIsKnown ? topSector : null) : null,
      lossAmount,
      lossPct: includedValue > 0 ? (lossAmount / includedValue) * 100 : 0,
      includedValue,
      holdingLosses,
      excluded,
    }
  })
}

/** AI 風險摘要共用的免責文案（server 與 client 顯示一致）。 */
export const RISK_DISCLAIMER = '本摘要僅為持倉統計的描述性總結，非投資建議。'
