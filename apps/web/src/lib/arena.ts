import {
  runArenaRound,
  LightweightStrategist,
  buildDefaultDailyUniverse,
  fetchArenaMarket,
  fetchArenaLivePrices,
  normalizeArenaStrategyParams,
  type ArenaHolding,
  type ArenaStore,
  type ArenaStrategist,
  type ArenaUniverseItem,
  type ArenaIntradayPriceRecord,
  type ArenaDecisionLogRecord,
  type ArenaLedgerEntry,
} from '@stock/ai-engine'
import {
  listActiveArenaAgents,
  getArenaHoldings,
  replaceArenaHoldings,
  insertArenaTrade,
  upsertArenaSnapshot,
  updateArenaAgentLastRound,
  updateArenaAgentCash,
  saveArenaIntradayPrices,
  saveArenaMarketBriefing,
  insertArenaDecisionLog,
  saveArenaDiscussion,
  ensureActiveArenaSeason,
  dbQueryFirst,
  getArenaMarketBriefing,
  getArenaTradesByRound,
  getArenaRoundProgress,
  markArenaRoundProgress,
  clearArenaRoundProgress,
  clearArenaPhaseArtifacts,
  replaceArenaRoundUniverse,
  getArenaRoundUniverse,
} from '@stock/database'
import type { ArenaAgentRecord, ArenaTradeRecord, ArenaSnapshotRecord } from '@stock/ai-engine'

/** 本地實作 ArenaStore seam：以 @stock/database 的 arena_* 資料層落地。 */
export function dbArenaStore(): ArenaStore {
  return {
    async listActiveAgents(): Promise<ArenaAgentRecord[]> {
      const rows = await listActiveArenaAgents()
      return rows.map((r) => {
        let parsedParams: unknown = null
        if (r.strategy_params) {
          try {
            parsedParams = JSON.parse(r.strategy_params)
          } catch {}
        }
        return {
          id: r.id,
          ownerUserId: String(r.owner_user_id),
          name: r.name,
          division: r.division,
          strategyId: r.strategy_id,
          tone: r.tone,
          initialCapital: r.initial_capital,
          cash: r.cash,
          status: r.status,
          lastRoundDate: r.last_round_date ?? null,
          seasonId: r.season_id > 0 ? r.season_id : null,
          seasonName: null,
          personality: r.personality ?? null,
          strategyParams: normalizeArenaStrategyParams(parsedParams),
        }
      })
    },

    async getHoldings(agentId: number): Promise<ArenaHolding[]> {
      const rows = await getArenaHoldings(agentId)
      return rows.map((h) => ({
        symbol: h.symbol,
        symbolName: h.symbol_name ?? undefined,
        shares: h.shares,
        avgCost: h.avg_cost,
      }))
    },

    async replaceHoldings(agentId: number, holdings: ArenaHolding[], roundDate: string): Promise<void> {
      await replaceArenaHoldings(
        agentId,
        holdings.map((h) => ({
          symbol: h.symbol,
          symbolName: h.symbolName ?? null,
          shares: h.shares,
          avgCost: h.avgCost,
          roundDate,
        })),
      )
    },

    async insertTrade(record: ArenaTradeRecord): Promise<void> {
      await insertArenaTrade({
        agentId: record.agentId,
        roundDate: record.roundDate,
        slot: record.slot ?? null,
        action: record.action,
        symbol: record.symbol ?? null,
        symbolName: record.symbolName ?? null,
        shares: record.shares ?? null,
        price: record.price ?? null,
        fee: record.fee ?? null,
        tax: record.tax ?? null,
        reason: record.reason ?? null,
        model: record.model ?? null,
        fallbackUsed: record.fallbackUsed ?? false,
        error: record.error ?? null,
      })
    },

    async getRoundTrades(agentId: number, roundDate: string) {
      const rows = await getArenaTradesByRound(agentId, roundDate)
      return rows.map((r) => ({
        slot: r.slot ?? null,
        action: String(r.action),
        error: r.error ?? null,
      }))
    },

    async insertSnapshot(snapshot: ArenaSnapshotRecord): Promise<void> {
      await upsertArenaSnapshot({
        agentId: snapshot.agentId,
        seasonId: snapshot.seasonId ?? -1,
        roundDate: snapshot.roundDate,
        cash: snapshot.cash,
        equity: snapshot.equity,
        returnPct: snapshot.returnPct,
      })
    },

    async advanceRound(agentId: number, roundDate: string, cash: number): Promise<void> {
      await updateArenaAgentLastRound(agentId, roundDate)
      await updateArenaAgentCash(agentId, cash)
    },

    async saveIntradayPrices(rows: ArenaIntradayPriceRecord[]): Promise<void> {
      await saveArenaIntradayPrices(rows)
    },

    async saveMarketBriefing(roundDate: string, content: string, model?: string | null, fallbackUsed?: boolean | null): Promise<void> {
      await saveArenaMarketBriefing(roundDate, content, model, fallbackUsed)
    },

    async getMarketBriefing(roundDate: string) {
      const row = await getArenaMarketBriefing(roundDate)
      if (!row) return null
      return { content: row.content, fallbackUsed: !!row.fallback_used }
    },

    async insertDecisionLog(record: ArenaDecisionLogRecord): Promise<void> {
      await insertArenaDecisionLog({
        agentId: record.agentId,
        seasonId: record.seasonId,
        roundDate: record.roundDate,
        phase: record.phase,
        slot: record.slot,
        content: record.content,
        model: record.model,
        fallbackUsed: record.fallbackUsed,
      })
    },

    async saveDiscussion(roundDate: string, content: string, model?: string | null, fallbackUsed?: boolean | null): Promise<void> {
      await saveArenaDiscussion(roundDate, content, model, fallbackUsed)
    },
  }
}

let strategistInstance: ArenaStrategist | null = null

export function getArenaStrategist(): ArenaStrategist {
  if (!strategistInstance) {
    strategistInstance = new LightweightStrategist()
  }
  return strategistInstance
}

/** 台灣時區當日日期（YYYY-MM-DD）——競技場以台股交易日為輪次。 */
export function arenaTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
}

export interface ArenaTickResult {
  roundDate: string
  alreadyRun: boolean
  universeSize: number
  processed: number
  trades: number
  errors: string[]
  modelCalls: number
  slots?: number
  premarket?: boolean
  discussion?: boolean
  phase?: string
  executedSlot?: number
}

let tickGate: Promise<ArenaTickResult> | null = null

const SLOT_MAP: Record<number, string> = { 0: 'slot0', 1: 'slot1', 2: 'slot2', 3: 'slot3', 4: 'slot4', 5: 'slot5' }

/** 執行單日競技場 tick（支援分段 phase 與完整流程）。 */
export async function runArenaTick(
  roundDate: string,
  opts?: { phase?: 'premarket' | 'slot' | 'close'; slot?: number; force?: boolean },
): Promise<ArenaTickResult> {
  const phase = opts?.phase
  const slot = opts?.slot
  const force = opts?.force ?? false

  // ── 冪等檢查 ─────────────────────────────────────────────────
  if (phase) {
    const phaseKey = phase === 'slot' ? SLOT_MAP[slot ?? 0] : phase
    if (!phaseKey) return { roundDate, alreadyRun: true, universeSize: 0, processed: 0, trades: 0, errors: ['slot index missing'], modelCalls: 0 }
    const done = await getArenaRoundProgress(roundDate, phaseKey)
    if (done && !force) return { roundDate, alreadyRun: true, universeSize: 0, processed: 0, trades: 0, errors: [], modelCalls: 0, phase }
    if (force) {
      await clearArenaPhaseArtifacts(roundDate, phase, slot)
      await clearArenaRoundProgress(roundDate, phaseKey)
    }
  } else {
    const cached = await dbQueryFirst<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM arena_equity_snapshots WHERE round_date = @roundDate',
      { roundDate },
    )
    if ((cached?.cnt ?? 0) > 0 && !force) return { roundDate, alreadyRun: true, universeSize: 0, processed: 0, trades: 0, errors: [], modelCalls: 0 }
  }

  if (tickGate) return tickGate
  tickGate = (async (): Promise<ArenaTickResult> => {
    await ensureActiveArenaSeason()

    // ── 股票池：premarket 寫入，其餘讀取；fallback 動態抓取 ─────
    let universe: ArenaUniverseItem[]
    if (phase === 'premarket' || (!phase)) {
      try {
        universe = await buildDefaultDailyUniverse(roundDate)
        await replaceArenaRoundUniverse(roundDate, universe)
      } catch (err) {
        universe = await buildDefaultDailyUniverse(roundDate)
      }
    } else {
      const persisted = await getArenaRoundUniverse(roundDate)
      universe = persisted.length > 0
        ? persisted.map((r) => ({ symbol: r.symbol, name: r.name ?? r.symbol }))
        : await buildDefaultDailyUniverse(roundDate)
    }

    const { prices, history } = await fetchArenaMarket(universe, roundDate)

    let liveMark: Record<string, number> | undefined
    if (phase === 'slot') {
      try {
        const live = await fetchArenaLivePrices(universe)
        liveMark = live.bySymbol
      } catch (err) {
        console.warn('[ArenaTick] fetchArenaLivePrices failed, fallback closes:', (err as Error).message)
      }
    }

    const result = await runArenaRound({
      store: dbArenaStore(),
      strategist: getArenaStrategist(),
      prices,
      history,
      universe,
      roundDate,
      slippage: Number(process.env.ARENA_SLIPPAGE) || undefined,
      phase,
      slotIndex: slot,
      liveMark,
    })

    // ── 標記進度（僅分段模式）──────────────────────────────────
    if (phase) {
      const phaseKey = phase === 'slot' ? SLOT_MAP[slot ?? 0] : phase
      if (phaseKey && result.errors.length === 0) {
        await markArenaRoundProgress(roundDate, phaseKey, `processed=${result.processed} trades=${result.trades}`)
      }
    }

    return {
      alreadyRun: false,
      universeSize: universe.length,
      ...result,
      roundDate,
    }
  })().finally(() => {
    tickGate = null
  })
  return tickGate
}