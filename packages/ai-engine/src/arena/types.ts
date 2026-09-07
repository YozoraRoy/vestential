import { z } from 'zod'

export type ArenaDivision = 'season' | 'open'

export type ArenaTone = 'aggressive' | 'neutral' | 'conservative'

export type ArenaAgentStatus = 'active' | 'paused' | 'reset'

export type ArenaMode = 'backtest' | 'live'

export const ARENA_DEFAULT_CAPITAL = 200_000

export const ARENA_FEE_RATE = 0.001425

export const ARENA_FEE_MIN = 1

export const ARENA_SELL_TAX_RATE = 0.003

export const ARENA_SLIPPAGE_DEFAULT = 0.001

export const ARENA_MAX_POSITION_RATIO = 0.3

export const ARENA_DEFAULT_MAX_TOKENS = 800

/** 動態股票池（市值 Top100 + ETF）快取時長：Yahoo marketCap 12h、TWSE CSV 12h。 */
export const ARENA_UNIVERSE_ENV_CACHE_TTL_MS = 12 * 60 * 60 * 1000

export interface ArenaUniverseItem {
  symbol: string
  name: string
}

/** 預設台股價值投資股票池（可經由 ARENA_UNIVERSE env 覆寫，格式 `2330 台積電,2317 鴻海`）。 */
export const DEFAULT_ARENA_UNIVERSE: ArenaUniverseItem[] = [
  { symbol: '2330', name: '台積電' },
  { symbol: '2317', name: '鴻海' },
  { symbol: '2454', name: '聯發科' },
  { symbol: '2303', name: '聯電' },
  { symbol: '2412', name: '中華電' },
  { symbol: '3008', name: '大立光' },
  { symbol: '3231', name: '緯創' },
  { symbol: '2382', name: '廣達' },
  { symbol: '2377', name: '微星' },
  { symbol: '3034', name: '聯詠' },
  { symbol: '2603', name: '長榮' },
  { symbol: '2609', name: '陽明' },
  { symbol: '2881', name: '富邦金' },
  { symbol: '2882', name: '國泰金' },
  { symbol: '2886', name: '兆豐金' },
  { symbol: '2891', name: '中信金' },
  { symbol: '2892', name: '第一金' },
  { symbol: '2884', name: '玉山金' },
  { symbol: '2885', name: '元大金' },
  { symbol: '5876', name: '上海商銀' },
  { symbol: '4904', name: '遠傳' },
  { symbol: '2912', name: '統一超' },
  { symbol: '3711', name: '日月光投控' },
  { symbol: '9904', name: '寶成' },
]

export interface ArenaPrice {
  symbol: string
  symbolName?: string
  price: number
  changePct?: number
  date?: string
  open?: number
  high?: number
  low?: number
}

/** 當日 OHLC + 前一日收盤（供合成盤中路徑與盤前統計）。 */
export interface ArenaDayOhlc {
  date: string
  open: number
  high: number
  low: number
  close: number
  prevClose?: number
}

/** 單一時點（盤中決策窗）的全池參考價。 */
export interface ArenaSlotPrice {
  slot: number
  timeLabel: string
  price: number
  changePct?: number
}

export interface ArenaHistoryPoint {
  date: string
  close: number
  open?: number
  high?: number
  low?: number
}

export type ArenaHistory = ArenaHistoryPoint[]

export interface ArenaHolding {
  symbol: string
  symbolName?: string
  shares: number
  avgCost: number
}

export interface ArenaDecisionAction {
  symbol: string
  action: 'BUY' | 'SELL' | 'HOLD'
  shares?: number
  reason?: string
}

export interface ArenaDecision {
  actions: ArenaDecisionAction[]
}

export const ArenaDecisionsSchema = z.object({
  actions: z.array(
    z.object({
      symbol: z.string().trim().regex(/^[A-Za-z0-9.]+$/),
      action: z.enum(['BUY', 'SELL', 'HOLD']),
      shares: z.number().int().positive().optional(),
      reason: z.string().max(200).optional(),
    }),
  ),
})

export interface ArenaAgentParams {
  id: number
  name: string
  strategyId: string
  tone: ArenaTone
}

/** 盤中決策時點（09:30 / 10:30 / 11:30 / 13:00，可經 ARENA_SLOT_TIMES 覆寫）。 */
export const DEFAULT_ARENA_SLOT_TIMES = ['09:30', '10:30', '11:30', '13:00']

export function arenaSlotTimes(): string[] {
  const raw = process.env.ARENA_SLOT_TIMES
  if (raw?.trim()) {
    const items = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s))
    if (items.length > 0) return items
  }
  return DEFAULT_ARENA_SLOT_TIMES
}

/** 使用者可自訂的細部策略參數（全數字，clamp 於範圍內）。 */
export interface ArenaStrategyParams {
  maxPositionPct: number
  stopLossPct: number
  minCashBufferPct: number
  maxTradesPerSlot: number
}

export const ARENA_STRATEGY_PARAMS_DEFAULTS: ArenaStrategyParams = {
  maxPositionPct: 30,
  stopLossPct: 15,
  minCashBufferPct: 5,
  maxTradesPerSlot: 3,
}

const PARAM_RANGES: Record<keyof ArenaStrategyParams, [number, number]> = {
  maxPositionPct: [5, 50],
  stopLossPct: [5, 50],
  minCashBufferPct: [0, 40],
  maxTradesPerSlot: [0, 10],
}

export function normalizeArenaStrategyParams(raw: unknown): ArenaStrategyParams {
  const out = { ...ARENA_STRATEGY_PARAMS_DEFAULTS }
  let target = raw
  if (typeof target === 'string') {
    try {
      target = JSON.parse(target)
    } catch {
      return out
    }
  }
  if (target && typeof target === 'object' && !Array.isArray(target)) {
    const rec = target as Record<string, unknown>
    for (const key of Object.keys(PARAM_RANGES) as Array<keyof ArenaStrategyParams>) {
      const v = rec[key]
      if (typeof v === 'number' && Number.isFinite(v)) {
        const [min, max] = PARAM_RANGES[key]
        out[key] = Math.round(Math.min(max, Math.max(min, v)))
      }
    }
  }
  return out
}