/**
 * Issue #30：風險總結前端暫存（localStorage）。
 *
 * 暫存 key 口徑：`vestential:risk-summary:{台灣日期}:{持倉快照hash}`
 * - 台灣日期：與後端 quota 重置一致（Asia/Taipei YYYY-MM-DD；對齊 lib/auth.ts getTaiwanDateStr）。
 * - 持倉快照 hash：盡量與後端 loadRiskSnapshot 去重口徑一致——去重 key 為
 *   `${market}:${代號大寫}`、同 key 只取最新一筆（records API 以 id DESC 回傳，
 *   陣列中首次出現即最新），快照欄位取「代號＋股數＋現價」，排序後拼串做 FNV-1a hash。
 * - 已知分歧（殘留風險）：前端手邊只有 history（records?limit=20），後端快照用
 *   limit=100；同一標的歷史紀錄超過 20 筆時，兩邊看到的「最新一筆」可能不同。
 */

export const RISK_SUMMARY_KEY_PREFIX = 'vestential:risk-summary:'

export interface HoldingsSnapshotInput {
  market: string
  symbol: string
  shares: unknown
  current_price: unknown
}

export interface RiskSummaryCacheValue {
  summary: string
  dataAsOf: string
  savedAt: number
}

export interface RiskSummaryCacheEntry extends RiskSummaryCacheValue {
  dateStr: string
  hash: string
}

/** 前端版台灣日期（與後端 getTaiwanDateStr 同口徑：Asia/Taipei YYYY-MM-DD）。 */
export function getTaiwanDateStrClient(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(date)
}

function toNum(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? v : null
}

function fnv1aHex(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * 持倉快照 hash（代號＋股數＋現價）。
 * 去重對齊後端：key=`${market}:${代號大寫}`，同 key 取陣列中第一筆（最新）。
 */
export function buildHoldingsHash(records: HoldingsSnapshotInput[]): string {
  const latest = new Map<string, { symbol: string; shares: number | null; price: number | null }>()
  for (const r of records) {
    const m = r.market === 'us' ? 'us' : 'tw'
    const symbol = String(r.symbol ?? '').trim().toUpperCase()
    if (!symbol) continue
    const key = `${m}:${symbol}`
    if (!latest.has(key)) {
      latest.set(key, { symbol: key, shares: toNum(r.shares), price: toNum(r.current_price) })
    }
  }
  const parts = [...latest.values()]
    .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
    .map((h) => `${h.symbol}|${h.shares ?? '?'}|${h.price ?? '?'}`)
  return fnv1aHex(parts.join(';'))
}

export function riskSummaryKey(dateStr: string, hash: string): string {
  return `${RISK_SUMMARY_KEY_PREFIX}${dateStr}:${hash}`
}

function parseEntry(key: string, raw: string | null): RiskSummaryCacheEntry | null {
  if (!raw) return null
  const tail = key.slice(RISK_SUMMARY_KEY_PREFIX.length)
  const sep = tail.indexOf(':')
  if (sep < 0) return null
  try {
    const v = JSON.parse(raw) as Partial<RiskSummaryCacheValue>
    if (typeof v.summary !== 'string' || !v.summary) return null
    return {
      summary: v.summary,
      dataAsOf: typeof v.dataAsOf === 'string' ? v.dataAsOf : '',
      savedAt: typeof v.savedAt === 'number' ? v.savedAt : 0,
      dateStr: tail.slice(0, sep),
      hash: tail.slice(sep + 1),
    }
  } catch {
    return null
  }
}

export function saveRiskSummary(dateStr: string, hash: string, value: RiskSummaryCacheValue): void {
  try {
    window.localStorage.setItem(riskSummaryKey(dateStr, hash), JSON.stringify(value))
  } catch {
    // localStorage 不可用（隱私模式等）時靜默略過，不炸版
  }
}

/** 取出指定日期的全部暫存（當日多 hash 時並存；呼叫端以 hash 判斷沿用／重按）。 */
export function findRiskSummariesByDate(dateStr: string): RiskSummaryCacheEntry[] {
  const out: RiskSummaryCacheEntry[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith(RISK_SUMMARY_KEY_PREFIX)) continue
      const entry = parseEntry(key, window.localStorage.getItem(key))
      if (entry && entry.dateStr === dateStr) out.push(entry)
    }
  } catch {
    return []
  }
  out.sort((a, b) => b.savedAt - a.savedAt)
  return out
}

/** 清掉非當日的舊暫存（跨日不沿用；順手清避免 key 越積越多）。 */
export function pruneOldRiskSummaries(today: string): void {
  try {
    const stale: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith(RISK_SUMMARY_KEY_PREFIX)) continue
      const tail = key.slice(RISK_SUMMARY_KEY_PREFIX.length)
      const datePart = tail.slice(0, tail.indexOf(':'))
      if (datePart !== today) stale.push(key)
    }
    for (const k of stale) window.localStorage.removeItem(k)
  } catch {
    // 忽略
  }
}
