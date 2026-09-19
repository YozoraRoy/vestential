/**
 * 台股代號驗證（`/analyze` 前台＋`/api/analyze` 後端共用）：
 * 僅接受純數字 4~6 碼，可附 `.TW` / `.TWO`（大小寫皆可）。
 * - `2330`、`2330.tw`、`2330.TWO` → 合法
 * - `AAPL`、`SPCX`、`TSLA`、`2330.US`、`ABC123`、`123`（3 碼）→ 非法
 */

/** 台股格式（大小寫不敏感；呼叫端先 trim，後端另做正規化）。 */
const TAIWAN_SYMBOL_RE = /^\d{4,6}(\.(TW|TWO))?$/i

/** 去前後空白後是否符合台股格式。 */
export function isTaiwanSymbol(input: string): boolean {
  return TAIWAN_SYMBOL_RE.test(input.trim())
}

/** 正規化為大寫 Yahoo 代號（去空白＋大寫；純數字保持原樣，由 engine 探測 `.TW`／`.TWO`）。 */
export function normalizeTaiwanSymbol(input: string): string {
  return input.trim().toUpperCase()
}
