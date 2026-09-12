import { yahooFinanceProvider, fetchBatchQuotes } from '@stock/market-data'
import { searchStocksByName, fuzzySearchStocksByName } from '@stock/database'
import { Converter } from 'opencc-js'

// 簡→繁轉換：OCR 常把繁體讀成簡體（chi_sim），DB（TWSE）名稱是繁體。
// opencc cn→t 會多做區域偏好（臺/羣），TWSE 慣用「台/群」，故再 de-regional 回去。
const ocC2T = Converter({ from: 'cn', to: 't' })
export function toTraditionalZh(text: string): string {
  try {
    return ocC2T(text).replace(/臺/g, '台').replace(/羣/g, '群')
  } catch {
    return text
  }
}

export type Market = 'tw' | 'us'

export interface PortfolioInput {
  market: Market
  symbol: string
  shares: number
  cost: number
  currentPrice: number
  dividend: number
  symbolName?: string
}

function toNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function validatePortfolioInput(body: any): { ok: true; data: PortfolioInput } | { ok: false; error: string } {
  const market: Market | null = body?.market === 'tw' || body?.market === 'us' ? body.market : null
  const symbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const shares = toNum(body?.shares)
  const cost = toNum(body?.cost)
  const currentPrice = toNum(body?.currentPrice)
  const dividend = toNum(body?.dividend) ?? 0
  const symbolName = typeof body?.symbolName === 'string' ? body.symbolName : undefined

  if (!market || !symbol) return { ok: false, error: 'market 與 symbol 為必填' }
  if (shares == null || !(shares > 0)) return { ok: false, error: '持有股數需大於 0' }
  if (cost == null || cost < 0) return { ok: false, error: '每股成本需 >= 0' }
  if (currentPrice == null || !(currentPrice > 0)) return { ok: false, error: '每股現價需大於 0' }
  if (dividend == null || dividend < 0) return { ok: false, error: '股息總額需 >= 0' }

  return { ok: true, data: { market, symbol, shares, cost, currentPrice, dividend, symbolName } }
}

export interface PnLInput {
  market: Market
  shares: number
  cost: number
  currentPrice: number
  dividend: number
}

export interface PnLResult {
  costBasis: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  totalReturn: number
  totalReturnPct: number
  yieldOnCost: number
}

export function computePnL(input: PnLInput): PnLResult {
  const costBasis = input.shares * input.cost
  const marketValue = input.shares * input.currentPrice
  const unrealizedPnl = marketValue - costBasis
  const totalReturn = unrealizedPnl + input.dividend
  return {
    costBasis,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPct: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0,
    totalReturn,
    totalReturnPct: costBasis > 0 ? (totalReturn / costBasis) * 100 : 0,
    yieldOnCost: costBasis > 0 ? (input.dividend / costBasis) * 100 : 0,
  }
}

/** 依市場解析 Yahoo 代號：台股純數字 → .TW/.TWO，美股直接用代號。 */
export async function resolveYahooSymbol(raw: string, market: Market): Promise<string> {
  const trimmed = raw.trim().toUpperCase()
  if (market === 'us') return trimmed

  if (/^\d{4,6}\.(TW|TWO)$/.test(trimmed)) return trimmed
  // 台股代號：純數字（如 2330）或含字母的 ETF（如 00687B）
  if (/^\d{3,6}[A-Z0-9]{0,2}$/.test(trimmed)) {
    for (const suffix of ['.TW', '.TWO']) {
      try {
        const q = await yahooFinanceProvider.getQuote(`${trimmed}${suffix}`, 'TW')
        if (q.price > 0) return `${trimmed}${suffix}`
      } catch (_) {}
    }
  }
  return trimmed
}

export interface LiveQuote {
  symbol: string
  price: number
  name: string | null
}

/** 抓取即時報價；失敗回 null（呼叫端自行決定是否以手輸值取代）。 */
export async function fetchLiveQuote(rawSymbol: string, market: Market): Promise<LiveQuote | null> {
  try {
    const symbol = await resolveYahooSymbol(rawSymbol, market)
    const quote = await yahooFinanceProvider.getQuote(symbol, market === 'tw' ? 'TW' : 'US')
    if (!quote.price || quote.price <= 0) return null
    let name: string | null = null
    try {
      const profile = await yahooFinanceProvider.getProfile(symbol, market === 'tw' ? 'TW' : 'US')
      name = profile.name && profile.name !== symbol ? profile.name : null
    } catch (_) {}
    return { symbol, price: quote.price, name }
  } catch (e) {
    console.error('[Portfolio] fetchLiveQuote failed:', e)
    return null
  }
}

/**
 * 清掉 OCR 誤讀造成的名稱前導雜訊（如 "2星宇航空" → "星宇航空"）。
 * 只在中文字存在時才清理（避免誤傷合法的英文數字名，如 "2U, Inc."）。
 */
export function cleanOcrName(raw: string): string {
  const t = (raw ?? '').trim()
  if (/[\u4e00-\u9fa5]/.test(t)) return t.replace(/^[^\u4e00-\u9fa5A-Za-z]+/u, '')
  return t
}

/** Yahoo 搜尋代號正規化：台股 "2646.TW" → "2646"（App 內以純數字存台股代號），美股保留原案。 */
function normalizeSearchSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/\.(TW|TWO)$/i, '')
}

export interface StockCandidate {
  symbol: string
  name: string
  market: Market
}

/**
 * 台股名稱搜尋：DB 精準 LIKE 優先，失敗再走 fuzzy（補單字 OCR 誤讀）。
 * fz 標記是否為模糊補救，供自動補齊判斷可否以 DB 正名取代 OCR 名稱。
 */
async function dbSearchTw(query: string): Promise<{ candidates: StockCandidate[]; fuzzy: boolean; ambiguous: boolean }> {
  const conv = toTraditionalZh(query)
  let db = await searchStocksByName(conv)
  let fuzzy = false
  let ambiguous = false
  if (!db.length) {
    const fz = await fuzzySearchStocksByName(conv)
    if (fz.length) {
      // 榜首與第二名距離相同（如「美債」同時貼近正2/反1）→ 無法可靠自動補齊，交給手動。
      ambiguous = fz.length > 1 && fz[0].dist === fz[1].dist
      if (!ambiguous) db = fz
      fuzzy = true
    }
  }
  if (db.length) {
    return {
      candidates: db.map(r => ({ symbol: normalizeSearchSymbol(r.stock_id), name: r.stock_name, market: 'tw' as Market })),
      fuzzy,
      ambiguous,
    }
  }
  return { candidates: [], fuzzy, ambiguous }
}

/**
 * Yahoo `search` 對純台股代號在資料中心 IP 常回空（尤其 OTC/.TWO，如 00687B）。
 * 代號字形時直接 probe v7 批量報價（.TW/.TWO 各一），取的可用候選。
 * 若 .TW 存在（上市）優先於 .TWO（上櫃）。
 */
async function probeTwSymbolById(id: string): Promise<StockCandidate[]> {
  try {
    const candidates = [`${id}.TW`, `${id}.TWO`]
    const batch = await fetchBatchQuotes(candidates)
    const hit =
      batch.find((r) => r.symbol?.toUpperCase() === `${id}.TW`) ??
      batch.find((r) => r.symbol?.toUpperCase() === `${id}.TWO`)
    if (!hit) return []
    return [{ symbol: normalizeSearchSymbol(hit.symbol), name: hit.name || hit.symbol, market: 'tw' as Market }]
  } catch {
    return []
  }
}

/**
 * 依名稱或代號搜尋股票候選清單（供自動補齊與前端手動搜尋共用）。
 * - 台股：以本地 DB（TWSE 零股交易/股東會紀念品）的中文名稱查詢為主，
 *   Yahoo 對中文名稱搜尋極不可靠（實測 "星宇航空" 回空）；DB 沒有結果才 fallback 到 Yahoo。
 * - 美股：Yahoo searchSymbols。
 */
export async function searchStockCandidates(q: string, market: Market): Promise<StockCandidate[]> {
  const query = q.trim()
  if (!query) return []
  try {
    if (market === 'tw') {
      const { candidates } = await dbSearchTw(query)
      if (candidates.length) return candidates

      // 純台股代號字形：先 probe 報價端（比 Yahoo search 對 OTC 代號可靠），再掉回 search。
      if (/^\d{4}[A-Z0-9]{0,2}$/i.test(query)) {
        const probed = await probeTwSymbolById(query)
        if (probed.length) return probed
      }

      const y = await yahooFinanceProvider.searchSymbols(query)
      const tw = y.filter(r => /\.(TW|TWO)$/i.test(r.symbol))
      if (tw.length) return tw.map(r => ({ symbol: normalizeSearchSymbol(r.symbol), name: r.name, market: 'tw' as Market }))
      return []
    }
    const y = await yahooFinanceProvider.searchSymbols(query)
    return y.map(r => ({ symbol: r.symbol, name: r.name, market: 'us' as Market })).slice(0, 10)
  } catch {
    return []
  }
}

/** 依名稱搜尋 Yahoo 股票代號（回傳最相關一筆，供自動補齊）。 */
async function findSymbolByName(
  name: string,
  market: Market,
): Promise<{ symbol: string; name: string; fuzzy: boolean; ambiguous: boolean } | null> {
  if (market === 'tw') {
    const { candidates, fuzzy, ambiguous } = await dbSearchTw(name)
    if (!candidates.length) return null
    return { symbol: candidates[0].symbol, name: candidates[0].name, fuzzy, ambiguous }
  }
  const candidates = await searchStockCandidates(name, 'us')
  if (!candidates.length) return null
  return { symbol: candidates[0].symbol, name: candidates[0].name, fuzzy: false, ambiguous: false }
}

/** 可供補齊的辨識部位（欄位皆可缺，補齊後仍回傳同一型別）。 */
export interface EnrichablePosition {
  market: Market
  symbol: string
  symbolName?: string
  shares: number
  cost: number
  currentPrice?: number
  dividend: number
}

export interface EnrichmentSummary {
  names: number
  symbols: number
  prices: number
}

/**
 * 辨識結果自動補齊：用 Yahoo 搜尋/報價把空缺欄位填好。
 * - symbol 空缺但有名稱 → searchSymbols 依名稱找代號
 * - symbolName 空缺但有代號 → getProfile 取名稱
 * - currentPrice 缺漏 → fetchLiveQuote 抓即時報價
 * 全程 best-effort：任何一步失敗都保留原值，不影響辨識主流程。
 */
export async function enrichRecognizedPositions<P extends EnrichablePosition>(
  positions: P[],
): Promise<{ positions: P[]; enriched: EnrichmentSummary }> {
  const enriched: EnrichmentSummary = { names: 0, symbols: 0, prices: 0 }
  const out = await Promise.all(
    positions.map(async (p) => {
      const next: EnrichablePosition = { ...p }

      const cleanName = p.symbolName ? cleanOcrName(p.symbolName) : ''
      if (cleanName && cleanName !== p.symbolName) {
        next.symbolName = cleanName
        enriched.names++
      }

      if (!next.symbol && cleanName) {
        const found = await findSymbolByName(cleanName, p.market)
        if (found && !found.ambiguous) {
          next.symbol = found.symbol
          enriched.symbols++
          // DB/TWSE 名稱比 OCR 讀出更可靠；簡繁等效或模糊命中（單字誤讀）時以正名取代。
          if (p.market === 'tw' && found.name && (toTraditionalZh(found.name) === toTraditionalZh(cleanName) || found.fuzzy)) {
            next.symbolName = found.name
            enriched.names++
          } else if (!next.symbolName) {
            next.symbolName = found.name
          }
        }
      }

      // 台股代號若含英文字母（如 OCR 誤讀 "IR0230"）視為雜訊，改用名稱重新解析。
      const badTwSymbol = p.market === 'tw' && !!next.symbol && !/^\d{4,6}$/.test(next.symbol)
      if ((!next.symbol || badTwSymbol) && cleanName) {
        const found = await findSymbolByName(cleanName, p.market)
        if (found && !found.ambiguous) {
          next.symbol = found.symbol
          enriched.symbols++
          // DB/TWSE 名稱比 OCR 讀出更可靠；簡繁等效或模糊命中（單字誤讀）時以正名取代。
          if (p.market === 'tw' && found.name && (toTraditionalZh(found.name) === toTraditionalZh(cleanName) || found.fuzzy)) {
            next.symbolName = found.name
            enriched.names++
          } else if (!next.symbolName) {
            next.symbolName = found.name
          }
        } else if (badTwSymbol) {
          // 誤讀代號 + 名稱也查無 → 清掉，讓使用者手動搜尋補齊（避免存下錯誤代號）。
          next.symbol = ''
        }
      }

      if (next.symbol && !next.symbolName) {
        try {
          const yahooSymbol = await resolveYahooSymbol(next.symbol, p.market)
          const profile = await yahooFinanceProvider.getProfile(yahooSymbol, p.market === 'tw' ? 'TW' : 'US')
          // Yahoo 的台股 profile 常回傳代號本身（如 "2646.TW"）而非中文名，不算有效名稱。
          if (profile.name && profile.name.trim().toUpperCase() !== yahooSymbol.trim().toUpperCase()) {
            next.symbolName = profile.name
            enriched.names++
          }
        } catch {}
      }

      if (next.symbol && (next.currentPrice == null || next.currentPrice <= 0)) {
        const q = await fetchLiveQuote(next.symbol, p.market)
        if (q && q.price > 0) {
          next.currentPrice = q.price
          enriched.prices++
        }
      }

      return next
    }),
  )
  return { positions: out as P[], enriched }
}

/** 給 AI 用的市場上下文簡述。 */
export async function buildMarketContext(rawSymbol: string, market: Market): Promise<string> {
  try {
    const symbol = await resolveYahooSymbol(rawSymbol, market)
    const quote = await yahooFinanceProvider.getQuote(symbol, market === 'tw' ? 'TW' : 'US')
    const profile = await yahooFinanceProvider.getProfile(symbol, market === 'tw' ? 'TW' : 'US').catch(() => null)
    const lines = [
      `即時報價 ${symbol}: ${quote.price}（成交量 ${quote.volume}）`,
      profile?.name ? `公司名稱: ${profile.name}` : '',
      profile?.sector ? `產業: ${profile.sector}${profile.industry ? ` / ${profile.industry}` : ''}` : '',
      profile?.description ? `公司簡介: ${profile.description.slice(0, 800)}` : '',
    ].filter(Boolean)
    return lines.join('\n')
  } catch (e) {
    console.error('[Portfolio] buildMarketContext failed:', e)
    return ''
  }
}