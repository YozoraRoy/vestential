import type { ArenaDecision, ArenaHistory, ArenaHolding, ArenaPrice, ArenaUniverseItem } from './types.js'

export interface ArenaDecisionContext {
  agent: {
    id: number
    name: string
    strategyId: string
    tone: 'aggressive' | 'neutral' | 'conservative'
  }
  strategyName: string
  toneDescription: string
  roundDate: string
  cash: number
  initialCapital: number
  holdings: ArenaHolding[]
  /** symbol -> 本輪收盤報價。 */
  prices: Record<string, ArenaPrice>
  /** symbol -> 近 N 日歷史走勢（供決策參考）。 */
  history: Record<string, ArenaHistory>
  universe: ArenaUniverseItem[]
}

export interface ArenaDecisionResult {
  decision: ArenaDecision
  /** 實際使用的模型識別（提供給日誌）。 */
  model?: string
  fallbackUsed?: boolean
  error?: string
}

/**
 * 策略引擎 seam：未來可替換為更完整的回測/強化學習引擎。
 * 現有實作：LightweightStrategist（單次 quick LLM + 三層 fallback）。
 */
export interface ArenaStrategist {
  readonly id: string
  decide(ctx: ArenaDecisionContext): Promise<ArenaDecisionResult>
}

export const ARENA_TONE_DESCRIPTIONS: Record<'aggressive' | 'neutral' | 'conservative', string> = {
  aggressive: '較積極：願意承擔波動，提高換手率與單檔集中度，但不得超過集中度上限。',
  neutral: '中性：依策略原則平衡風險與報酬，不追逐熱門話題。',
  conservative: '保守：重視本金安全，減碼高波動標的，持有現金比例可偏高。',
}