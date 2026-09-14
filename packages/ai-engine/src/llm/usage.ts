import type { LLMCallInfo, LLMClient, LLMUsage } from './client.js'

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
  /** 最近一次 handleUsage 收到的 token 數，等待 handleCall 湊成完整一筆送出。 */
  private pendingUsage: { promptTokens: number; completionTokens: number } | null = null

  /** 每筆成功 LLM 呼叫的完整紀錄回呼；由引擎層接整合，fire-and-forget 寫入 DB。 */
  onCallRecorded?: (entry: LlmUsageEntry) => void

  reset() {
    this.byAgent.clear()
    this.currentAgent = 'Unknown'
    this.pendingUsage = null
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

  private handleUsage = (usage: LLMUsage) => {
    const current = this.getOrInit(this.currentAgent)
    const promptTokens = usage.promptTokens ?? 0
    const completionTokens = usage.completionTokens ?? 0
    current.promptTokens += promptTokens
    current.completionTokens += completionTokens
    this.pendingUsage = { promptTokens, completionTokens }
  }

  private handleCall = (info: LLMCallInfo) => {
    const current = this.getOrInit(this.currentAgent)
    current.model = info.model
    if (info.usedFallback) current.fallbackCalls++

    // 湊齊 usage + call → 輸出完整一筆紀錄（附帶於 onCallRecorded 回呼）。
    // 搭配 FallbackClient.report() 統一發送的 onCall（model＝實際服務者），
    // 確保每筆成功呼叫最多記一筆，且 model 為實際服務者。
    const usage = this.pendingUsage
    this.pendingUsage = null
    const promptTokens = usage?.promptTokens ?? 0
    const completionTokens = usage?.completionTokens ?? 0
    this.onCallRecorded?.({
      at: new Date().toISOString(),
      agent: this.currentAgent,
      model: info.model,
      usedFallback: info.usedFallback,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    })
  }

  attach(client: LLMClient): LLMClient {
    client.onUsage = this.handleUsage
    client.onCall = this.handleCall
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
