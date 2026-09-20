import { getTaiwanDateStr } from '@/lib/auth'

// ─── 節慶日期表（中秋 MVP）─────────────────────────────────────────
// 農曆節日無公式可算，中秋固定表需年年人工補。
// 2024–2026 為確定值；2027–2028 為推估值（待確認：需補官方／農民曆來源）。
// 獨立於 TAIWAN_MARKET_HOLIDAYS（休市日表），日期一律吃 Asia/Taipei 的
// YYYY-MM-DD 字串判斷（仿 lib/auth.ts getTaiwanDateStr）。

export type FestivalId = 'mid-autumn'

/** 中秋節（Asia/Taipei 日期）：2024–2026 確定值，2027–2028 推估值待確認。 */
export const MID_AUTUMN_DAYS: Record<string, { confirmed: boolean }> = {
  '2024-09-17': { confirmed: true },
  '2025-10-06': { confirmed: true },
  '2026-09-25': { confirmed: true },
  // TODO(待確認)：2027–2028 為推估值，需以官方／農民曆來源補正確日期。
  '2027-09-15': { confirmed: false },
  '2028-10-03': { confirmed: false },
}

export interface FestivalDay {
  id: FestivalId
  /** Asia/Taipei 的 YYYY-MM-DD。 */
  dateStr: string
  confirmed: boolean
}

/** 判斷給定 Taipei 日期字串是否為中秋當天。 */
export function isMidAutumnDay(dateStr: string): boolean {
  return dateStr in MID_AUTUMN_DAYS
}

/**
 * 判斷給定 Taipei 日期字串命中的節慶（MVP 只收中秋）。
 * 非節日回傳 null。
 */
export function getTodayFestival(todayTaipeiStr: string): FestivalDay | null {
  const hit = MID_AUTUMN_DAYS[todayTaipeiStr]
  if (!hit) return null
  return { id: 'mid-autumn', dateStr: todayTaipeiStr, confirmed: hit.confirmed }
}

/** 取當下 Asia/Taipei 日期命中的節慶（供 Server Component／cron 使用）。 */
export function getCurrentFestival(now: Date = new Date()): FestivalDay | null {
  return getTodayFestival(getTaiwanDateStr(now))
}
