import { isTaiwanMarketTradingDay } from '@/utils/taiwan-calendar'

/**
 * 台灣時區的競技場階段排程（與 .github/workflows/arena-tick.yml 相同時間表）。
 * GitHub Actions `schedule` 事件常有 4~5 小時佇列延遲，導致盤中進度顯示為空；
 * 此排程在 App Service 內直接以台灣時間準時觸發，做為主要時鐘；
 * GH workflow 保留做為冪等補跑備援（tick 有 alreadyRun 防呆，重複呼叫安全）。
 *
 * 觸發方式是呼叫本機 tick route（`/api/agent-arena/tick`），
 * 使用已部署的 `SYNC_TOKEN` 走 `authorizeSync` 驗證，不需要額外密鑰。
 */

interface PhaseSpec {
  key: string
  query: string // URL query：phase/slot
  atMin: number // 當日分鐘數（台灣時間）
}

const PHASE_SCHEDULE: PhaseSpec[] = [
  { key: 'premarket', query: 'phase=premarket', atMin: 9 * 60 },
  { key: 'slot0', query: 'phase=slot&slot=0', atMin: 9 * 60 + 35 },
  { key: 'slot1', query: 'phase=slot&slot=1', atMin: 10 * 60 + 35 },
  { key: 'slot2', query: 'phase=slot&slot=2', atMin: 11 * 60 + 35 },
  { key: 'slot3', query: 'phase=slot&slot=3', atMin: 13 * 60 + 5 },
  { key: 'close', query: 'phase=close', atMin: 15 * 60 + 30 },
]

const RETRY_COOLDOWN_MS = 10 * 60 * 1000 // 10 分鐘內不重複嘗試同一個階段
const SWEEP_INTERVAL_MS = 30 * 1000
const WINDOW_MINUTES = 240 // 目標時間後 4 小時內仍允許補跑

let started = false
const lastAttemptAt: Record<string, number> = {}

function taiwanNowMinutes(): number {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  const [h, m] = s.split(':').map((v) => Number(v))
  return h * 60 + (m || 0)
}

function taiwanNowDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
}

async function triggerPhase(roundDate: string, spec: PhaseSpec): Promise<void> {
  const syncToken = process.env.SYNC_TOKEN
  const port = process.env.PORT || '3000'
  const scheme = process.env.NODE_ENV === 'production' ? 'http' : 'http'
  const url = `${scheme}://127.0.0.1:${port}/api/agent-arena/tick?date=${roundDate}&${spec.query}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(syncToken ? { Authorization: `Bearer ${syncToken}` } : {}),
    },
    body: '{}',
    signal: AbortSignal.timeout(280 * 1000),
  })
  const body = (await res.json().catch(() => null)) as {
    success?: boolean
    alreadyRun?: boolean
    errors?: string[]
    processed?: number
    trades?: number
    error?: string
  } | null
  if (!res.ok) {
    console.warn(`[ArenaScheduler] ${spec.key} HTTP ${res.status}: ${body?.error ?? res.statusText}`)
    return
  }
  if (!body?.success) {
    console.warn(`[ArenaScheduler] ${spec.key} success=false: ${body?.error ?? ''}`)
    return
  }
  if (body.alreadyRun) return
  if (body.errors?.length) {
    console.warn(
      `[ArenaScheduler] ${spec.key} errors (${body.errors.length}) processed=${body.processed} trades=${body.trades}`,
    )
  } else {
    console.log(
      `[ArenaScheduler] ${spec.key} done date=${roundDate} processed=${body.processed} trades=${body.trades}`,
    )
  }
}

async function sweep(): Promise<void> {
  const nowMin = taiwanNowMinutes()
  const roundDate = taiwanNowDate()
  const todayTw = new Date(`${roundDate}T00:00:00`)
  if (!isTaiwanMarketTradingDay(todayTw)) return

  for (const spec of PHASE_SCHEDULE) {
    if (nowMin < spec.atMin) continue
    if (nowMin > spec.atMin + WINDOW_MINUTES) continue
    const lastAt = lastAttemptAt[spec.key] ?? 0
    if (Date.now() - lastAt < RETRY_COOLDOWN_MS) continue

    lastAttemptAt[spec.key] = Date.now()
    try {
      await triggerPhase(roundDate, spec)
    } catch (e) {
      console.error(`[ArenaScheduler] ${spec.key} tick failed:`, (e as Error).message ?? e)
    }
  }
}

export function startArenaPhaseScheduler(): void {
  if (started) return
  started = true
  const timer = setInterval(() => {
    void sweep()
  }, SWEEP_INTERVAL_MS)
  timer.unref?.()
  void sweep()
}