import {
  type ArenaDecision,
  type ArenaHolding,
  type ArenaStrategyParams,
  ARENA_FEE_MIN,
  ARENA_FEE_RATE,
  ARENA_MAX_POSITION_RATIO,
  ARENA_SELL_TAX_RATE,
  ARENA_SLIPPAGE_DEFAULT,
} from './types.js'

export interface ArenaLedgerEntry {
  action: 'BUY' | 'SELL' | 'HOLD'
  symbol?: string
  symbolName?: string
  shares?: number
  /** 成交價（收盤價 ± slippage），BUY/SELL 時有值。 */
  price?: number
  /** 成交金額（Shares × 成交價，未含費用）。 */
  notional?: number
  fee?: number
  tax?: number
  reason?: string
}

export interface ArenaLedgerResult {
  entries: ArenaLedgerEntry[]
  rejected: ArenaLedgerEntry[]
  cash: number
  holdings: ArenaHolding[]
  equity: number
}

export function computeArenaEquity(
  cash: number,
  holdings: ArenaHolding[],
  closes: Record<string, number>,
): number {
  let total = cash
  for (const h of holdings) {
    const px = closes[h.symbol]
    if (px !== undefined && px > 0) total += h.shares * px
  }
  return Math.round(total * 100) / 100
}

function mergeHolding(
  holdings: ArenaHolding[],
  symbol: string,
  symbolName: string | undefined,
  deltaShares: number,
  execPrice: number,
): void {
  const existing = holdings.find((h) => h.symbol === symbol)
  if (existing) {
    const totalShares = existing.shares + deltaShares
    existing.avgCost =
      totalShares <= 0
        ? 0
        : (existing.avgCost * existing.shares + execPrice * deltaShares) / totalShares
    existing.shares = totalShares
    existing.symbolName = symbolName ?? existing.symbolName
    if (existing.shares <= 0) {
      const idx = holdings.indexOf(existing)
      holdings.splice(idx, 1)
    }
  } else if (deltaShares > 0) {
    holdings.push({ symbol, symbolName, shares: deltaShares, avgCost: execPrice })
  }
}


export interface ApplyArenaDecisionParams {
  cash: number
  holdings: ArenaHolding[]
  /** symbol -> 收盤價或盤中時點價（key 為無後綴代號，例如 2330）。 */
  closes: Record<string, number>
  symbolNames?: Record<string, string>
  decision: ArenaDecision
  slippage?: number
  /** 細部策略參數（可省略；省略即不啟用停損/現金緩衝/下單上限稽核）。 */
  strategyParams?: Partial<ArenaStrategyParams>
}

export function applyArenaDecision(params: ApplyArenaDecisionParams): ArenaLedgerResult {
  const { cash, holdings, closes, symbolNames, decision, slippage } = params
  const sp = params.strategyParams
  const slip = slippage ?? ARENA_SLIPPAGE_DEFAULT
  let cashAfter = cash
  const holdingsAfter = holdings.map((h) => ({ ...h }))
  const entries: ArenaLedgerEntry[] = []
  const rejected: ArenaLedgerEntry[] = []

  const round2 = (n: number) => Math.round(n * 100) / 100

  /** 強制停損：個股現價自成本跌幅達 stopLossPct% → 自動減碼一半。 */
  if (sp?.stopLossPct && sp.stopLossPct > 0) {
    for (const h of [...holdingsAfter]) {
      const mark = closes[h.symbol]
      if (!mark || mark <= 0 || h.avgCost <= 0) continue
      if (mark <= h.avgCost * (1 - sp.stopLossPct / 100)) {
        const shares = Math.max(1, Math.floor(h.shares / 2))
        const execPrice = round2(mark * (1 - slip))
        const notional = round2(shares * execPrice)
        const fee = round2(Math.max(ARENA_FEE_MIN, notional * ARENA_FEE_RATE))
        const tax = round2(notional * ARENA_SELL_TAX_RATE)
        const proceeds = round2(notional - fee - tax)
        cashAfter = round2(cashAfter + proceeds)
        mergeHolding(holdingsAfter, h.symbol, h.symbolName, -shares, execPrice)
        entries.push({
          action: 'SELL',
          symbol: h.symbol,
          symbolName: h.symbolName,
          shares,
          price: execPrice,
          notional,
          fee,
          tax,
          reason: `自動停損：成本 ${round2(h.avgCost)}、現價 ${mark}，跌幅達 ${sp.stopLossPct}% 強制減碼一半`,
        })
      }
    }
  }

  let tradeCount = 0
  const maxTrades = sp?.maxTradesPerSlot != null ? Math.max(0, sp.maxTradesPerSlot) : Infinity
  const bufferPct = sp?.minCashBufferPct != null ? Math.max(0, sp.minCashBufferPct) : 0

  for (const action of decision.actions) {
    if (action.action === 'HOLD') {
      entries.push({ action: 'HOLD', symbol: action.symbol, reason: action.reason })
      continue
    }

    const px = closes[action.symbol]
    if (px === undefined || px <= 0) {
      rejected.push({ action: action.action, symbol: action.symbol, reason: '標的不在股票池或無收盤價' })
      continue
    }
    const name = symbolNames?.[action.symbol]

    if (action.action === 'BUY') {
      if (tradeCount >= maxTrades) {
        rejected.push({ action: action.action, symbol: action.symbol, shares: action.shares, reason: '超過本時點下單筆數上限' })
        continue
      }
      const shares = action.shares && action.shares > 0 ? Math.floor(action.shares) : 1
      const execPrice = round2(px * (1 + slip))
      const notional = round2(shares * execPrice)
      const fee = round2(Math.max(ARENA_FEE_MIN, notional * ARENA_FEE_RATE))
      const cost = round2(notional + fee)

      const projectedHoldings = holdingsAfter.map((h) => ({ ...h }))
      mergeHolding(projectedHoldings, action.symbol, name, shares, execPrice)
      const closesAbs = { ...closes }
      closesAbs[action.symbol] = px
      const projectedEquity = computeArenaEquity(cashAfter - cost, projectedHoldings, closesAbs)
      const newRatio = ((projectedHoldings.find((h) => h.symbol === action.symbol)?.shares ?? 0) * px) / projectedEquity

      if (bufferPct > 0 && projectedEquity > 0) {
        const required = projectedEquity * (bufferPct / 100)
        if (cashAfter - cost < round2(required)) {
          rejected.push({
            action: action.action,
            symbol: action.symbol,
            shares,
            reason: `買入後現金低於權益 ${bufferPct}% 的現金緩衝下限`,
          })
          continue
        }
      }
      if (cost > cashAfter) {
        rejected.push({ action: action.action, symbol: action.symbol, shares, reason: '現金不足' })
        continue
      }
      if (projectedEquity > 0 && newRatio > ARENA_MAX_POSITION_RATIO) {
        rejected.push({
          action: action.action,
          symbol: action.symbol,
          shares,
          reason: `買入後占比 ${(newRatio * 100).toFixed(0)}% 超過單檔上限 ${(ARENA_MAX_POSITION_RATIO * 100).toFixed()}%`,
        })
        continue
      }

      cashAfter = round2(cashAfter - cost)
      mergeHolding(holdingsAfter, action.symbol, name, shares, execPrice)
      tradeCount++
      entries.push({
        action: 'BUY',
        symbol: action.symbol,
        symbolName: name,
        shares,
        price: execPrice,
        notional,
        fee,
        reason: action.reason,
      })
    } else {
      if (tradeCount >= maxTrades) {
        rejected.push({ action: action.action, symbol: action.symbol, shares: action.shares, reason: '超過本時點下單筆數上限' })
        continue
      }
      const existing = holdingsAfter.find((h) => h.symbol === action.symbol)
      const owned = existing?.shares ?? 0
      if (owned <= 0) {
        rejected.push({ action: action.action, symbol: action.symbol, shares: action.shares, reason: '未持有該標的' })
        continue
      }
      const shares = action.shares && action.shares > 0 ? Math.min(Math.floor(action.shares), owned) : owned
      const execPrice = round2(px * (1 - slip))
      const notional = round2(shares * execPrice)
      const fee = round2(Math.max(ARENA_FEE_MIN, notional * ARENA_FEE_RATE))
      const tax = round2(notional * ARENA_SELL_TAX_RATE)
      const proceeds = round2(notional - fee - tax)

      cashAfter = round2(cashAfter + proceeds)
      mergeHolding(holdingsAfter, action.symbol, name, -shares, execPrice)
      tradeCount++
      entries.push({
        action: 'SELL',
        symbol: action.symbol,
        symbolName: name,
        shares,
        price: execPrice,
        notional,
        fee,
        tax,
        reason: action.reason,
      })
    }
  }

  if (entries.length === 0) {
    entries.push({ action: 'HOLD', reason: '無達成任何交易，維持現狀' })
  }

  const equity = computeArenaEquity(cashAfter, holdingsAfter, closes)
  return { entries, rejected, cash: round2(cashAfter), holdings: holdingsAfter, equity }
}