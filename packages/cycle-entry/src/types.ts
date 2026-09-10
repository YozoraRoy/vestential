export interface OHLCV {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** 判斷規則代號。 */
export type RuleKey = 'R1' | 'R2' | 'R3' | 'R4' | 'R5'

/** 週期階段（依 52 週高低點距離歸類，供前端顯示與 i18n 翻譯）。 */
export type CycleStage = 'near-high' | 'mild-pullback' | 'pullback' | 'deep-pullback'

/** 單一標的目前（最後一根 K 棒）的規則比對結果。 */
export interface RuleMatch {
  score: number
  matchedRules: RuleKey[]
  cycleStage: CycleStage
  /** 距 52 週高點百分比（負值，如 -0.235 = 距高 23.5%） */
  pctOff52wHigh: number
  /** 距 52 週低點百分比（正值） */
  pctOff52wLow: number
  close: number
  ma20: number
  ma60: number
  rsi: number
  macdHist: number
}

export interface EntryStatsParams {
  /** 目標獲利（比值，預設 0.08 = +8%） */
  targetProfit?: number
  /** 最大回撤停損（比值，預設 0.05 = -5%） */
  maxDrawdown?: number
  /** 持有天數上限（預設 40） */
  holdingDays?: number
}

/** 進場後擬合回測統計（simulation on signal day 之後）。 */
export interface EntryStats {
  /** 歷史觸發訊號次數（扣除重疊後） */
  totalSignals: number
  wins: number
  losses: number
  neutral: number
  /** 勝率 = wins / (wins+losses)；無判定結果時 null */
  winRate: number | null
  /** 獲利交易平均達成天數；無 win 時 null */
  avgDaysToTarget: number | null
}

/** 候選標的（通過門檻：score≥3 且 R1/R2 至少一項）。 */
export interface CycleCandidate {
  symbol: string
  name: string
  marketCap: number
  rank: number
  score: number
  matchedRules: RuleKey[]
  cycleStage: CycleStage
  /** 進場價提示（訊號日收盤價） */
  price: number
  entryPriceHint: number
  pctOff52wHigh: number
  pctOff52wLow: number
  rsi: number
  ma20: number
  ma60: number
  macdHist: number
  stats: EntryStats
}