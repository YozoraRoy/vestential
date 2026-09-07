import {
  runArenaRound,
  LightweightStrategist,
  buildDefaultDailyUniverse,
  fetchArenaMarket,
  normalizeArenaStrategyParams,
  type ArenaHolding,
  type ArenaStore,
  type ArenaStrategist,
  type ArenaUniverseItem,
  type ArenaIntradayPriceRecord,
  type ArenaDecisionLogRecord,
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
}

let tickGate: Promise<ArenaTickResult> | null = null

/** 執行單日競技場收官（idempotent per roundDate，並發時共用同一 Promise）。 */
export async function runArenaTick(roundDate: string): Promise<ArenaTickResult> {
  const cached = await dbQueryFirst<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM arena_equity_snapshots WHERE round_date = @roundDate',
    { roundDate },
  )
  if ((cached?.cnt ?? 0) > 0) {
    return { roundDate, alreadyRun: true, universeSize: 0, processed: 0, trades: 0, errors: [], modelCalls: 0 }
  }

  if (tickGate) return tickGate
  tickGate = (async (): Promise<ArenaTickResult> => {
    await ensureActiveArenaSeason()
    const universe: ArenaUniverseItem[] = await buildDefaultDailyUniverse(roundDate)
    const { prices, history } = await fetchArenaMarket(universe, roundDate)
    const result = await runArenaRound({
      store: dbArenaStore(),
      strategist: getArenaStrategist(),
      prices,
      history,
      universe,
      roundDate,
      slippage: Number(process.env.ARENA_SLIPPAGE) || undefined,
    })
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