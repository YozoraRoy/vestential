// #27：含稅費淨損益純函式（client-safe：零 Node/DB 依賴，供試算頁前端純算）。
// `lib/portfolio.ts` re-export 此模組（單一真相來源）；server 端（API）可走任一邊。
// 費率（通用值，試算性質，不做券商對帳用途）：
// - 手續費率 0.1425% × discount（預設 0.6 即 6 折 0.0855%），買賣各收一次，
//   不足 NT$20 以 NT$20 計（各家券商最低門檻不同，此處採通用值）。
// - 證交稅（賣出時）：台股個股 0.3%、ETF 0.1%、美股 0。
// ETF 判定啟發式：台股代號（去 `.TW`/`.TWO` 後綴、大寫）以 `00` 開頭視為 ETF
// （如 0050/00687B；00687B 去後綴為 00687B 亦命中）。可能誤判，UI 須註明規則。

export type NetMarket = 'tw' | 'us'

export const FEE_RATE = 0.001425
export const MIN_FEE = 20
export const TAX_RATE_TW = 0.003
export const TAX_RATE_ETF = 0.001
export const DEFAULT_FEE_DISCOUNT = 0.6

/** 台股代號 00 開頭啟發式判定 ETF（去 `.TW`/`.TWO` 後綴後判斷）。 */
export function isEtfSymbol(symbol: string): boolean {
  const id = (symbol ?? '').trim().toUpperCase().replace(/\.(TW|TWO)$/i, '')
  return /^00\d/.test(id)
}

export interface NetPnLInput {
  market: NetMarket
  /** 台股代號（供 ETF 稅率判定；缺省視為個股稅率）。 */
  symbol?: string
  shares: number
  cost: number
  currentPrice: number
  /** 手續費折讓（0~1），缺省／非法值用 DEFAULT_FEE_DISCOUNT。 */
  discount?: number
}

export interface NetPnLResult {
  buyFee: number
  sellFee: number
  tax: number
  taxRate: number
  isEtf: boolean
  discount: number
  netPnl: number
  netPnlPct: number
}

/** 含稅費淨損益：淨＝裸（市值−成本）−買入手續費−賣出手續費−證交稅。美股稅費皆 0，淨＝裸。 */
export function computeNetPnL(input: NetPnLInput): NetPnLResult {
  const shares = Number(input.shares) || 0
  const costBasis = shares * (Number(input.cost) || 0)
  const marketValue = shares * (Number(input.currentPrice) || 0)
  const unrealizedPnl = marketValue - costBasis
  if (input.market === 'us') {
    return {
      buyFee: 0,
      sellFee: 0,
      tax: 0,
      taxRate: 0,
      isEtf: false,
      discount: 0,
      netPnl: unrealizedPnl,
      netPnlPct: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0,
    }
  }
  const rawDiscount = Number(input.discount)
  const discount =
    Number.isFinite(rawDiscount) && rawDiscount >= 0 && rawDiscount <= 1
      ? rawDiscount
      : DEFAULT_FEE_DISCOUNT
  const isEtf = isEtfSymbol(input.symbol ?? '')
  const taxRate = isEtf ? TAX_RATE_ETF : TAX_RATE_TW
  const buyFee = Math.max(Math.round(costBasis * FEE_RATE * discount), MIN_FEE)
  const sellFee = Math.max(Math.round(marketValue * FEE_RATE * discount), MIN_FEE)
  const tax = Math.round(marketValue * taxRate)
  const netPnl = unrealizedPnl - buyFee - sellFee - tax
  return {
    buyFee,
    sellFee,
    tax,
    taxRate,
    isEtf,
    discount,
    netPnl,
    netPnlPct: costBasis > 0 ? (netPnl / costBasis) * 100 : 0,
  }
}
