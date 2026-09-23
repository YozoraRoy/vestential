import type { AppConfig } from '@stock/core'
import { LLMFactory } from './factory.js'
import { FallbackClient, checkFallbackPoolDiversity } from './fallback-client.js'
import type { FallbackPoolSpec } from './fallback-client.js'
import type { LLMClient } from './client.js'

export interface QuickLLMOptions {
  /** 覆寫輸出 token 上限（避免 Groq 等低 TPM fallback 因 max_tokens 預算太大直接 413）。 */
  maxTokens?: number
}

/** factory 的 key 解析鏡像（只為同池比對，不印出）：顯式 key 優先，否則走全域 env。 */
function resolvePoolKey(provider: string, explicitKey?: string): string {
  if (explicitKey?.trim()) return explicitKey.trim()
  const p = provider.trim().toLowerCase()
  if (p === 'google') return process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ?? ''
  if (p === 'openai') return process.env.OPENAI_API_KEY?.trim() ?? ''
  return ''
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
    const apiKey =
      process.env.FALLBACK_QUICK_LLM_API_KEY?.trim() ||
      process.env.FALLBACK_QUICK_OPENAI_API_KEY?.trim() ||
      process.env.FALLBACK_LLM_API_KEY?.trim() ||
      process.env.FALLBACK_OPENAI_API_KEY?.trim() ||
      undefined
    const baseUrl =
      process.env.FALLBACK_QUICK_LLM_BACKEND_URL?.trim() ||
      process.env.FALLBACK_LLM_BACKEND_URL?.trim() ||
      (apiKey?.startsWith('gsk_') ? 'https://api.groq.com/openai/v1' : '') ||
      (fallbackProvider !== 'google' ? config.backendUrl : '') ||
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
    // Issue #32：接線完成後驗證分流（同池即警告，不阻斷；key 不印出）。
    const primarySpec: FallbackPoolSpec = {
      provider: config.llmProvider,
      model: config.quickThinkModel,
      baseUrl: config.llmProvider !== 'google' ? config.backendUrl : undefined,
      apiKey: resolvePoolKey(config.llmProvider),
    }
    const tierSpecs: FallbackPoolSpec[] = [
      { provider: fallbackProvider, model: fallbackModel, baseUrl, apiKey: resolvePoolKey(fallbackProvider, apiKey) },
    ]

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
      const apiKey2 =
        process.env.FALLBACK2_QUICK_LLM_API_KEY?.trim() ||
        process.env.FALLBACK2_QUICK_OPENAI_API_KEY?.trim() ||
        process.env.FALLBACK2_LLM_API_KEY?.trim() ||
        process.env.FALLBACK2_OPENAI_API_KEY?.trim() ||
        undefined
      const baseUrl2 =
        process.env.FALLBACK2_QUICK_LLM_BACKEND_URL?.trim() ||
        process.env.FALLBACK2_LLM_BACKEND_URL?.trim() ||
        process.env.FALLBACK_QUICK_LLM_BACKEND_URL?.trim() ||
        process.env.FALLBACK_LLM_BACKEND_URL?.trim() ||
        (apiKey2?.startsWith('gsk_') ? 'https://api.groq.com/openai/v1' : '') ||
        (provider2 !== 'google' ? config.backendUrl : '') ||
        baseUrl ||
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
      tierSpecs.push({ provider: provider2, model: model2, baseUrl: baseUrl2, apiKey: resolvePoolKey(provider2, apiKey2) })
    }
    // 生產現況 tier1/tier2 同 model 同 key → 會在此警告並列為待確認（需新 key，不擅自假設）。
    for (const w of checkFallbackPoolDiversity(primarySpec, tierSpecs)) console.warn(w)
  }

  return { llm, primary, fallbackModel }
}