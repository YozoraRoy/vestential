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
  /** 勝率百分比數值（0~100，保留一位小數，如 66.7 代表 66.7%）；無判定結果時 null */
  winRate: number | null
  /** 獲利交易平均達成天數；無 win 時 null */
  avgDaysToTarget: number | null
}

/** 逐筆交易紀錄（由 runSignalBacktestDetail 產出，供前端明細表與圖表使用）。 */
export interface TradeRecord {
  /** 訊號日（ISO 日期，規則比對通過日） */
  signalDate: string
  /** 進場日（訊號日次一交易日，ISO 日期） */
  entryDate: string
  /** 進場價（進場日開盤價） */
  entryPrice: number
  /** 出場日（ISO 日期）；持有到期且資料終止時為最後一根交易日 */
  exitDate: string | null
  /** 出場價（停利 / 停損價或到期收盤價） */
  exitPrice: number | null
  /** 單筆報酬率（比值，如 0.08 = +8%、-0.05 = -5%） */
  returnPct: number | null
  /** 持有交易天數 */
  holdingDays: number | null
  outcome: 'win' | 'loss' | 'neutral'
  /** 出場原因：target=達成目標停利 / stop=跌破停損 / timeout=持有到期 */
  exitReason: 'target' | 'stop' | 'timeout'
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