/**
 * Issue #19（A4+B5）回測 AI 解讀：硬規則「LLM 只解讀、數字一律由引擎注入」。
 *
 * Quota 設計：解讀為純計算（pure computation），直接取用 `/api/backtest`
 * 回傳的引擎 JSON 原樣顯示，不另起 LLM 呼叫、不扣 quota、不新增免費額度。
 * 若未來要接 LLM 做文字潤飾，必須使用下方 BACKTEST_INTERPRET_SYSTEM_PROMPT，
 * 把引擎數字以變數注入 prompt，並受其「禁止自創數字」條款約束；驗收以本頁
 * JSON 對照區塊為準，任一數字對不上即 FAIL。
 */
export const BACKTEST_INTERPRET_SYSTEM_PROMPT = `You are the Backtest Interpreter. You ONLY interpret backtest engine numbers; you MUST NOT invent any numbers.

HARD RULES (violating any of them fails acceptance):
1. Every number in your interpretation (win rate, trade count, average days, thresholds, prices) MUST come verbatim from the ENGINE_JSON injected below. Copy them exactly; do not round, recompute, or estimate.
2. You MUST NOT output any number that does not appear in ENGINE_JSON.
3. If a field in ENGINE_JSON is null, say it is unavailable ("—"); never fill it in.
4. Your job is only to explain what the numbers mean (entry zone status, sample size adequacy, waiting-time implication) in Traditional Chinese (Taiwan), plain language, no preaching.
5. End with exactly this disclaimer: 本解讀數字皆由回測引擎直接注入，僅供參考，不構成投資建議。

ENGINE_JSON:
{engineJson}`

export interface BacktestEngineNumbers {
  bestThreshold: number | null
  totalTrades: number
  winRate: number | null
  avgDaysToTarget: number | null
  wins: number
  losses: number
  neutral: number
}

export type BacktestInsightKind = 'no-trades' | 'in-zone' | 'watch'

export interface BacktestInsight {
  kind: BacktestInsightKind
  /** 驗收用：解讀引用的數字快照（必須與引擎 JSON 一字不差）。 */
  numbers: BacktestEngineNumbers
}

/**
 * 純計算解讀：由引擎 JSON 判定情境（無觸發／在進場區／觀望），不呼叫 LLM。
 * - 無有效最佳閾值或零觸發 → 'no-trades'
 * - 目前乖離 ≤ 最佳閾值 → 'in-zone'
 * - 其餘 → 'watch'
 */
export function buildBacktestInsight(
  result: BacktestEngineNumbers,
  currentBias: number | null,
): BacktestInsight {
  const numbers: BacktestEngineNumbers = {
    bestThreshold: result.bestThreshold,
    totalTrades: result.totalTrades,
    winRate: result.winRate,
    avgDaysToTarget: result.avgDaysToTarget,
    wins: result.wins,
    losses: result.losses,
    neutral: result.neutral,
  }
  const hasValidThreshold =
    result.bestThreshold != null && result.bestThreshold < 0 && result.totalTrades > 0
  if (!hasValidThreshold || result.totalTrades === 0) {
    return { kind: 'no-trades', numbers }
  }
  if (currentBias != null && currentBias <= result.bestThreshold! / 100) {
    return { kind: 'in-zone', numbers }
  }
  return { kind: 'watch', numbers }
}
