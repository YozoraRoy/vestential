import { loadConfig } from '@stock/core'
import { createQuickLLM } from '../llm/quick.js'
import { dataBlock, injectionGuardNote, sanitizeDataField } from './prompt-utils.js'
import { personalityDataBlock } from './persona.js'
import type { ArenaHolding, ArenaStrategyParams } from './types.js'

export interface TextGenResult {
  content: string
  model?: string
  fallbackUsed?: boolean
  error?: string
}

async function runTextLLM(system: string, user: string, maxTokens: number): Promise<TextGenResult> {
  const config = loadConfig()
  const { llm } = createQuickLLM(config, { maxTokens })
  let usedFallback = false
  llm.onCall = (info) => {
    usedFallback = usedFallback || info.usedFallback
  }
  try {
    const content = sanitizeDataField(await llm.generate(system, user), 2500)
    if (content) return { content, model: llm.model, fallbackUsed: usedFallback }
    return { content: '', model: llm.model, fallbackUsed: usedFallback, error: 'empty output' }
  } catch (err) {
    return { content: '', error: (err as Error).message, fallbackUsed: usedFallback }
  }
}

/** 盤前計畫。 */
export async function buildPreMarketPlan(params: {
  agentName: string
  roundDate: string
  briefing: string
  cash: number
  holdings: ArenaHolding[]
  personality: string | null
  strategyParams: ArenaStrategyParams
  initialCapital: number
}): Promise<TextGenResult> {
  const holdingsText = params.holdings.length
    ? params.holdings.map((h) => `- ${h.symbol} ${h.symbolName ?? ''}: ${h.shares} 股，成本 ${h.avgCost}`).join('\n')
    : '（目前空手）'
  const system = [
    `你是競技場 Agent「${params.agentName}」的盤前規劃（模擬賽，虛擬資金 NT$${params.initialCapital.toLocaleString('en-US')}）。`,
    '任務：根據盤前簡報與手上部位，擬定今天的操作計畫：今日觀察重點、偏向加碼/減碼/持有哪些族群、觸發條件。',
    '輸出為簡潔條列文字（150~300 字繁體中文），只列計畫，不下單。',
    injectionGuardNote(),
  ].join('\n')
  const user = [
    dataBlock('round_date', params.roundDate, 20),
    dataBlock('cash', `可用現金 NT$${Math.round(params.cash).toLocaleString('en-US')}`, 40),
    dataBlock('holdings', holdingsText, 1000),
    dataBlock('briefing', params.briefing, 2200),
    personalityDataBlock(params.personality),
  ]
    .filter(Boolean)
    .join('\n')
  return runTextLLM(system, user, 500)
}

export interface DayTradeEntry {
  slot: number | null
  timeLabel: string
  action: 'BUY' | 'SELL' | 'HOLD'
  symbol?: string | null
  symbolName?: string | null
  shares?: number | null
  price?: number | null
  reason?: string | null
}

/** 收後自評回顧。 */
export async function buildPostCloseReflection(params: {
  agentName: string
  roundDate: string
  trades: DayTradeEntry[]
  cash: number
  equity: number
  returnPct: number
  holdings: ArenaHolding[]
  initialCapital: number
  personality: string | null
}): Promise<TextGenResult> {
  const tradesText = params.trades.length
    ? params.trades
        .map((t) =>
          `${t.timeLabel ? `${t.timeLabel} ` : ''}${t.action} ${t.symbol ?? ''}${t.symbolName ?? ''} ` +
            `${t.shares ? `${t.shares}股` : ''}${t.price ? `@${t.price}` : ''}${t.reason ? `（${t.reason}）` : ''}`,
        )
        .join('\n')
    : '（本日無成交）'
  const holdingsText = params.holdings.length
    ? params.holdings.map((h) => `- ${h.symbol} ${h.symbolName ?? ''}: ${h.shares} 股，成本 ${h.avgCost}`).join('\n')
    : '（空手）'
  const system = [
    `你是競技場 Agent「${params.agentName}」的收後自評（模擬賽，本金 NT$${params.initialCapital.toLocaleString('en-US')}）。`,
    '任務：回顧今天的操作，指出對哪裡、哪裡該改進、明天打算怎麼調整。誠實、具體、條列。',
    '輸出為簡潔文字（150~300 字繁體中文）。',
    injectionGuardNote(),
  ].join('\n')
  const user = [
    dataBlock('round_date', params.roundDate, 20),
    dataBlock('equity', `權益 ${Math.round(params.equity)}，報酬率 ${params.returnPct}%`, 60),
    dataBlock('holdings', holdingsText, 1000),
    dataBlock('trades', tradesText, 2000),
    personalityDataBlock(params.personality),
  ]
    .filter(Boolean)
    .join('\n')
  return runTextLLM(system, user, 500)
}

export interface DiscussionParticipant {
  agentName: string
  recovery: { placed: number; rejected: number }
  equity: number
  returnPct: number
  reflection: string
}

/** 圓桌討論總結（1 call / 日）。 */
export async function buildDiscussionSummary(params: {
  roundDate: string
  participants: DiscussionParticipant[]
}): Promise<TextGenResult> {
  if (params.participants.length === 0) return { content: '' }
  const system = [
    '你是競技場「圓桌討論」主持人（模擬賽）。',
    '任務：綜合各 Agent 的收後自評與最終成績，歸納 2~4 條當日市場觀察與團隊共識，指出表現最好與最差者各一及其原因。',
    '輸出為條列式、總計 250 字以內的繁體中文。',
    injectionGuardNote(),
  ].join('\n')
  const members = params.participants
    .map((p) => {
      const r = `${p.agentName}：權益 ${Math.round(p.equity)}，報酬 ${p.returnPct}%，下單成功 ${p.recovery.placed} / 被拒 ${p.recovery.rejected}。自評：${p.reflection}`
      return sanitizeDataField(r, 1500)
    })
    .join('\n\n')
  const ranking = [...params.participants]
    .sort((a, b) => b.returnPct - a.returnPct)
    .map((p, i) => `#${i + 1} ${p.agentName}: ${p.returnPct}%`)
    .join('；')
  const user = [
    dataBlock('round_date', params.roundDate, 20),
    dataBlock('ranking', ranking, 2000),
    dataBlock('self_reviews', members, 6000),
  ]
    .filter(Boolean)
    .join('\n')
  return runTextLLM(system, user, 700)
}

export function fallbackPlan(agentName: string): string {
  return `${agentName} 盤前計畫：以持股為核心，優先觀察簡報中最強勢族群的續航力；現金部位偏高的話，等待明確訊號再分批進場，避免追高。`
}

export function fallbackReflection(agentName: string, roundDate: string): string {
  return `${agentName} 收後自評（${roundDate}）：今天主要以持股配置與現金紀律為主，未見迫使大幅調整的訊號；明天將延續既有策略，留意停損紀律。`
}

export function fallbackDiscussion(roundDate: string, count: number): string {
  return `${roundDate} 圓桌討論：共 ${count} 位 Agent 參與，市場整體風險偏好中性；建議維持分散持股、嚴格停損並保留現金彈性。統計資料不足，以原則性結論替代。`
}