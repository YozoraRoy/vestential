import { dbQueryFirst, getMarketFocusMeta } from '@stock/database'
import { getLastMarketTradingDay, isTaiwanMarketTradingDay, formatDateIso } from '@/utils/taiwan-calendar'
import { FALLBACK_SUMMARY_PREFIX } from '@/lib/email'

export interface HealthIssue {
  code: string
  severity: 'error' | 'warn'
  message: string
}

export interface HealthReport {
  ok: boolean
  generatedAt: string
  total: number
  issues: HealthIssue[]
  checks: Record<string, any>
}

export const MARKET_FOCUS_STALE_MS = 5 * 60 * 60 * 1000

function toCompact(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export async function runHealthChecks(): Promise<HealthReport> {
  const issues: HealthIssue[] = []
  const now = Date.now()
  const checks: Record<string, any> = {}

  // ── market_focus 資料 ──────────────────────────────────────────
  try {
    const count = await dbQueryFirst<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM market_focus')
    const latest = await dbQueryFirst<{ d: string | null }>('SELECT MAX(published_at) AS d FROM market_focus')
    const nullContent = await dbQueryFirst<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM market_focus WHERE content IS NULL OR content = ''",
    )
    checks.marketFocus = {
      count: count?.cnt ?? 0,
      latestPublishedAt: latest?.d ?? null,
      nullContentCount: nullContent?.cnt ?? 0,
    }

    if (!(count?.cnt)) {
      issues.push({ code: 'mf_empty', severity: 'error', message: 'market_focus 完全沒有資料' })
    } else if ((nullContent?.cnt ?? 0) > Math.ceil((count?.cnt ?? 0) / 2)) {
      issues.push({
        code: 'mf_null_content',
        severity: 'error',
        message: `market_focus 有 ${nullContent?.cnt ?? 0}/${count?.cnt ?? 0} 則內容為空(抓取失敗)`,
      })
    }
  } catch (e: any) {
    issues.push({ code: 'mf_query_error', severity: 'error', message: `market_focus 查詢失敗: ${e.message}` })
  }

  // ── market_focus_meta 鮮度 ─────────────────────────────────────
  try {
    const meta = await getMarketFocusMeta()
    checks.marketFocusMeta = {
      exists: !!meta?.summary,
      generatedAt: meta?.generated_at ?? null,
      isFallback: !!meta?.summary && meta.summary.startsWith(FALLBACK_SUMMARY_PREFIX),
    }
    const ts = meta?.generated_at ? new Date(meta.generated_at).getTime() : NaN
    if (!meta?.summary) {
      issues.push({ code: 'mf_meta_missing', severity: 'error', message: 'market_focus_meta 沒有內容(從未成功產生?每日總覽會寄信失敗)' })
    } else if (Number.isNaN(ts) || now - ts > MARKET_FOCUS_STALE_MS) {
      issues.push({ code: 'mf_stale', severity: 'error', message: `market_focus 最後更新已超過 5 小時: ${meta.generated_at}` })
    } else if (meta.summary.startsWith(FALLBACK_SUMMARY_PREFIX)) {
      issues.push({ code: 'mf_fallback', severity: 'warn', message: '每日總覽正在使用標題拼接 fallback(LLM 主/備援皆失敗)' })
    }
  } catch (e: any) {
    issues.push({ code: 'mf_meta_error', severity: 'error', message: `market_focus_meta 查詢失敗: ${e.message}` })
  }

  // ── odd_lot 最新交易日 ─────────────────────────────────────────
  try {
    const lastTradingDay = getLastMarketTradingDay()
    const expected = toCompact(lastTradingDay)
    const row = await dbQueryFirst<{ d: string | null }>('SELECT MAX(date) AS d FROM odd_lot_trades')
    checks.oddLot = { latestDate: row?.d ?? null, expectedDate: expected, expectedIso: formatDateIso(lastTradingDay) }
    if (!row?.d) {
      issues.push({ code: 'oddlot_empty', severity: 'error', message: 'odd_lot_trades 完全沒有資料' })
    } else if (row.d < expected) {
      issues.push({
        code: 'oddlot_stale',
        severity: 'error',
        message: `odd_lot 最新交易日 ${row.d} 早於最近交易日 ${expected}`,
      })
    }
  } catch (e: any) {
    issues.push({ code: 'oddlot_error', severity: 'error', message: `odd_lot 查詢失敗: ${e.message}` })
  }

  // ── 資料庫連線 ─────────────────────────────────────────────────
  try {
    await dbQueryFirst('SELECT 1 AS ok')
    checks.db = { ok: true }
  } catch (e: any) {
    checks.db = { ok: false, error: e.message }
    issues.push({ code: 'db_error', severity: 'error', message: `資料庫連線失敗: ${e.message}` })
  }

  // ── 核心套件 import ────────────────────────────────────────────
  try {
    await import('@stock/ai-engine')
    checks.imports = { aiEngine: true }
  } catch (e: any) {
    checks.imports = { aiEngine: false, error: e.message }
    issues.push({ code: 'import_error', severity: 'error', message: `ai-engine 載入失敗: ${e.message}` })
  }

  // ── 關鍵環境變數 ───────────────────────────────────────────────
  const envChecks: Record<string, boolean> = {}
  envChecks.OPENAI_API_KEY = !!process.env.OPENAI_API_KEY
  envChecks.FALLBACK_QUICK_LLM_API_KEY = !!process.env.FALLBACK_QUICK_LLM_API_KEY
  envChecks.FALLBACK2_QUICK_LLM_API_KEY = !!process.env.FALLBACK2_QUICK_LLM_API_KEY
  envChecks.AUTH_SECRET = !!process.env.AUTH_SECRET
  envChecks.SYNC_TOKEN = !!process.env.SYNC_TOKEN
  envChecks.DATABASE_URL_OR_PATH =
    process.env.NODE_ENV === 'production'
      ? !!(process.env.DATABASE_URL || process.env.DATABASE_PATH)
      : true
  checks.env = envChecks
  for (const [name, ok] of Object.entries(envChecks)) {
    if (!ok) issues.push({ code: `env_${name.toLowerCase()}`, severity: 'error', message: `環境變數 ${name} 未設定` })
  }

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    generatedAt: new Date().toISOString(),
    total: issues.length,
    issues,
    checks,
  }
}

/** 判斷當日(Asia/Taipei)是否為台股交易日,供 odd-lot 修復使用。 */
export function shouldRepairOddLot(current: HealthReport): boolean {
  const stale = current.issues.some((i) => i.code === 'oddlot_stale' || i.code === 'oddlot_empty')
  if (!stale) return false
  const now = new Date()
  const nowTw = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now)
  const todayTw = new Date(`${nowTw}T00:00:00`)
  return isTaiwanMarketTradingDay(todayTw)
}