/**
 * #23 portfolio 非 JSON 防禦 — 共用 safe-parse helper。
 *
 * 落點：`apps/web/src/lib/safe-parse.ts`（新建；repo 內尚無既有 fetch wrapper，
 * 故獨立成檔，client/server 皆可 import，零依賴）。
 *
 * 策略：
 * - 先讀 `res.text()`（fetch 自身斷線 → 丟「連線中斷」）。
 * - 再看 status＋content-type：5xx／HTML 閘道頁 → 「伺服器忙碌請重試」；
 *   其餘 → 「連線中斷」。
 * - `JSON.parse` 包 try/catch：失敗一律丟中文友善錯誤，絕不讓 V8 原生英文
 *   （Unexpected non-whitespace character…）漏到 UI。
 * - HTTP 錯誤狀態（4xx/5xx）但 body 是合法 JSON（含 { error }）時**不丟錯**，
 *   原樣回傳，讓呼叫端的 `res.ok` 分支照舊處理後端錯誤文案。
 */

export interface SafeParseMessages {
  /** 連線中斷文案（i18n：errConnectionInterrupted） */
  connectionInterrupted: string
  /** 伺服器忙碌文案（i18n：errServerBusy） */
  serverBusy: string
}

export class SafeParseError extends Error {
  readonly status: number
  readonly kind: 'connection' | 'server'

  constructor(message: string, status: number, kind: 'connection' | 'server') {
    super(message)
    this.name = 'SafeParseError'
    this.status = status
    this.kind = kind
  }
}

function pickMessage(status: number, contentType: string, messages: SafeParseMessages): { message: string; kind: 'connection' | 'server' } {
  const ct = contentType.toLowerCase()
  if (status >= 500 || status === 408 || status === 429 || ct.includes('text/html')) {
    return { message: messages.serverBusy, kind: 'server' }
  }
  return { message: messages.connectionInterrupted, kind: 'connection' }
}

/**
 * fetch 回應的安全 JSON 解析。成功（含 HTTP 錯誤但 body 為合法 JSON）回傳解析結果；
 * 空 body／非 JSON／HTML 閘道頁則 throw 中文友善的 SafeParseError。
 */
export async function parseJsonSafe<T = any>(res: Response, messages: SafeParseMessages): Promise<T> {
  const status = res.status
  const contentType = res.headers.get('content-type') ?? ''

  let text: string
  try {
    text = await res.text()
  } catch {
    throw new SafeParseError(messages.connectionInterrupted, status, 'connection')
  }

  const trimmed = text.trim()
  if (!trimmed) {
    const picked = pickMessage(status, contentType, messages)
    throw new SafeParseError(picked.message, status, picked.kind)
  }

  try {
    return JSON.parse(trimmed) as T
  } catch {
    // 截斷／HTML／閘道超時頁一律轉中文，不暴露 V8 原生訊息。
    const isHtml = trimmed.startsWith('<') || contentType.toLowerCase().includes('text/html')
    const kind: 'connection' | 'server' = status >= 500 || status === 408 || status === 429 || isHtml ? 'server' : 'connection'
    throw new SafeParseError(kind === 'server' ? messages.serverBusy : messages.connectionInterrupted, status, kind)
  }
}

/**
 * SSE `data:` 欄位的安全解析。壞塊回傳 null（呼叫端跳過、不斷流），
 * 好塊回傳解析值。絕不 throw。
 */
export function parseSseJson<T = any>(data: string): T | null {
  const trimmed = data.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as T
  } catch {
    return null
  }
}
