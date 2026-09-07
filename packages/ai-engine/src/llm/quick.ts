import type { AppConfig } from '@stock/core'
import { LLMFactory } from './factory.js'
import { FallbackClient } from './fallback-client.js'
import type { LLMClient } from './client.js'

export interface QuickLLMOptions {
  /** 覆寫輸出 token 上限（避免 Groq 等低 TPM fallback 因 max_tokens 預算太大直接 413）。 */
  maxTokens?: number
}

/**
 * Build a "quick" LLM client with an optional fallback chain (shared by
 * portfolio analysis and image recognition). Uses QUICK group models.
 */
export function createQuickLLM(config: AppConfig, opts?: QuickLLMOptions): { llm: LLMClient; primary: LLMClient; fallbackModel: string | null } {
  const primary = LLMFactory.create({
    provider: config.llmProvider,
    model: config.quickThinkModel,
    temperature: config.temperature,
    baseUrl: config.llmProvider !== 'google' ? config.backendUrl : undefined,
    maxTokens: opts?.maxTokens,
  })
  let llm: LLMClient = primary

  const fallbackProvider = process.env.FALLBACK_LLM_PROVIDER
  let fallbackModel: string | null = null
  if (fallbackProvider) {
    fallbackModel = process.env.FALLBACK_QUICK_THINK_MODEL ?? 'gemini-2.5-flash'
    const baseUrl =
      process.env.FALLBACK_QUICK_LLM_BACKEND_URL?.trim() ||
      process.env.FALLBACK_LLM_BACKEND_URL?.trim() ||
      (fallbackProvider !== 'google' ? config.backendUrl : '') ||
      undefined
    const apiKey =
      process.env.FALLBACK_QUICK_LLM_API_KEY?.trim() ||
      process.env.FALLBACK_QUICK_OPENAI_API_KEY?.trim() ||
      process.env.FALLBACK_LLM_API_KEY?.trim() ||
      process.env.FALLBACK_OPENAI_API_KEY?.trim() ||
      undefined
    const fallback = LLMFactory.create({
      provider: fallbackProvider,
      model: fallbackModel,
      apiKey,
      baseUrl,
      temperature: config.temperature,
      maxTokens: opts?.maxTokens,
    })
    llm = new FallbackClient(primary, [fallback])

    // tier2（FALLBACK2_*）：任一變數存在即啟用，provider 缺省沿用 tier1。
    const hasTier2 = [
      process.env.FALLBACK2_LLM_PROVIDER,
      process.env.FALLBACK2_LLM_BACKEND_URL,
      process.env.FALLBACK2_LLM_API_KEY,
      process.env.FALLBACK2_QUICK_THINK_MODEL,
      process.env.FALLBACK2_QUICK_LLM_BACKEND_URL,
      process.env.FALLBACK2_QUICK_LLM_API_KEY,
    ].some((v) => v?.trim())
    if (hasTier2) {
      const provider2 = process.env.FALLBACK2_LLM_PROVIDER?.trim() || fallbackProvider
      const model2 = process.env.FALLBACK2_QUICK_THINK_MODEL?.trim() || fallbackModel
      const baseUrl2 =
        process.env.FALLBACK2_QUICK_LLM_BACKEND_URL?.trim() ||
        process.env.FALLBACK2_LLM_BACKEND_URL?.trim() ||
        process.env.FALLBACK_LLM_BACKEND_URL?.trim() ||
        (provider2 !== 'google' ? config.backendUrl : '') ||
        undefined
      const apiKey2 =
        process.env.FALLBACK2_QUICK_LLM_API_KEY?.trim() ||
        process.env.FALLBACK2_QUICK_OPENAI_API_KEY?.trim() ||
        process.env.FALLBACK2_LLM_API_KEY?.trim() ||
        process.env.FALLBACK2_OPENAI_API_KEY?.trim() ||
        undefined
      const fallback2 = LLMFactory.create({
        provider: provider2,
        model: model2,
        apiKey: apiKey2,
        baseUrl: baseUrl2,
        temperature: config.temperature,
        maxTokens: opts?.maxTokens,
      })
      llm = new FallbackClient(primary, [fallback, fallback2])
    }
  }

  return { llm, primary, fallbackModel }
}