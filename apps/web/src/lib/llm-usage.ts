import { LLMUsageTracker } from '@stock/ai-engine'
import type { LLMClient } from '@stock/ai-engine'
import { logLlmUsage } from '@stock/database'

/**
 * 為一組 createQuickLLM() 產出的 client 掛上 LLM 用量記錄：每次成功呼叫以
 * fire-and-forget 寫入 llm_usage_logs（agent 由呼叫方命名，如 market-focus.summary）。
 * 底層採逐 tier 同同步 tick 配對，並行環境下 token 亦不誤配；寫入失敗不影響主路徑。
 */
export function attachLlmUsageRecorder(llm: LLMClient, agent: string): void {
  const tracker = new LLMUsageTracker()
  tracker.setCurrentAgent(agent)
  tracker.onCallRecorded = (entry) => {
    void logLlmUsage(entry)
  }
  tracker.attach(llm)
}