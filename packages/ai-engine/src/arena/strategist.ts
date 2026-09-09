import type { ArenaDecision, ArenaHistory, ArenaHolding, ArenaPrice, ArenaSlotPrice, ArenaStrategyParams, ArenaUniverseItem } from './types.js'

export type ArenaDecisionPhase = 'premarket' | 'trade' | 'postclose'

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
  /** 決策階段：trade = 盤中買賣決策（decide 僅被此階段呼叫）。 */
  phase: ArenaDecisionPhase
  /** 盤中時點編號（trade 階段的 slot index）。 */
  slot?: number
  /** 盤中時點標籤，例如「10:30」。 */
  slotTimeLabel?: string
  /** symbol -> 本時點價（trade 階段用）。 */
  slotPrices?: Record<string, number>
  /** symbol -> 本日合成盤中路徑（僅含持股）。 */
  heldDayPaths?: Record<string, ArenaSlotPrice[]>
  /** 當日盤前簡報內容。 */
  briefing?: string
  /** agent 性格（純資料，詳見 persona.ts）。 */
  personality?: string | null
  /** 細部策略參數（已正規化 clamp）。 */
  strategyParams: ArenaStrategyParams
  /** 全域 custom prompt 覆寫（後台 arena.system_prompt），附加在 system prompt 末尾。 */
  customPrompt?: string | null
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