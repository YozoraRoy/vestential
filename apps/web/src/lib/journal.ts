/**
 * Issue #21 交易日誌：輸入驗證＋統計純計算（單一實作）。
 * - 月統計（筆數/勝率/平均賺賠/最大回撤筆）與 AI 覆盤皆由此函式重算，
 *   保證數字與明細加總一致。
 * - 純函式，前後端共用（stats route、review route、/journal 頁顯示）。
 */

export type JournalDirection = 'long' | 'short'

export interface JournalEntryLike {
  id?: number
  trade_date: string
  symbol: string
  direction: string
  entry_price: number
  exit_price: number
  shares: number
  reason: string
  stop_loss_obeyed: number | boolean
}

/** 覆盤最低筆數門檻：<5 筆擋下，提示先記帳。 */
export const JOURNAL_MIN_REVIEW_COUNT = 5

export interface JournalInput {
  tradeDate: string
  symbol: string
  direction: JournalDirection
  entryPrice: number
  exitPrice: number
  shares: number
  reason: string
  stopLossObeyed: boolean
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * 驗證日誌輸入。必填缺一即擋，錯誤訊息具名指出欄位
 * （日期/標的/方向/進場價/出場價/股數/理由/停損遵守與否）。
 */
export function validateJournalInput(body: any): { ok: true; data: JournalInput } | { ok: false; error: string; missing: string[] } {
  const missing: string[] = []

  const tradeDate = typeof body?.tradeDate === 'string' ? body.tradeDate.trim() : ''
  if (!tradeDate) missing.push('日期')

  const symbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  if (!symbol) missing.push('標的')

  const direction: JournalDirection | null =
    body?.direction === 'long' || body?.direction === 'short' ? body.direction : null
  if (!direction) missing.push('方向')

  const entryPrice = toNum(body?.entryPrice)
  const exitPrice = toNum(body?.exitPrice)
  if (entryPrice == null || !(entryPrice > 0)) missing.push('進場價')
  if (exitPrice == null || !(exitPrice > 0)) missing.push('出場價')

  const shares = toNum(body?.shares)
  if (shares == null || !(shares > 0)) missing.push('股數')

  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (!reason) missing.push('理由')

  const stopRaw = body?.stopLossObeyed
  const stopLossObeyed: boolean | null =
    stopRaw === true || stopRaw === 1 || stopRaw === '1' || stopRaw === 'true' ? true
    : stopRaw === false || stopRaw === 0 || stopRaw === '0' || stopRaw === 'false' ? false
    : null
  if (stopLossObeyed == null) missing.push('停損遵守與否')

  if (missing.length > 0) {
    return { ok: false, error: `缺少必填欄位：${missing.join('、')}`, missing }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) {
    return { ok: false, error: '日期格式錯誤（請用 YYYY-MM-DD）', missing: ['日期'] }
  }

  return {
    ok: true,
    data: {
      tradeDate,
      symbol,
      direction: direction as JournalDirection,
      entryPrice: entryPrice as number,
      exitPrice: exitPrice as number,
      shares: shares as number,
      reason,
      stopLossObeyed: stopLossObeyed as boolean,
    },
  }
}

/** 單筆損益：做多 (出場-進場)×股數；做空 (進場-出場)×股數。 */
export function computeJournalPnl(e: JournalEntryLike): number {
  const diff = e.direction === 'short' ? e.entry_price - e.exit_price : e.exit_price - e.entry_price
  return diff * e.shares
}

export interface JournalStats {
  count: number
  wins: number
  losses: number
  winRate: number | null
  totalPnl: number
  avgPnl: number | null
  /** 最大回撤筆：單筆虧損最大者（全勝時為 null）。 */
  maxLossEntry: { id?: number; symbol: string; tradeDate: string; pnl: number } | null
  stopLossObeyedCount: number
  stopLossViolatedCount: number
}

/** 純計算：由明細重算筆數/勝率/平均賺賠/最大回撤筆。 */
export function computeJournalStats(entries: JournalEntryLike[]): JournalStats {
  const count = entries.length
  if (count === 0) {
    return {
      count: 0, wins: 0, losses: 0, winRate: null, totalPnl: 0, avgPnl: null,
      maxLossEntry: null, stopLossObeyedCount: 0, stopLossViolatedCount: 0,
    }
  }
  const pnls = entries.map((e) => ({ e, pnl: computeJournalPnl(e) }))
  const wins = pnls.filter((p) => p.pnl > 0).length
  const losses = pnls.filter((p) => p.pnl < 0).length
  const totalPnl = pnls.reduce((s, p) => s + p.pnl, 0)
  const worst = pnls.reduce((a, b) => (b.pnl < a.pnl ? b : a))
  return {
    count,
    wins,
    losses,
    winRate: (wins / count) * 100,
    totalPnl,
    avgPnl: totalPnl / count,
    maxLossEntry: worst.pnl < 0
      ? { id: worst.e.id, symbol: worst.e.symbol, tradeDate: worst.e.trade_date, pnl: worst.pnl }
      : null,
    stopLossObeyedCount: entries.filter((e) => Number(e.stop_loss_obeyed) === 1).length,
    stopLossViolatedCount: entries.filter((e) => Number(e.stop_loss_obeyed) !== 1).length,
  }
}

/**
 * AI 覆盤 system prompt（Issue #21 風險對策 Wortlaut）：
 * - 只准引用日誌原文筆次，不臆測未寫動機；
 * - 不輸出未來買賣點，只做紀律/勝率歸因。
 */
export const JOURNAL_REVIEW_SYSTEM_PROMPT = [
  '你是交易紀律覆盤員，只能依據使用者提供的交易日誌原文做紀律／勝率歸因。',
  '硬性規則（違反即不合格）：',
  '1. 只准引用日誌原文出現過的筆次（以 #id 指稱），嚴禁推論、臆測日誌未寫的動機、情緒或盤勢原因。',
  '2. 不輸出任何未來買賣點：嚴禁出現「建議買進／賣出／加碼／停損價／目標價」等前瞻交易指示。',
  '3. 只做紀律與勝率歸因：輸出「紀律問題 Top-3」（每項附具體筆次引用，如 #12、#15）＋停損遵守統計。',
  '以繁體中文（台灣習慣用語）輸出，直陳事實，禁用贅詞與心靈雞湯。',
].join('\n')
