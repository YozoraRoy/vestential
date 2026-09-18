/**
 * 台股交易日判斷（靜態休市表＋週末判斷）。
 *
 * 資料源：臺灣證券交易所「交易日及例假日」年度休市表
 *（https://www.twse.com.tw/zh/page/trading/exchange/TWT49U），
 * 以下日期為該表 2025 / 2026 年「市場休市」日的靜態快照（人工整理）。
 * 週末判斷為確定性邏輯；國定假日快照若 TWSE 年度表異動（補班/彈性放假），
 * 請直接增修 TWSE_HOLIDAYS 並附來源，函式本身為純函式、可單測。
 *
 * 驗證方式：
 * - 週末：`isTwseTradingDay('2026-09-19') === false`（週六）、
 *   `isTwseTradingDay('2026-09-18') === true`（週五，非假日）。
 * - 國定假日：`isTwseTradingDay('2026-01-01') === false`（元旦），
 *   對照 TWSE 上述頁面年度表即可驗證。
 */

/** TWSE 公告休市的平日（YYYY-MM-DD，靜態快照；週末休市由星期判斷，不列於此）。 */
const TWSE_HOLIDAYS: ReadonlySet<string> = new Set([
  // ── 2025 ──
  '2025-01-01', // 元旦
  '2025-01-27', // 春節連假
  '2025-01-28',
  '2025-01-29',
  '2025-01-30',
  '2025-01-31',
  '2025-02-28', // 和平紀念日
  '2025-04-03', // 兒童節/清明連假
  '2025-04-04',
  '2025-05-01', // 勞動節
  '2025-05-30', // 端午節
  '2025-10-06', // 中秋節
  '2025-10-10', // 國慶日
  // ── 2026 ──
  '2026-01-01', // 元旦
  '2026-02-16', // 春節連假
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-02-27', // 228 連假（2/28 週六，2/27 補假）
  '2026-04-03', // 兒童節/清明連假
  '2026-04-06',
  '2026-05-01', // 勞動節
  '2026-06-19', // 端午節
  '2026-09-25', // 中秋節
  '2026-10-09', // 國慶連假（10/10 週六，10/9 補假）
])

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 週末或 TWSE 公告休市日 → 非交易日。非 YYYY-MM-DD 格式視為非交易日（保守）。 */
export function isTwseTradingDay(dateStr: string): boolean {
  if (!DATE_RE.test(dateStr)) return false
  const d = new Date(`${dateStr}T12:00:00+08:00`)
  if (Number.isNaN(d.getTime())) return false
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  return !TWSE_HOLIDAYS.has(dateStr)
}

/** 台北時區今日（YYYY-MM-DD）。 */
export function taipeiTodayStr(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now)
}

export type RoundFreshness =
  | { kind: 'latest' }
  | { kind: 'stale'; roundDate: string }
  | { kind: 'closed'; roundDate: string }

/**
 * 輪次新鮮度：選中輪次即今日最新 → latest；
 * 今日為非交易日 → closed（休市無新盤，截至 roundDate）；
 * 否則（交易日但選中舊篇）→ stale（舊篇截至 roundDate）。
 */
export function roundFreshness(roundDate: string, todayStr: string): RoundFreshness {
  if (roundDate >= todayStr) return { kind: 'latest' }
  if (!isTwseTradingDay(todayStr)) return { kind: 'closed', roundDate }
  return { kind: 'stale', roundDate }
}
