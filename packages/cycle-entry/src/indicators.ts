/** 技術指標（純函式）：SMA、RSI(14, Wilder)、MACD(12,26,9) 柱、52 週高低點。 */

/** 簡單移動平均；前 (period-1) 個元素為 null。 */
export function computeSMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** 指數移動平均（EMA，初始值用 SMA 種子）。 */
function computeEMA(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(0)
  const k = 2 / (period + 1)
  let prev = 0
  for (let i = 0; i < values.length; i++) {
    const seedStart = period - 1
    if (i === seedStart) {
      let seed = 0
      for (let j = 0; j < period; j++) seed += values[j]
      prev = seed / period
      out[i] = prev
    } else if (i > seedStart) {
      prev = values[i] * k + prev * (1 - k)
      out[i] = prev
    }
  }
  return out
}

/**
 * RSI(14)（Wilder 平滑）。前 (period) 個元素為 0（視為無值）。
 * 全部漲 / 全部跌的極端情況處理：全部漲 RSI=100，全部跌 RSI=0。
 */
export function computeRSI(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(0)
  if (closes.length < period + 1) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gain += diff
    else loss += -diff
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const g = diff > 0 ? diff : 0
    const l = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export interface MACDHistSeries {
  /** DIF = EMA12 − EMA26 */
  dif: number[]
  /** DEA = EMA9(DIF) */
  dea: number[]
  /** 柱狀值 = DIF − DEA */
  hist: number[]
}

/** MACD(12,26,9) 柱狀值；前面 26+9−1 根為 0（視為無值）。 */
export function computeMACD(closes: number[]): MACDHistSeries {
  const ema12 = computeEMA(closes, 12)
  const ema26 = computeEMA(closes, 26)
  const dif = closes.map((_, i) => ema12[i] - ema26[i])
  // DEA：對 DIF 取 EMA9，但 DIF 的垃圾前段（尚未成形的 part）直接以 0 帶過
  const dea = computeEMA(dif, 9)
  const hist = dif.map((v, i) => v - dea[i])
  return { dif, dea, hist }
}

/** 52 週（252 根）高低點：以最近 window（預設 252）根內求高低。回傳 [high, low] 或 null（資料不足）。 */
export function compute52WeekRange(closes: number[], window = 252): { high: number; low: number } | null {
  if (closes.length < 2) return null
  const start = Math.max(0, closes.length - window)
  let high = -Infinity
  let low = Infinity
  for (let i = start; i < closes.length; i++) {
    if (closes[i] > high) high = closes[i]
    if (closes[i] < low) low = closes[i]
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null
  return { high, low }
}