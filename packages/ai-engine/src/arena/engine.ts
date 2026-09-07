import type { ArenaStore } from './store.js'
import type { ArenaStrategist } from './strategist.js'
import { applyArenaDecision } from './ledger.js'
import type { ArenaPrice, ArenaUniverseItem } from './types.js'
import { ARENA_TONE_DESCRIPTIONS } from './strategist.js'

export interface RunArenaRoundParams {
  store: ArenaStore
  strategist: ArenaStrategist
  /** 決策用參考價格（symbol -> 收盤價）。 */
  prices: Record<string, ArenaPrice>
  history: Record<string, Array<{ date: string; close: number }>>
  universe: ArenaUniverseItem[]
  roundDate: string
  /** 可選：限制處理的 agent id（重跑某季時使用）。 */
  agentIds?: number[]
  slippage?: number
}

export interface RunArenaRoundResult {
  processed: number
  trades: number
  errors: string[]
  modelCalls: number
  roundDate: string
}

export async function runArenaRound(params: RunArenaRoundParams): Promise<RunArenaRoundResult> {
  const { store, strategist, prices, history, universe, roundDate, agentIds, slippage } = params
  const errors: string[] = []
  let trades = 0
  let modelCalls = 0

  const closes: Record<string, number> = {}
  const symbolNames: Record<string, string> = {}
  for (const u of universe) {
    const px = prices[u.symbol]
    if (px && px.price > 0) {
      closes[u.symbol] = px.price
      symbolNames[u.symbol] = px.symbolName ?? u.name
    }
  }

const agents = (await store.listActiveAgents()).filter(
  (a) => a.status === 'active' && (!agentIds || agentIds.includes(a.id)),
)

  for (const agent of agents) {
    const ctx = {
      agent: {
        id: agent.id,
        name: agent.name,
        strategyId: agent.strategyId,
        tone: agent.tone,
      },
      strategyName: agent.strategyId,
      toneDescription: ARENA_TONE_DESCRIPTIONS[agent.tone],
      roundDate,
      cash: agent.cash,
      initialCapital: agent.initialCapital,
      holdings: await store.getHoldings(agent.id),
      prices,
      history,
      universe,
    }

    let decision
    let model: string | undefined
    let fallbackUsed = false
    let decisionError: string | undefined
    try {
      const res = await strategist.decide(ctx)
      model = res.model
      fallbackUsed = res.fallbackUsed ?? false
      decisionError = res.error
      decision = res.decision
      modelCalls++
    } catch (err) {
      errors.push(`agent#${agent.id} decide failed: ${(err as Error).message}`)
      decision = { actions: [] }
    }

    const ledger = applyArenaDecision({
      cash: agent.cash,
      holdings: ctx.holdings,
      closes,
      symbolNames,
      decision,
      slippage,
    })

    trades += ledger.entries.filter((e) => e.action === 'BUY' || e.action === 'SELL').length

    for (const e of ledger.entries) {
      await store.insertTrade({
        agentId: agent.id,
        seasonId: agent.seasonId,
        roundDate,
        action: e.action,
        symbol: e.symbol,
        symbolName: e.symbolName,
        shares: e.shares,
        price: e.price,
        fee: e.fee,
        tax: e.tax,
        reason: e.reason,
        model,
        fallbackUsed: fallbackUsed || undefined,
        error: decisionError,
      })
    }
    for (const r of ledger.rejected) {
      await store.insertTrade({
        agentId: agent.id,
        seasonId: agent.seasonId,
        roundDate,
        action: r.action,
        symbol: r.symbol,
        shares: r.shares,
        reason: `${r.reason}`,
        model,
        fallbackUsed: fallbackUsed || undefined,
        error: 'REJECTED',
      })
    }

    await store.replaceHoldings(agent.id, ledger.holdings)
    await store.insertSnapshot({
      agentId: agent.id,
      seasonId: agent.seasonId,
      roundDate,
      cash: ledger.cash,
      equity: ledger.equity,
      returnPct: Math.round(((ledger.equity - agent.initialCapital) / agent.initialCapital) * 10000) / 100,
    })
    await store.advanceRound(agent.id, roundDate, ledger.cash)
  }

  return { processed: agents.length, trades, errors, modelCalls, roundDate }
}