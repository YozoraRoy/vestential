import type { LLMClient } from './client.js'
import { FallbackClient } from './fallback-client.js'

export interface AgentUsage {
  agent: string
  /** Model that served the agent's calls (primary or fallback). */
  model: string | null
  /** Whether any call for this agent fell back to the secondary model. */
  usedFallback: boolean
  /** Number of calls that engaged the fallback model. */
  fallbackCalls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface TokenUsageSummary {
  agents: AgentUsage[]
  total: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/** 每筆成功 LLM 呼叫的完整紀錄（供持久化，由引擎層接整合寫入 DB）。 */
export interface LlmUsageEntry {
  /** ISO-8601 時間戳。 */
  at: string
  agent: string
  /** 實際服務模型（primary 或 fallback）。 */
  model: string
  /** 該次呼叫是否走備援。 */
  usedFallback: boolean
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

interface AgentState {
  promptTokens: number
  completionTokens: number
  model: string | null
  fallbackCalls: number
}

export class LLMUsageTracker {
  private byAgent = new Map<string, AgentState>()
  private currentAgent = 'Unknown'

  /** 每筆成功 LLM 呼叫的完整紀錄回呼；由引擎層接整合，fire-and-forget 寫入 DB。 */
  onCallRecorded?: (entry: LlmUsageEntry) => void

  reset() {
    this.byAgent.clear()
    this.currentAgent = 'Unknown'
  }

  setCurrentAgent(agent: string) {
    this.currentAgent = agent
  }

  private getOrInit(agent: string): AgentState {
    const current = this.byAgent.get(agent)
    if (current) return current
    const fresh: AgentState = { promptTokens: 0, completionTokens: 0, model: null, fallbackCalls: 0 }
    this.byAgent.set(agent, fresh)
    return fresh
  }

  /** 記一筆成功呼叫：同時更新記憶體聚合（getAgent/getSummary）並觸發持久化回呼。 */
  private record(
    agent: string,
    model: string,
    usedFallback: boolean,
    promptTokens: number,
    completionTokens: number,
  ) {
    const current = this.getOrInit(agent)
    current.model = model
    current.promptTokens += promptTokens
    current.completionTokens += completionTokens
    if (usedFallback) current.fallbackCalls++
    this.onCallRecorded?.({
      at: new Date().toISOString(),
      agent,
      model,
      usedFallback,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    })
  }

  /**
   * 對單一底層 client 掛 usage/call hook。雲端 provider（openai/google 等）會在
   * 同一同步 tick 內先發 onUsage 再發 onCall，故以單一 client 為域的快取即能精準配對。
   * 並行呼叫互不覆蓋（各自同步 tick 原子完成），解決單一 pendingUsage 全域槽的錯配。
   */
  private attachOne(client: LLMClient, usedFallback: boolean): void {
    let pending: { promptTokens: number; completionTokens: number } | null = null
    client.onUsage = (usage) => {
      pending = {
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
      }
    }
    client.onCall = (info) => {
      const done = pending ?? { promptTokens: 0, completionTokens: 0 }
      pending = null
      this.record(this.currentAgent, info.model, usedFallback, done.promptTokens, done.completionTokens)
    }
  }

  /**
   * 將 client 掛進追蹤。
   * - FallbackClient：逐 tier（primary＋各備援）掛載，並行環境下 token 仍能精準配對。
   * - 一般 client：直接掛載，其自身 usage/call 亦於同一 tick 配對。
   */
  attach(client: LLMClient): LLMClient {
    if (client instanceof FallbackClient) {
      for (const tier of client.tiers) this.attachOne(tier.client, tier.usedFallback)
    } else {
      this.attachOne(client, false)
    }
    return client
  }

  /** 回傳單一 agent 的用量快照；不存在時回傳 null。 */
  getAgent(agent: string): AgentUsage | null {
    const usage = this.byAgent.get(agent)
    if (!usage) return null
    const totalTokens = usage.promptTokens + usage.completionTokens
    return {
      agent,
      model: usage.model,
      usedFallback: usage.fallbackCalls > 0,
      fallbackCalls: usage.fallbackCalls,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens,
    }
  }

  getSummary(): TokenUsageSummary {
    const agents: AgentUsage[] = []
    let totalPrompt = 0
    let totalCompletion = 0

    for (const [agent, usage] of this.byAgent) {
      const totalTokens = usage.promptTokens + usage.completionTokens
      agents.push({
        agent,
        model: usage.model,
        usedFallback: usage.fallbackCalls > 0,
        fallbackCalls: usage.fallbackCalls,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens,
      })
      totalPrompt += usage.promptTokens
      totalCompletion += usage.completionTokens
    }

    agents.sort((a, b) => b.totalTokens - a.totalTokens)

    return {
      agents,
      total: {
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        totalTokens: totalPrompt + totalCompletion,
      },
    }
  }
}
