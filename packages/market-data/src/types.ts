import { z } from 'zod'
import { Market } from '@stock/core'

export const MarketDataRequestSchema = z.object({
  symbol: z.string(),
  market: z.nativeEnum(Market),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

export const OHLCVSchema = z.object({
  timestamp: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
})

export const QuoteSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  timestamp: z.number(),
})

export type OHLCV = z.infer<typeof OHLCVSchema>
export type MarketDataRequest = z.infer<typeof MarketDataRequestSchema>
export type Quote = z.infer<typeof QuoteSchema>

export interface Fundamentals {
  symbol: string
  marketCap?: number
  peRatio?: number
  eps?: number
  dividendYield?: number
  revenue?: number
  netIncome?: number
  sector?: string
  industry?: string
}

export interface CompanyProfile {
  symbol: string
  name: string
  sector?: string
  industry?: string
  exchange?: string
  marketCap?: number
  description?: string
  /** Yahoo 的標的分類，例如 "EQUITY"（個股）、"ETF"、空白表示未知。 */
  quoteType?: string
}

/** 批量報價/基本面快照（Yahoo v7 finance/quote）——一次帶回多檔的市值、價格與類型。 */
export interface BatchQuote {
  symbol: string
  marketCap?: number
  price?: number
  name?: string
  quoteType?: string
}
