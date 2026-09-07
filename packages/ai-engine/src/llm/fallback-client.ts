import type { LLMCallInfo, LLMClient, LLMUsage } from './client.js'

/**
 * Chain client: tries the primary model first, then each fallback in order
 * (tier 1, tier 2, …). Only throws after every tier has been exhausted.
 */
export class FallbackClient implements LLMClient {
  private _onCall?: (info: LLMCallInfo) => void
  private _onRetry?: (retryAfterMs: number) => void
  private lastModel = ''

  /** Total number of calls that fell back to a secondary model. */
  fallbackCalls = 0

  constructor(
    private primary: LLMClient,
    /** Ordered fallback tiers (tier 1 first). */
    private fallbacks: LLMClient[] = [],
  ) {}

  /** 內層 fallback 鏈（tier1 起）。當主要模型已確定不可用（如配額被鎖）時可直接呼叫，省去每輪重試 primary。 */
  get secondary(): LLMClient {
    return this.fallbacks[0] ?? this.primary
  }

  get fallbackChain(): LLMClient[] {
    return this.fallbacks
  }

  get model(): string {
    return this.lastModel || this.primary.model
  }

  get onUsage(): ((usage: LLMUsage) => void) | undefined {
    return this.primary.onUsage
  }

  set onUsage(cb: ((usage: LLMUsage) => void) | undefined) {
    this.primary.onUsage = cb
    for (const fb of this.fallbacks) fb.onUsage = cb
  }

  get onCall(): ((info: LLMCallInfo) => void) | undefined {
    return this._onCall
  }

  // 不要轉發給 primary/fallback，由本層統一以正確的 usedFallback 旗標發出
  set onCall(cb: ((info: LLMCallInfo) => void) | undefined) {
    this._onCall = cb
  }

  get onRetry(): ((retryAfterMs: number) => void) | undefined {
    return this._onRetry
  }

  set onRetry(cb: ((retryAfterMs: number) => void) | undefined) {
    this._onRetry = cb
    this.primary.onRetry = cb
    for (const fb of this.fallbacks) fb.onRetry = cb
  }

  private report(model: string, usedFallback: boolean): void {
    this.lastModel = model
    this._onCall?.({ model, usedFallback })
  }

  private async tryChain<T>(fn: (c: LLMClient) => Promise<T>): Promise<T> {
    const tiers: Array<{ client: LLMClient; usedFallback: boolean }> = [
      { client: this.primary, usedFallback: false },
      ...this.fallbacks.map((client) => ({ client, usedFallback: true })),
    ]
    const errors: string[] = []
    for (const tier of tiers) {
      try {
        const out = await fn(tier.client)
        this.report(tier.client.model, tier.usedFallback)
        if (tier.usedFallback) this.fallbackCalls++
        return out
      } catch (err: any) {
        errors.push(`${tier.client.model}: ${err.message}`)
        if (tier.usedFallback) this.fallbackCalls++
        console.warn(`[Fallback] ${tier.client.model} failed: ${err.message}`)
      }
    }
    throw new Error(`All LLM models exhausted — ${errors.join('; ')}`)
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.tryChain((c) => c.generate(systemPrompt, userPrompt))
  }

  async generateObject<T>(systemPrompt: string, userPrompt: string, schema: any): Promise<T> {
    return this.tryChain((c) => c.generateObject<T>(systemPrompt, userPrompt, schema))
  }

  async generateWithImage(systemPrompt: string, userPrompt: string, imageDataUrl: string): Promise<string> {
    const tiers: Array<{ client: LLMClient; usedFallback: boolean }> = [
      { client: this.primary, usedFallback: false },
      ...this.fallbacks.map((client) => ({ client, usedFallback: true })),
    ]
    const errors: string[] = []
    for (const tier of tiers) {
      if (!tier.client.generateWithImage) {
        errors.push(`${tier.client.model}: unsupported`)
        continue
      }
      try {
        const out = await tier.client.generateWithImage(systemPrompt, userPrompt, imageDataUrl)
        this.report(tier.client.model, tier.usedFallback)
        if (tier.usedFallback) this.fallbackCalls++
        return out
      } catch (err: any) {
        errors.push(`${tier.client.model}: ${err.message}`)
        if (tier.usedFallback) this.fallbackCalls++
        console.warn(`[Fallback] ${tier.client.model} image call failed: ${err.message}`)
      }
    }
    throw new Error(`All LLM models exhausted for image — ${errors.join('; ')}`)
  }
}