import { revalidateTag } from 'next/cache'
import type { MarketFocusItem } from '@stock/database'
import { getMarketFocusMeta } from '@stock/database'
import { refreshMarketFocus, previewMarketFocus } from '@/lib/market-focus'
import { sendMarketFocusAlert, sendMarketFocusSummary, isSummaryFallback } from '@/lib/email'
import { triggerSocialPublish } from '@/lib/social-trigger'
import type { SocialPostPlatform } from '@stock/database'

// ─── 市場焦點背景 Job ─────────────────────────────────────────────
// 整個 refresh / publish 管線（抓新聞 → AI 過濾 → 爬全文 → 摘要 → 總覽 → email/社群）
// 改為背景執行並回傳 jobId，避免同步阻塞 HTTP 回應超過 Azure 240s 網關上限 (504)。
// 呼叫端（GitHub Actions 排程 / 後台 UI）輪詢 status 端點取得結果。

export type MarketFocusJobKind = 'refresh' | 'publish' | 'dry'
export type MarketFocusJobStatus = 'running' | 'done' | 'failed'

export interface MarketFocusSocialResult {
  platform: SocialPostPlatform
  status: string
  error?: string | null
}

export interface MarketFocusJob {
  id: string
  kind: MarketFocusJobKind
  status: MarketFocusJobStatus
  alsoSocial: boolean
  startedAt: string
  finishedAt: string | null
  error: string | null
  count: number | null
  editionKey: string | null
  timestamp: string | null
  /** 僅 kind='dry'：乾跑總覽與精選清單（未寫入 DB）。 */
  summary?: string | null
  items?: { title: string; source: string | null; reason: string | null }[] | null
  /** 僅 refresh/publish：社群小編發布結果。 */
  socialResults?: MarketFocusSocialResult[] | null
}

const JOBS = new Map<string, MarketFocusJob>()
const MAX_KEPT_JOBS = 20
let activeJobId: string | null = null

function makeJobId(): string {
  return `mf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function trimJobs(): void {
  if (JOBS.size <= MAX_KEPT_JOBS) return
  const finished = [...JOBS.entries()]
    .filter(([, j]) => j.status !== 'running')
    .sort((a, b) => a[1].startedAt.localeCompare(b[1].startedAt))
  let overflow = JOBS.size - MAX_KEPT_JOBS
  for (const [id] of finished) {
    if (overflow <= 0) break
    JOBS.delete(id)
    overflow -= 1
  }
}

/**
 * 啟動市場焦點背景 Job。
 * - kind='refresh'：寫入 DB + email + 社群（供 GitHub 排程呼叫）。
 * - kind='publish'：寫入 DB + email，並依 alsoSocial 決定是否觸發社群（後台手動發布）。
 * - kind='dry'：僅乾跑預覽，不寫 DB（後台預覽）。
 * 若已有 Job 執行中，直接回傳該 Job，避免重疊執行。
 */
export function startMarketFocusJob(options: { kind: MarketFocusJobKind; alsoSocial?: boolean }): MarketFocusJob {
  if (activeJobId) {
    const running = JOBS.get(activeJobId)
    if (running?.status === 'running') return running
  }

  const kind = options.kind
  const job: MarketFocusJob = {
    id: makeJobId(),
    kind,
    status: 'running',
    alsoSocial: kind === 'refresh' ? true : !!options.alsoSocial,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    count: null,
    editionKey: null,
    timestamp: null,
    summary: null,
    items: null,
    socialResults: null,
  }
  JOBS.set(job.id, job)
  activeJobId = job.id
  void runJob(job)
  trimJobs()
  return job
}

export function getMarketFocusJob(id: string): MarketFocusJob | null {
  return JOBS.get(id) ?? null
}

async function runJob(job: MarketFocusJob): Promise<void> {
  try {
    if (job.kind === 'dry') {
      const { items, summary } = await previewMarketFocus()
      job.items = items.map((it: MarketFocusItem) => ({ title: it.title, source: it.source, reason: it.reason }))
      job.summary = summary
      job.count = items.length
    } else {
      const items = await refreshMarketFocus()
      revalidateTag('market-focus')
      job.count = items.length
      const meta = await getMarketFocusMeta()
      job.editionKey = meta?.generated_at ?? null
      job.timestamp = new Date().toISOString()

      // Email：回退偵測同原流程
      try {
        if (meta?.summary && isSummaryFallback(meta.summary)) {
          await sendMarketFocusAlert('LLM 每日總覽回退', '主模型與備援皆失敗,每日總覽以新聞標題拼接呈現。')
        } else {
          await sendMarketFocusSummary()
        }
      } catch (e: any) {
        console.error('[MarketFocusJob] email dispatch error:', e)
      }

      // 社群：refresh 必發；publish 依勾選
      if (job.kind === 'refresh' || job.alsoSocial) {
        try {
          const social = await triggerSocialPublish()
          job.socialResults = social?.results ?? []
        } catch (e: any) {
          console.error('[MarketFocusJob] social publish error:', e)
          job.socialResults = [{ platform: 'instagram', status: 'failed', error: e?.message ?? String(e) }]
        }
      }
    }
    job.status = 'done'
    job.finishedAt = new Date().toISOString()
  } catch (e: any) {
    job.status = 'failed'
    job.error = (e?.message ?? String(e)).slice(0, 500)
    job.finishedAt = new Date().toISOString()
    if (job.kind === 'refresh' || job.kind === 'publish') {
      try {
        await sendMarketFocusAlert('refresh 失敗', job.error ?? '')
      } catch {}
    }
  } finally {
    if (activeJobId === job.id) activeJobId = null
  }
}