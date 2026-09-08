import { loadConfig } from '@stock/core'
import { registry } from '@stock/market-data'
import { createQuickLLM } from '../llm/quick.js'
import { dataBlock, injectionGuardNote, sanitizeDataField } from './prompt-utils.js'
import type { ArenaDayOhlc, ArenaHistory, ArenaPrice, ArenaUniverseItem } from './types.js'

interface MoversDatum {
  symbol: string
  name: string
  price: number
  changePct: number
  capClass?: string
}

export interface MarketBriefingResult {
  content: string
  model?: string
  fallbackUsed: boolean
}

export interface BuildMarketBriefingParams {
  roundDate: string
  universe: ArenaUniverseItem[]
  prices: Record<string, ArenaPrice>
  history: Record<string, ArenaHistory>
  days: Record<string, ArenaDayOhlc>
  fundamentalsTopN?: number
  maxTokens?: number
}

function collectMovers(prices: Record<string, ArenaPrice>): {
  up: MoversDatum[]
  down: MoversDatum[]
} {
  const up: MoversDatum[] = []
  const down: MoversDatum[] = []
  for (const u of Object.values(prices)) {
    if (u.price <= 0 || u.changePct === undefined) continue
    const d: MoversDatum = { symbol: u.symbol, name: u.symbolName ?? u.symbol, price: u.price, changePct: u.changePct }
    if (u.changePct >= 0) up.push(d)
    else down.push(d)
  }
  up.sort((a, b) => b.changePct - a.changePct)
  down.sort((a, b) => a.changePct - b.changePct)
  return { up, down }
}

function formatMovers(list: MoversDatum[], n: number): string {
  return list
    .slice(0, n)
    .map((d) => `${d.symbol} ${d.name}: ${d.price} (${d.changePct}%)`)
    .join('\n')
}

/** 統計式基本盤前簡報（LLM 失敗時的後備，保證 pipeline 不中斷）。 */
function fallbackBriefing(roundDate: string, prices: Record<string, ArenaPrice>, up: MoversDatum[], down: MoversDatum[]): string {
  const pct = Object.values(prices)
    .map((p) => p.changePct)
    .filter((v): v is number => v !== undefined)
  const avg = pct.length > 0 ? (pct.reduce((a, b) => a + b, 0) / pct.length).toFixed(2) : '--'
  const lines = [
    `盤前簡報（${roundDate}，統計後備）`,
    `股票池 ${pct.length} 檔：平均漲跌 ${avg}%。`,
    `最強：${formatMovers(up, 5).replace(/\n/g, '；') || '無'}`,
    `最弱：${formatMovers(down, 5).replace(/\n/g, '；') || '無'}`,
  ]
  return lines.join('\n')
}

async function fundamentalsText(prices: Record<string, ArenaPrice>, topN: number): Promise<string> {
  const movers = [...collectMovers(prices).up, ...collectMovers(prices).down]
    .slice(0, Math.max(topN, 8))
    .sort((a, b) => sortBySymbol(a, b))
  const sel = [...new Map(movers.map((m) => [m.symbol, m])).values()].slice(0, topN)
  const provider = registry.get('yahoo-finance')
  const out: string[] = []
  for (const m of sel) {
    const resolved = /^\d{4,6}/.test(m.symbol) ? `${m.symbol}.TW` : m.symbol
    try {
      const f = await provider.getFundamentals(resolved, 'TW')
      const cap = f.marketCap ? (f.marketCap / 1e8).toFixed(0) : '--'
      out.push(
        `${m.symbol} ${m.name}: PE=${f.peRatio == null ? '--' : f.peRatio.toFixed(1)} ` +
          `殖利率=${f.dividendYield == null ? '--' : (f.dividendYield * 100).toFixed(1)}% ` +
          `市值≈${cap} 億`,
      )
    } catch {
      /* skip */
    }
  }
  return out.join('\n')
}

function sortBySymbol(a: { symbol: string }, b: { symbol: string }): number {
  return a.symbol.localeCompare(b.symbol)
}

function historySnippet(history: Record<string, ArenaHistory>, movers: MoversDatum[]): string {
  const symbols = new Set(movers.slice(0, 6).map((m) => m.symbol))
  const lines: string[] = []
  for (const m of movers) {
    if (!symbols.has(m.symbol)) continue
    const h = history[m.symbol]
    if (!h || h.length === 0) continue
    const tail = h.slice(-6).map((p) => `${p.date.slice(5)}:${p.close}`).join(' ')
    lines.push(`${m.symbol} ${m.name}: ${tail}`)
  }
  return lines.join('\n')
}

export async function buildMarketBriefing(ctx: BuildMarketBriefingParams): Promise<MarketBriefingResult> {
  const { roundDate, universe, prices, history } = ctx
  const { up, down } = collectMovers(prices)
  const all = [...up, ...down]

  const fundamentals = await fundamentalsText(prices, ctx.fundamentalsTopN ?? 10)
  const stats = [
    `股票池 ${universe.length} 檔，有報價 ${all.length} 檔；上漲 ${up.length} / 下跌 ${down.length}。`,
    `漲幅前 8：\n${formatMovers(up, 8)}`,
    `跌幅前 8：\n${formatMovers(down, 8)}`,
  ].join('\n')
  const hist = historySnippet(history, all)

  const config = loadConfig()
  const { llm } = createQuickLLM(config, { maxTokens: ctx.maxTokens ?? 900 })
  let usedFallback = false
  llm.onCall = (info) => {
    usedFallback = usedFallback || info.usedFallback
  }

  const system = [
    '你是競技場的「盤前情報官」，負責為一群 AI 投資 Agent 產出一份精簡的台股盤前簡報。',
    '任務：以資料為本，總結今日市場情緒、強弱勢族群與值得留意的標的；不給買賣建議，只給客觀情報與你的觀察重點。',
    '輸出為純文字、800 字以內、繁體中文，條列式。',
    injectionGuardNote(),
  ].join('\n')

  const user = [
    dataBlock('round_date', roundDate, 20),
    dataBlock('market_stats', stats, 2000),
    dataBlock('history_snippet', hist, 1500),
    dataBlock('fundamentals', fundamentals, 1500),
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const content = await llm.generate(system, user)
    const cleaned = sanitizeDataField(content, 2000)
    if (cleaned) return { content: cleaned, model: llm.model, fallbackUsed: usedFallback }
  } catch {
    /* fallthrough */
  }
  const back = fallbackBriefing(roundDate, prices, up, down)
  return { content: sanitizeDataField(back, 2000), model: undefined, fallbackUsed: usedFallback }
}