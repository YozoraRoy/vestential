import type { OHLCV, RuleKey, CycleStage, EntryStats, EntryStatsParams } from './types.js'
import { computeSMA, computeRSI, computeMACD, compute52WeekRange } from './indicators.js'

/** 最小可評估索引（需 MA60 + RSI + MACD warmup）。 */
export const MIN_EVAL_INDEX = 60

/** 通過門檻：score≥3 且 R1/R2 至少一項。 */
export const MIN_SCORE = 3
export const MAX_CANDIDATES = 10

/** R1 參數 */
export const R1_MIN_OFF_HIGH = -0.4
export const R1_MAX_OFF_HIGH = -0.15
export const R1_MIN_OFF_LOW = 0.01

/** R3 參數 */
export const R3_WINDOW = 10
export const R3_OVERSOLD = 35
export const R3_REVERSED = 40

/** R4 參數 */
export const R4_FAST = 5
export const R4_SLOW = 20

/** R5 參數 */
export const R5_WINDOW = 5

/** 週期階段邊界（距 52 週高點百分比） */
export const STAGE_NEAR_HIGH = -0.05
export const STAGE_MILD = -0.15
export const STAGE_PULLBACK = -0.4

export function classifyStage(pctOff52wHigh: number): CycleStage {
  if (pctOff52wHigh > STAGE_NEAR_HIGH) return 'near-high'
  if (pctOff52wHigh > STAGE_MILD) return 'mild-pullback'
  if (pctOff52wHigh > STAGE_PULLBACK) return 'pullback'
  return 'deep-pullback'
}

export interface SeriesEval {
  index: number
  score: number
  matchedRules: RuleKey[]
  cycleStage: CycleStage
  pctOff52wHigh: number
  pctOff52wLow: number
  close: number
  ma20: number
  ma60: number
  rsi: number
  macdHist: number
  /** 5 日均量 / 20 日均量（R4 用） */
  volumeRatio: number
}

/** 依區間規則判定「回檔到位」是否成立。 */
export function ruleR1(pctOffHigh: number, pctOffLow: number): boolean {
  return (
    pctOffHigh >= R1_MIN_OFF_HIGH &&
    pctOffHigh <= R1_MAX_OFF_HIGH &&
    pctOffLow >= R1_MIN_OFF_LOW
  )
}

/** 依區間規則判定「超賣反轉」是否成立。 */
export function ruleR3(rsi: number[], i: number): boolean {
  if (rsi[i] < R3_REVERSED) return false
  const start = Math.max(0, i - (R3_WINDOW - 1))
  for (let j = start; j <= i; j++) {
    if (rsi[j] > 0 && rsi[j] < R3_OVERSOLD) return true
  }
  return false
}

/** 依區間規則判定「動能翻正」是否成立。 */
export function ruleR5(hist: number[], i: number): boolean {
  if (hist[i] <= 0) return false
  const start = Math.max(0, i - (R5_WINDOW - 1))
  for (let j = start; j <= i; j++) {
    if (hist[j] <= 0) return true
  }
  return false
}

/**
 * 對整段 OHLCV 進行逐日規則比對，回傳出每個可評估索引的比對結果。
 * 使用「只用到該索引為止」的資料，因此即為 walk-forward 可驗證。
 */
export function evaluateSeries(ohlcv: OHLCV[]): SeriesEval[] {
  if (ohlcv.length === 0) return []
  const closes = ohlcv.map((v) => v.close)
  const volumes = ohlcv.map((v) => v.volume)
  const ma20 = computeSMA(closes, 20)
  const ma60 = computeSMA(closes, 60)
  const rsi = computeRSI(closes, 14)
  const macd = computeMACD(closes)

  const out: SeriesEval[] = []
  for (let i = MIN_EVAL_INDEX; i < closes.length; i++) {
    const range = compute52WeekRange(closes.slice(0, i + 1))
    const pctOffHigh = range && range.high > 0 ? closes[i] / range.high - 1 : 0
    const pctOffLow = range && range.low > 0 ? closes[i] / range.low - 1 : 0

    const avgV5 =
      i >= R4_FAST - 1
        ? volumes.slice(i - (R4_FAST - 1), i + 1).reduce((s, v) => s + v, 0) / R4_FAST
        : 0
    const avgV20 =
      i >= R4_SLOW - 1
        ? volumes.slice(i - (R4_SLOW - 1), i + 1).reduce((s, v) => s + v, 0) / R4_SLOW
        : 0

    const matchedRules: RuleKey[] = []
    if (ruleR1(pctOffHigh, pctOffLow)) matchedRules.push('R1')
    if (ma20[i] != null && ma60[i] != null && closes[i] >= ma60[i]! && closes[i] >= ma20[i]!) {
      matchedRules.push('R2')
    }
    if (ruleR3(rsi, i)) matchedRules.push('R3')
    if (avgV5 > 0 && avgV20 > 0 && avgV5 < avgV20) matchedRules.push('R4')
    if (ruleR5(macd.hist, i)) matchedRules.push('R5')

    out.push({
      index: i,
      score: matchedRules.length,
      matchedRules,
      cycleStage: classifyStage(pctOffHigh),
      pctOff52wHigh: pctOffHigh,
      pctOff52wLow: pctOffLow,
      close: closes[i],
      ma20: ma20[i] ?? 0,
      ma60: ma60[i] ?? 0,
      rsi: rsi[i],
      macdHist: macd.hist[i],
      volumeRatio: avgV20 > 0 ? avgV5 / avgV20 : 0,
    })
  }
  return out
}

/** 是否通過發布門檻：score≥MIN_SCORE 且 (R1 或 R2) 至少一項。 */
export function passesGate(score: number, matchedRules: RuleKey[]): boolean {
  if (score < MIN_SCORE) return false
  return matchedRules.includes('R1') || matchedRules.includes('R2')
}

/** 取最後一根（目前狀態）的比對結果；無法評估時回傳 null。 */
export function evaluateLastBar(ohlcv: OHLCV[]): SeriesEval | null {
  const series = evaluateSeries(ohlcv)
  return series.length > 0 ? series[series.length - 1] : null
}

/** 依訊號日之後的報酬模擬（+8% / −5% / 40 日），判定單筆交易結果。 */
function simulateTrade(
  ohlcv: OHLCV[],
  startIdx: number,
  entryPrice: number,
  params: EntryStatsParams,
): { outcome: 'win' | 'loss' | 'neutral'; daysToTarget: number | null } {
  const targetProfit = params.targetProfit ?? 0.08
  const maxDrawdown = params.maxDrawdown ?? 0.05
  const holdingDays = params.holdingDays ?? 40
  const targetPrice = entryPrice * (1 + targetProfit)
  const stopPrice = entryPrice * (1 - maxDrawdown)
  const endIdx = Math.min(startIdx + holdingDays, ohlcv.length)

  for (let i = startIdx; i < endIdx; i++) {
    const hitTarget = ohlcv[i].high >= targetPrice
    const hitStop = ohlcv[i].low <= stopPrice
    if (hitTarget && hitStop) {
      return { outcome: 'loss', daysToTarget: null }
    }
    if (hitTarget) {
      return { outcome: 'win', daysToTarget: i - startIdx + 1 }
    }
    if (hitStop) {
      return { outcome: 'loss', daysToTarget: null }
    }
  }
  return { outcome: 'neutral', daysToTarget: null }
}

/**
 * 進場後擬合回測：在歷史序列中，凡「訊號日規則比對通過門檻」即於次一交易日開盤進場，
 * 依 +8% / −5% / 40 日模擬，統計勝率、平均達成天數（非重疊交易鎖）。
 */
export function runSignalBacktest(ohlcv: OHLCV[], params: EntryStatsParams = {}): EntryStats {
  const series = evaluateSeries(ohlcv)
  const holdingDays = params.holdingDays ?? 40
  const n = ohlcv.length
  const evalByIndex = new Map(series.map((s) => [s.index, s]))

  const trades: { outcome: 'win' | 'loss' | 'neutral'; daysToTarget: number | null }[] = []
  let i = 0
  while (i < n) {
    // 以「當日規則」為準：僅當該日通過門檻才進場，符合真實發布條件
    const evalItem = evalByIndex.get(i)
    const pass = evalItem != null && passesGate(evalItem.score, evalItem.matchedRules)
    if (pass && i + 1 < n) {
      const entryPrice = ohlcv[i + 1].open
      if (entryPrice > 0) {
        trades.push(simulateTrade(ohlcv, i + 1, entryPrice, params))
        i = Math.min(i + 1 + holdingDays, n)
        continue
      }
    }
    i++
  }

  const wins = trades.filter((t) => t.outcome === 'win').length
  const losses = trades.filter((t) => t.outcome === 'loss').length
  const neutral = trades.filter((t) => t.outcome === 'neutral').length
  const decided = wins + losses
  const winRate = decided > 0 ? wins / decided : null
  const winTrades = trades.filter((t) => t.outcome === 'win' && t.daysToTarget != null)
  const avgDaysToTarget =
    winTrades.length > 0
      ? winTrades.reduce((s, t) => s + (t.daysToTarget ?? 0), 0) / winTrades.length
      : null

  return { totalSignals: trades.length, wins, losses, neutral, winRate, avgDaysToTarget }
}