import type { LLMCallInfo, LLMClient, LLMUsage } from './client.js'
import { AIError } from '@stock/core'

/** primary 連續失敗達此數即短熔斷（秒鐘層級，讓備援鏈承接並節省重試時間）。 */
const PRIMARY_SOFT_COOLDOWN_MS = 3 * 60 * 1000
/** primary 確定性壞掉（無效 key／4xx 客戶端錯誤，排除 429）：長熔斷，避免每個 call 白等重試。 */
const PRIMARY_HARD_COOLDOWN_MS = 10 * 60 * 1000
/** primary 頻率/配額限制（429 / Rate limit）：短冷卻 60 秒，讓備援鏈消化該分鐘峰值後自動切回。 */
const PRIMARY_RATE_LIMIT_COOLDOWN_MS = 60 * 1000
/** 觸發短熔斷所需的 primary 連續失敗次數。 */
const PRIMARY_CONSECUTIVE_FAIL_LIMIT = 2

interface PrimaryState {
  failStreak: number
  skippedUntil: number
}

/**
 * 熔斷狀態以 primary model 為鍵「跨實例共享」：流水線每次調用 createQuickLLM 都會
 * 產生新的 FallbackClient 實例，若各自維護狀態，每個 LLM step 都會重複燒一輪
 * primary 重試延遲（約 40s）。共享後一旦任一 step 判定 primary 確定失敗，
 * 後續 step 立即跳過 primary。
 */
const primaryStates = new Map<string, PrimaryState>()

/**
 * Chain client: tries the primary model first, then each fallback in order
 * (tier 1, tier 2, …). Only throws after every tier has been exhausted.
 *
 * 熔斷（互相備援）：primary 連續失敗後進入冷卻，期間直接由備援鏈承接（省去每輪
 * 重試 dead primary 的延遲）；冷卻結束自動重新探測 primary，恢復即切回。
 */
export class FallbackClient implements LLMClient {
  private _onCall?: (info: LLMCallInfo) => void
  private _onRetry?: (retryAfterMs: number) => void
  private lastModel = ''

  /** Total number of calls that fell back to a secondary model. */
  fallbackCalls = 0

  private get pstate(): PrimaryState {
    const key = this.primary.model
    let state = primaryStates.get(key)
    if (!state) {
      state = { failStreak: 0, skippedUntil: 0 }
      primaryStates.set(key, state)
    }
    return state
  }

  /** primary 是否正在熔斷（呼叫方可用於診斷顯示）。 */
  get primaryBlocked(): boolean {
    return this.pstate.skippedUntil > Date.now()
  }

  private buildTiers(): Array<{ client: LLMClient; usedFallback: boolean }> {
    if (this.primaryBlocked) {
      return this.fallbacks.map((client) => ({ client, usedFallback: true }))
    }
    return [
      { client: this.primary, usedFallback: false },
      ...this.fallbacks.map((client) => ({ client, usedFallback: true })),
    ]
  }

  private onPrimarySuccess(): void {
    this.pstate.failStreak = 0
    this.pstate.skippedUntil = 0
  }

  private onPrimaryFailure(err: unknown): void {
    const msg = String((err as Error)?.message ?? err)
    const isRateLimit = /API 429|rate_limit|quota_exceeded|resource_exhausted/i.test(msg)
    const isHard =
      !isRateLimit && ((err instanceof AIError && err.retryable === false) || /API 4\d\d/.test(msg))
    const st = this.pstate
    st.failStreak += 1
    const cooldown = isHard
      ? PRIMARY_HARD_COOLDOWN_MS
      : isRateLimit
        ? PRIMARY_RATE_LIMIT_COOLDOWN_MS
        : st.failStreak >= PRIMARY_CONSECUTIVE_FAIL_LIMIT
          ? PRIMARY_SOFT_COOLDOWN_MS
          : 0
    if (cooldown > 0) {
      st.skippedUntil = Date.now() + cooldown
      console.warn(
        `[Fallback] primary ${this.primary.model} 熔斷 ${Math.round(cooldown / 1000)}s，暫由備援鏈接手（streak=${st.failStreak}, hard=${isHard}, rateLimit=${isRateLimit}）`,
      )
    }
  }

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

  /**
   * 底層 tier 清單（primary 第一，並標記是否屬備援層）。
   * 供 LLMUsageTracker 逐 tier 掛載 usage/call hook：每筆成功的 usage 與 call
   * 都由同一底層 client 在同一同步 tick 依序發出，並行呼叫下 token 亦不誤配。
   */
  get tiers(): Array<{ client: LLMClient; usedFallback: boolean }> {
    return [
      { client: this.primary, usedFallback: false },
      ...this.fallbacks.map((client) => ({ client, usedFallback: true })),
    ]
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
    const tiers = this.buildTiers()
    const errors: string[] = []
    for (const tier of tiers) {
      try {
        const out = await fn(tier.client)
        if (tier.client === this.primary) this.onPrimarySuccess()
        this.report(tier.client.model, tier.usedFallback)
        if (tier.usedFallback) this.fallbackCalls++
        return out
      } catch (err: any) {
        errors.push(`${tier.client.model}: ${err.message}`)
        if (tier.usedFallback) this.fallbackCalls++
        console.warn(`[Fallback] ${tier.client.model} failed: ${err.message}`)
        if (tier.client === this.primary) this.onPrimaryFailure(err)
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
    const tiers = this.buildTiers()
    const errors: string[] = []
    for (const tier of tiers) {
      if (!tier.client.generateWithImage) {
        errors.push(`${tier.client.model}: unsupported`)
        continue
      }
      try {
        const out = await tier.client.generateWithImage(systemPrompt, userPrompt, imageDataUrl)
        if (tier.client === this.primary) this.onPrimarySuccess()
        this.report(tier.client.model, tier.usedFallback)
        if (tier.usedFallback) this.fallbackCalls++
        return out
      } catch (err: any) {
        errors.push(`${tier.client.model}: ${err.message}`)
        if (tier.usedFallback) this.fallbackCalls++
        console.warn(`[Fallback] ${tier.client.model} image call failed: ${err.message}`)
        if (tier.client === this.primary) this.onPrimaryFailure(err)
      }
    }
    throw new Error(`All LLM models exhausted for image — ${errors.join('; ')}`)
  }
}