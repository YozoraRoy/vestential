import { loadConfig } from '@stock/core'
import { getFramework } from '../portfolio.js'
import { createQuickLLM } from '../llm/quick.js'
import {
  type ArenaDecision,
  ArenaDecisionsSchema,
  ARENA_DEFAULT_MAX_TOKENS,
} from './types.js'
import {
  type ArenaDecisionContext,
  type ArenaDecisionResult,
  type ArenaStrategist,
  ARENA_TONE_DESCRIPTIONS,
} from './strategist.js'

function buildSystemPrompt(ctx: ArenaDecisionContext): string {
  const framework = getFramework(ctx.agent.strategyId)
  const tone = ARENA_TONE_DESCRIPTIONS[ctx.agent.tone]
  return [
    `你是「${ctx.agent.name}」，參與「Vestential AI Agent 投資競技場」。`,
    `這是模擬競賽：以 NT$${ctx.initialCapital.toLocaleString('en-US')} 虛擬資金在台股進行每日決策，不涉及真實金錢。`,
    `你採用「${framework.nameZh}」策略。核心原則：${framework.doctrine}`,
    `你的交易風格：${tone}`,
    '',
    '每輪你只能輸出一個 JSON 決策陣列。規則：',
    '1. 只能針對「股票池」內的代號做出 BUY/SELL；池外標的一律回報 HOLD。',
    '2. 股票代號一律使用純數字（例如 2330），不要附加 .TW。',
    '3. 每檔持股市值占總資產比例不得超過 30%，太集中時優先減碼或停買。',
    '4. 買入必須計算手續費（成交額 0.1425%，最低 1 元）與滑價；賣出另計證交稅 0.3%。',
    '5. 賣出股數不得超過持有股數；現金不足就別買。',
    '6. 決策要克制：沒有明確把握就 HOLD，不要為了交易而交易。',
    '7. 答案只能是嚴格合法 JSON，格式：',
    '{"actions":[{"symbol":"2330","action":"BUY","shares":500,"reason":"兩句以內的理由"}]}',
    '若不想操作，輸出 {"actions":[]}。',
  ].join('\n')
}

function formatHoldings(ctx: ArenaDecisionContext): string {
  if (ctx.holdings.length === 0) return '（目前空手）'
  return ctx.holdings
    .map((h) => `- ${h.symbol} ${h.symbolName ?? ''}: ${h.shares} 股，平均成本 ${h.avgCost}`)
    .join('\n')
}

function buildUserPrompt(ctx: ArenaDecisionContext): string {
  const lines: string[] = [
    `競賽日期：${ctx.roundDate}`,
    `可用現金：NT$${Math.round(ctx.cash).toLocaleString('en-US')}`,
    '',
    '目前持股：',
    formatHoldings(ctx),
    '',
    '股票池（本輪收盤價 / 漲跌幅%）：',
    ...ctx.universe.map((u) => {
      const px = ctx.prices[u.symbol]
      const change = px?.changePct !== undefined ? `${px.changePct}%` : '--'
      return `- ${u.symbol} ${u.name}: ${px ? px.price : '無資料'} (${change})`
    }),
  ]

  lines.push('', '近幾日收盤走勢（日期:close）：')
  for (const u of ctx.universe) {
    const hist = ctx.history[u.symbol]
    if (!hist || hist.length === 0) continue
    const tail = hist.slice(-5).map((p) => `${p.date.slice(5)}:${p.close}`).join(' ')
    lines.push(`- ${u.symbol} ${u.name}: ${tail}`)
  }

  lines.push('', '請依策略與規則輸出決策 JSON。')
  return lines.join('\n')
}

interface LightweightStrategistOptions {
  maxTokens?: number
  paddingEmpty?: number
}

export class LightweightStrategist implements ArenaStrategist {
  readonly id = 'lightweight-v1'
  private readonly maxTokens: number

  constructor(opts?: LightweightStrategistOptions) {
    const maxTokens = Number(process.env.ARENA_MAX_TOKENS)
    this.maxTokens = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : (opts?.maxTokens ?? ARENA_DEFAULT_MAX_TOKENS)
  }

  async decide(ctx: ArenaDecisionContext): Promise<ArenaDecisionResult> {
    const config = loadConfig()
    const { llm } = createQuickLLM(config, { maxTokens: this.maxTokens })

    let usedFallback = false
    llm.onCall = (info) => {
      usedFallback = usedFallback || info.usedFallback
    }

    const system = buildSystemPrompt(ctx)
    const user = buildUserPrompt(ctx)

    const fallbackDecision: ArenaDecision = { actions: [] }
    const result = await llm
      .generateObject<ArenaDecision>(system, user, ArenaDecisionsSchema)
      .catch(async () => {
        const once = await llm
          .generateObject<ArenaDecision>(system + '\n\n注意：上次輸出不符合規範，請只輸出合法 JSON。', user, ArenaDecisionsSchema)
          .catch(() => null)
        return once ?? fallbackDecision
      })

    return {
      decision: result,
      model: llm.model,
      fallbackUsed: usedFallback,
      error: undefined,
    }
  }
}