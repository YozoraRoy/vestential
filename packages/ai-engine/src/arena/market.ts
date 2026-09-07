import { loadConfig } from '@stock/core'
import { registry } from '@stock/market-data'
import { DEFAULT_ARENA_UNIVERSE, type ArenaHistory, type ArenaPrice, type ArenaUniverseItem } from './types.js'

/** 移植自 engine.ts 的台股代號解析：純數字代號依序試 .TW / .TWO。 */
export async function resolveTwSymbol(raw: string): Promise<string> {
  const trimmed = raw.trim().toUpperCase()
  if (trimmed.endsWith('.TW') || trimmed.endsWith('.TWO')) return trimmed
  if (!/^\d{4,6}$/.test(trimmed)) return trimmed

  const provider = registry.get('yahoo-finance')
  for (const suffix of ['TW', 'TWO']) {
    try {
      const q = await provider.getQuote(`${trimmed}.${suffix}`, 'TW')
      if (q && q.price > 0) return `${trimmed}.${suffix}`
    } catch {
      /* try next */
    }
  }
  return trimmed
}

export interface LoadedArenaPrice extends ArenaPrice {
  /** 已解析的 Yahoo 代號（含後綴），寫交易日誌用。 */
  resolvedSymbol?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * 抓取股票池本輪報價與近 N 日歷史走勢。
 * @param universe 股票池（symbol 為無後綴代號）
 * @param roundDate YYYY-MM-DD（當日或歷史重播日）
 * @param lookbackDays 每檔回推的歷史天數
 * @param gapMs 兩次 Yahoo 呼叫間隔，避免觸發限流
 */
export async function fetchArenaMarket(
  universe: ArenaUniverseItem[],
  roundDate: string,
  lookbackDays = 10,
  gapMs = 120,
): Promise<{ prices: Record<string, LoadedArenaPrice>; history: Record<string, ArenaHistory> }> {
  const provider = registry.get('yahoo-finance')
  const prices: Record<string, LoadedArenaPrice> = {}
  const history: Record<string, ArenaHistory> = {}

  const entries = await mapConcurrent(universe, 5, async (item) => {
    await sleep(gapMs)
    const resolved = await resolveTwSymbol(item.symbol)
    const hist: ArenaHistory = []
    try {
      const data = await provider.getHistory(resolved, 'TW', undefined, undefined)
      const rounds = data
        .filter((r) => r.timestamp <= Date.now())
        .sort((a, b) => b.timestamp - a.timestamp)

      const target = new Date(`${roundDate}T23:59:59`).getTime()
      const snap = rounds.find((r) => {
        const d = new Date(r.timestamp)
        return d.toISOString().slice(0, 10) === roundDate
      })

      const lookbackStart = target - (lookbackDays + 8) * 86_400_000
      const recent = rounds
        .filter((r) => r.timestamp <= target && r.timestamp >= lookbackStart)
        .sort((a, b) => a.timestamp - b.timestamp)
      for (const r of recent) {
        hist.push({ date: new Date(r.timestamp).toISOString().slice(0, 10), close: r.close })
      }

      const px = snap ?? recent[recent.length - 1]
      if (!px) return null

      let pct: number | undefined = undefined
      if (pct === undefined && recent.length >= 2) {
        const prev = recent[recent.length - 2].close
        pct = prev > 0 ? Math.round(((recent[recent.length - 1].close - prev) / prev) * 10000) / 100 : 0
      }

      return {
        resolved,
        price: Math.round(px.close * 100) / 100,
        changePct: pct !== undefined ? Math.round(pct * 100) / 100 : undefined,
        history: hist,
      }
    } catch {
      return null
    }
  })

  entries.forEach((entry, i) => {
    const item = universe[i]
    if (!entry) return
    prices[item.symbol] = {
      symbol: item.symbol,
      symbolName: item.name,
      price: entry.price,
      changePct: entry.changePct,
      date: entry.history[entry.history.length - 1].date,
      resolvedSymbol: entry.resolved,
    }
    history[item.symbol] = entry.history
  })

  return { prices, history }
}

export function parseArenaUniverse(raw: string | undefined): ArenaUniverseItem[] {
  if (!raw?.trim()) return DEFAULT_ARENA_UNIVERSE
  const items: ArenaUniverseItem[] = []
  for (const part of raw.split(',')) {
    const m = part.trim().match(/^(\d{4,6})\s*([^\s,]*)$/)
    if (m) items.push({ symbol: m[1], name: m[2] || m[1] })
  }
  return items.length > 0 ? items : DEFAULT_ARENA_UNIVERSE
}

export function loadArenaConfig() {
  return loadConfig()
}