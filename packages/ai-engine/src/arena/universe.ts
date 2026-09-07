import { registry } from '@stock/market-data'
import {
  ARENA_UNIVERSE_ENV_CACHE_TTL_MS,
  DEFAULT_ARENA_UNIVERSE,
  type ArenaUniverseItem,
} from './types.js'

const TWSE_MI_INDEX_URL = 'https://www.twse.com.tw/exchangeReport/MI_INDEX'

/** 依 TWSE 每日收盤行情 CSV 抓「成交金額」（成交值）由大到小排序的上市股票清單（不含 ETF）。 */
export async function fetchTwseTopByTurnover(
  date: string,
  topN = 250,
): Promise<ArenaUniverseItem[]> {
  const url = `${TWSE_MI_INDEX_URL}?response=csv&date=${date.replace(/-/g, '')}&type=ALL`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Referer: 'https://www.twse.com.tw/' },
  })
  if (!res.ok) throw new Error(`TWSE MI_INDEX error: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  let text: string
  try {
    text = new TextDecoder('big5', { fatal: true }).decode(buf)
  } catch {
    text = new TextDecoder('utf-8').decode(buf)
  }

  const rows: Array<{ code: string; name: string; value: number }> = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('"')) continue
    const fields = line.split('","').map((f) => f.replace(/^"+|"+$/g, ''))
    const code = fields[0]?.trim()
    const name = fields[1]?.trim()
    if (!/^\d{4,6}[A-Za-z]?$/.test(code ?? '')) continue
    if (name === '') continue
    const value = parseFloat((fields[4] ?? '').replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) continue
    rows.push({ code, name, value })
  }
  rows.sort((a, b) => b.value - a.value)
  return rows.slice(0, topN).map((r) => ({ symbol: r.code, name: r.name }))
}

const capCache = new Map<string, number>()

function capTtl(): number {
  const h = Number(process.env.ARENA_CAP_TTL_HOURS)
  return Number.isFinite(h) && h > 0 ? h * 3600_000 : 24 * 3600_000
}

async function marketCaps(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const missing: string[] = []
  const now = Date.now()
  for (const s of symbols) {
    const c = capCache.get(s)
    if (c !== undefined) out.set(s, c)
    else missing.push(s)
  }
  if (missing.length === 0) return out

  const provider = registry.get('yahoo-finance')
  if (provider.getBatchQuotes) {
    try {
      const resolved = missing.map((s) => (/^\d{4,6}/.test(s) ? `${s}.TW` : s))
      const quotes = await provider.getBatchQuotes(resolved)
      for (const q of quotes) {
        const bare = /^\d{4,6}/.test(q.symbol) ? q.symbol.replace(/\.TW$/, '') : q.symbol
        if (q.marketCap && q.marketCap > 0) {
          capCache.set(bare, q.marketCap)
          out.set(bare, q.marketCap)
        }
      }
      if (Date.now() - now > capTtl()) capCache.clear()
    } catch {
      /* 失敗則缺檔保持 0，走成交值順序 */
    }
  }
  return out
}

/**
 * 抓「市值 TopN」台股池：以 TWSE 成交值前 candidateN 檔為候選，
 * 用 Yahoo 批量市值（marketCap）取代成交值排序，每日快取避免打爆外部 API。
 */
export async function fetchTopMarketCapUniverse(
  date: string,
  candidateN = 250,
  topN = 100,
): Promise<ArenaUniverseItem[]> {
  const candidates = await fetchTwseTopByTurnover(date, candidateN)
  const caps = await marketCaps(candidates.map((c) => c.symbol))
  const withCap = candidates.map((c) => ({ ...c, cap: caps.get(c.symbol) ?? 0 }))
  withCap.sort((a, b) => b.cap - a.cap)
  return withCap.slice(0, topN).map(({ symbol, name }) => ({ symbol, name }))
}

/** 合併台股 Top100（市值）與 ETF 池，去重（同代號時台股名優先）。 */
export function buildArenaUniverse(stocks: ArenaUniverseItem[], etf: ArenaUniverseItem[]): ArenaUniverseItem[] {
  const map = new Map<string, ArenaUniverseItem>()
  for (const s of stocks) if (!map.has(s.symbol)) map.set(s.symbol, s)
  for (const e of etf) if (!map.has(e.symbol)) map.set(e.symbol, e)
  return [...map.values()]
}

/** ARENA_UNIVERSE env 優先（格式 `2330 台積電,2317 鴻海`）。 */
export function arenaUniverseOverride(): ArenaUniverseItem[] | null {
  const raw = process.env.ARENA_UNIVERSE
  if (!raw?.trim()) return null
  const items: ArenaUniverseItem[] = []
  for (const part of raw.split(',')) {
    const m = part.trim().match(/^(\d{4,6})\s*([^\s,]*)$/)
    if (m) items.push({ symbol: m[1], name: m[2] || m[1] })
  }
  return items.length > 0 ? items : null
}

/** 預設台股 ETF 池（證交所上市/上櫃主要 ETF，季更維護；行情仍走 Yahoo 動態抓取）。 */
export const DEFAULT_ARENA_ETF_UNIVERSE: ArenaUniverseItem[] = [
  { symbol: '0050', name: '元大台灣50' },
  { symbol: '0051', name: '元大中型100' },
  { symbol: '0052', name: '富邦科技' },
  { symbol: '0055', name: '元大MSCI金融' },
  { symbol: '0056', name: '元大高股息' },
  { symbol: '0061', name: '元大寶滬深' },
  { symbol: '00631', name: '元大台灣50正2' },
  { symbol: '00632T', name: '元大台灣50反1' },
  { symbol: '00633', name: '富邦上証' },
  { symbol: '00636', name: '國泰中國A50' },
  { symbol: '00639', name: '富邦深100' },
  { symbol: '00643', name: '群益深証中小' },
  { symbol: '00645', name: '富邦日本東証' },
  { symbol: '00646', name: '元大S&P500' },
  { symbol: '00648', name: '元大美國政府20年公債' },
  { symbol: '00668', name: '國泰美國債券20年' },
  { symbol: '00670', name: '富邦美國特別股' },
  { symbol: '00671', name: '富邦NASDAQ' },
  { symbol: '00677', name: '富邦公司治理' },
  { symbol: '00678', name: '群益那斯達克生技' },
  { symbol: '00679', name: '元大美債20年' },
  { symbol: '00692', name: '富邦公司治理100' },
  { symbol: '00695', name: '富邦投等債券ETF' },
  { symbol: '00701', name: '國泰股利擇優' },
  { symbol: '00713', name: '元大台灣高息低波' },
  { symbol: '00730', name: '富邦特選台灣高股息30' },
  { symbol: '00733', name: '富邦臺灣中小' },
  { symbol: '00830', name: '國泰費城半導體' },
  { symbol: '00850', name: '元大臺灣ESG永續' },
  { symbol: '00878', name: '國泰永續高股息' },
  { symbol: '00881', name: '國泰台灣5G+' },
  { symbol: '00888', name: '中信台灣智慧50' },
  { symbol: '00891', name: '中信關鍵半導體' },
  { symbol: '00892', name: '富邦台灣半導體' },
  { symbol: '00893', name: '國泰智能電動車' },
  { symbol: '00894', name: '中信小資高價30' },
  { symbol: '00900', name: '富邦特選台灣高股息30' },
  { symbol: '00905', name: 'FT臺灣Smart' },
  { symbol: '00910', name: '第一金太空衛星' },
  { symbol: '00915', name: '凱基台灣優選高股息30' },
  { symbol: '00918', name: '大華優利高填息30' },
  { symbol: '00919', name: '群益台灣精選高息' },
  { symbol: '00921', name: '兆豐龍頭等權重' },
  { symbol: '00922', name: '國泰台灣領袖50' },
  { symbol: '00923', name: '群益台ESG低碳' },
  { symbol: '00929', name: '復華台灣科技優息' },
  { symbol: '00930', name: '永豐ESG低碳高息' },
  { symbol: '00931', name: '中信成長高股息' },
  { symbol: '00932', name: '兆豐永續高息等權' },
  { symbol: '00933', name: '國泰10Y+金融債' },
  { symbol: '00934', name: '中信成長高股息' },
  { symbol: '00935', name: '野村臺灣創新科技50' },
  { symbol: '00936', name: '台新永續高息中小' },
  { symbol: '00938', name: '凱基優選高股息30' },
  { symbol: '00939', name: '統一台灣高息動能' },
  { symbol: '00940', name: '元大台灣價值高息' },
  { symbol: '00941', name: '中信上游半導體' },
  { symbol: '00942', name: '富邦特選高股息30' },
  { symbol: '00944', name: '野村全球航運龍頭' },
  { symbol: '00945', name: '凱基全球AI' },
  { symbol: '00946', name: '群益科技高息成長' },
  { symbol: '00947', name: '台新臺灣IC設計' },
  { symbol: '00948', name: '中信優息投資級債' },
  { symbol: '00949', name: '復華日本龍頭' },
  { symbol: '00965', name: '元大航太防衛科技' },
  { symbol: '00988', name: '群益台灣人工智能' },
]

/** ETF 池：ARENA_ETF_UNIVERSE env 可代換，否則用內建主要 ETF 清單。 */
export function arenaEtfUniverse(): ArenaUniverseItem[] {
  const raw = process.env.ARENA_ETF_UNIVERSE
  if (raw?.trim()) {
    const items: ArenaUniverseItem[] = []
    for (const part of raw.split(',')) {
      const m = part.trim().match(/^(\d{4,6})\s*([^\s,]*)$/)
      if (m) items.push({ symbol: m[1], name: m[2] || m[1] })
    }
    if (items.length > 0) return items
  }
  return DEFAULT_ARENA_ETF_UNIVERSE
}

const dayCache = new Map<string, { at: number; items: ArenaUniverseItem[] }>()

export async function buildDefaultDailyUniverse(date: string): Promise<ArenaUniverseItem[]> {
  const override = arenaUniverseOverride()
  if (override) return override

  const cached = dayCache.get(date)
  if (cached && Date.now() - cached.at < ARENA_UNIVERSE_ENV_CACHE_TTL_MS) return cached.items

  const stocks = await fetchTopMarketCapUniverse(date)
  const etf = arenaEtfUniverse()
  const items = buildArenaUniverse(stocks, etf)

  const final = items.length > 0 ? items : DEFAULT_ARENA_UNIVERSE.map((u) => ({ ...u }))
  dayCache.set(date, { at: Date.now(), items: final })
  if (dayCache.size > 10) {
    const firstKey = dayCache.keys().next().value
    if (firstKey !== undefined) dayCache.delete(firstKey)
  }
  return final
}

export const __testCache = { dayCache, capCache, capTtl }