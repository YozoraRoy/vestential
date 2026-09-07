import type { OHLCV, Quote, Fundamentals, CompanyProfile, BatchQuote } from './types.js'
import { MarketDataError } from '@stock/core'

export interface MarketDataProvider {
  readonly name: string

  getQuote(symbol: string, market: string): Promise<Quote>
  getHistory(symbol: string, market: string, start?: string, end?: string): Promise<OHLCV[]>
  getFundamentals(symbol: string, market: string): Promise<Fundamentals>
  getProfile(symbol: string, market: string): Promise<CompanyProfile>
  searchSymbols(query: string, market?: string): Promise<Array<{ symbol: string; name: string; market: string }>>
  /** 批量抓多檔報價快照（含市值/類型）。非所有 provider 實作；agent-arena 股票池排序用。 */
  getBatchQuotes?(symbols: string[]): Promise<BatchQuote[]>
}

export class ProviderRegistry {
  private providers = new Map<string, MarketDataProvider>()

  register(provider: MarketDataProvider) {
    this.providers.set(provider.name, provider)
  }

  get(name: string): MarketDataProvider {
    const p = this.providers.get(name)
    if (!p) throw new MarketDataError(`Provider "${name}" not registered`)
    return p
  }

  getAll(): MarketDataProvider[] {
    return [...this.providers.values()]
  }
}

export const registry = new ProviderRegistry()
