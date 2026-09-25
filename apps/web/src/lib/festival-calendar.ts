import { getTaiwanDateStr } from '@/lib/auth'

// ─── 節慶日期表（中秋 MVP）─────────────────────────────────────────
// 農曆節日無公式可算，中秋固定表需年年人工補。
// 2024–2025 為確定值（單日）；2026 為確定值，09/25～09/29 連假區間顯示
// 首頁橫幅＋節慶發布（含首尾）；2027–2028 為推估值（待確認：需補官方／農民曆來源）。
// 獨立於 TAIWAN_MARKET_HOLIDAYS（休市日表），日期一律吃 Asia/Taipei 的
// YYYY-MM-DD 字串判斷（仿 lib/auth.ts getTaiwanDateStr）。

export type FestivalId = 'mid-autumn'

/** 中秋節（Asia/Taipei 日期）：2024–2025 確定值（單日）；2026 為 09/25～09/29 區間；2027–2028 推估值待確認。 */
export const MID_AUTUMN_DAYS: Record<string, { confirmed: boolean }> = {
  '2024-09-17': { confirmed: true },
  '2025-10-06': { confirmed: true },
  '2026-09-25': { confirmed: true },
  '2026-09-26': { confirmed: true },
  '2026-09-27': { confirmed: true },
  '2026-09-28': { confirmed: true },
  '2026-09-29': { confirmed: true },
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

/** 判斷給定 Taipei 日期字串是否落在中秋顯示區間內。 */
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

/**
 * 依 Asia/Taipei 日期字串做穩定 hash，從文案池挑一則：同一天永遠同一則，
 * 換日才輪換（供首頁橫幅 i18n festival.midAutumn.messages 輪播用）。
 */
export function pickFestivalMessage(messages: readonly string[], dateStr: string): string {
  if (messages.length === 0) return ''
  let h = 0
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0
  }
  return messages[h % messages.length] ?? ''
}
