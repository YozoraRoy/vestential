import type { ArenaDayOhlc, ArenaSlotPrice } from './types.js'

/** 決定性字串雜湊 → [0,1)，確保同 (symbol,date,slot) 永遠相同 → 冪等可重播。 */
function hashNum(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return (h % 1000003) / 1000003
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * 由當日 OHLC 推出 N 個「盤中時點價」的決定性合成路徑。
 * - 趨勢方向尊重 open→close；每一時點在 [low, high] 內、加上符號/日期/時點決定的雜訊。
 * - 同一天、同符號、同時點無論呼叫幾次結果都相同 → 可重播、冪等，且不需真實盤中明細。
 */
export function buildSlotPrices(
  symbol: string,
  day: ArenaDayOhlc,
  slotTimes: string[],
): ArenaSlotPrice[] {
  if (slotTimes.length === 0) return []
  const { open, high, low, close, prevClose } = day
  const safeHigh = high >= Math.max(open, close) ? high : Math.max(open, close)
  const safeLow = low <= Math.min(open, close) && low > 0 ? low : Math.min(open, close)
  const n = slotTimes.length

  return slotTimes.map((timeLabel, slot) => {
    const f = (slot + 1) / (n + 1)
    const drift = open + (close - open) * f
    const amp = (safeHigh - safeLow) * 0.25
    const noise = (hashNum(`${symbol}|${day.date}|${slot}`) - 0.5) * 2 * amp
    let price = drift + noise
    if (slot === 0) price = open + (close - open) * 0.08 + (price - open) * 0.4
    if (slot === n - 1) price = price * 0.45 + close * 0.55
    price = Math.max(safeLow, Math.min(safeHigh, price))
    const changePct =
      prevClose && prevClose > 0 ? round2(((price - prevClose) / prevClose) * 100) : undefined
    return { slot, timeLabel, price: round2(price), changePct }
  })
}