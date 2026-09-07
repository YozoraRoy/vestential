import {
  type AnalysisState,
  AssetType,
  AGENT_KEYS,
  AGENT_KEY_SET,
  DEFAULT_ANALYSIS_LANGUAGE,
  buildAnalysisLanguageInstruction,
  type AnalysisLanguage,
  type AppConfig,
  loadConfig,
} from '@stock/core'
import { registry, yahooFinanceProvider } from '@stock/market-data'
import { LLMFactory } from './llm/factory.js'
import { FallbackClient } from './llm/fallback-client.js'
import { LLMUsageTracker } from './llm/usage.js'
import type { LLMClient } from './llm/client.js'
import type { TokenUsageSummary, AgentUsage } from './llm/usage.js'
import { WorkflowGraph } from './graph/workflow.js'
import { MemoryLog } from './graph/memory.js'
import { Reflector } from './graph/reflection.js'
import { SignalProcessor } from './graph/signal.js'
import { tools } from './tools/index.js'
import {
  createMarketAnalyst,
  createSentimentAnalyst,
  createNewsAnalyst,
  createFundamentalsAnalyst,
  createBullResearcher,
  createResearchManager,
  createTrader,
  createPortfolioManager,
} from './agents/index.js'

async function resolveSymbol(rawTicker: string): Promise<string> {
  const trimmed = rawTicker.trim().toUpperCase()

  if (trimmed.endsWith('.TW') || trimmed.endsWith('.TWO')) {
    return trimmed
  }

  // 純數字代號（台股上市或上櫃）自動校正
  if (/^\d{4,6}$/.test(trimmed)) {
    try {
      const twSymbol = `${trimmed}.TW`
      const quote = await tools.getQuote(twSymbol)
      if (quote && quote.price > 0) return twSymbol
    } catch (_) {}

    try {
      const twoSymbol = `${trimmed}.TWO`
      const quote = await tools.getQuote(twoSymbol)
      if (quote && quote.price > 0) return twoSymbol
    } catch (_) {}
  }

  return trimmed
}

export type ProgressCallback = (step: string, detail: string) => void

export interface AnalyzeOptions {
  assetType?: AssetType
  /** 分析報告輸出語言，預設 zh-TW（繁體中文 + NTD）。 */
  language?: AnalysisLanguage
  /** 僅執行指定的 Agent（節點名稱需為 AGENT_KEYS 之一）。未提供時預設全數執行。 */
  enabledAgents?: string[]
}

export interface ModelPlan {
  deep: string
  quick: string
  fallback: {
    provider: string
    deep: string
    quick: string
    deepBaseUrl?: string
    quickBaseUrl?: string
    deepApiKeyHint?: string
    quickApiKeyHint?: string
    deep2?: string
    quick2?: string
    deep2BaseUrl?: string
    quick2BaseUrl?: string
    deep2ApiKeyHint?: string
    quick2ApiKeyHint?: string
  } | null
}

export class TradingEngine {
  private deepLLM: LLMClient
  private quickLLM: LLMClient
  private memory: MemoryLog
  private reflector: Reflector
  private signalProcessor = new SignalProcessor()
  private usageTracker = new LLMUsageTracker()
  private modelPlan: ModelPlan
  private config: AppConfig
  /** 分析每個 Agent 呼叫的輸出 token 上限（避免請求過大的 max_tokens 觸發上游 413）。 */
  private analyzeMaxTokens: number

  constructor() {
    registry.register(yahooFinanceProvider)

    this.config = loadConfig()

    this.analyzeMaxTokens = (() => {
      // 只讀專屬的 ANALYZE_MAX_TOKENS，不要沿用泛用 LLM_MAX_TOKENS（通常設 8192），
      // 否則 fallback（如 Groq）會因 max_tokens 太大而回 413 request_too_large。
      const n = Number(process.env.ANALYZE_MAX_TOKENS)
      return Number.isFinite(n) && n >= 128 ? Math.round(n) : 2048
    })()

    const createClient = (model: string, provider?: string) => LLMFactory.create({
      provider: provider ?? this.config.llmProvider,
      model,
      temperature: this.config.temperature,
      baseUrl: provider !== 'google' ? this.config.backendUrl : undefined,
      // 壓低 max_tokens 預算：部分模型（如 big-pickle）輸出預算較小，
      // 若請求過大的 max_tokens 會被上游回 413 Request Entity Too Large。
      maxTokens: this.analyzeMaxTokens,
    })

    this.deepLLM = createClient(this.config.deepThinkModel)
    this.quickLLM = createClient(this.config.quickThinkModel)

    // ── Fallback 支援 deep/quick 兩組各自獨立 ──
    // 每個 group（deep / quick）可各自指定不同的 fallback model、baseUrl 與 apiKey，
    // 達到「每個 agent 群各自的免費 API token 備援」。
    // 環境變數優先序：
    //   群組專屬 (FALLBACK_DEEP_*) > 通用 (FALLBACK_LLM_*) > 沿用 primary。
    const fallbackProvider = process.env.FALLBACK_LLM_PROVIDER
    const fallbackDeepModel = process.env.FALLBACK_DEEP_THINK_MODEL ?? 'gemini-2.5-flash'
    const fallbackQuickModel = process.env.FALLBACK_QUICK_THINK_MODEL ?? 'gemini-2.5-flash'

    // tier2（FALLBACK2_*）：只要任一 tier2 變數存在即啟用，provider 缺省沿用 tier1。
    const hasTier2 = [
      process.env.FALLBACK2_LLM_PROVIDER,
      process.env.FALLBACK2_LLM_BACKEND_URL,
      process.env.FALLBACK2_LLM_API_KEY,
      process.env.FALLBACK2_DEEP_THINK_MODEL,
      process.env.FALLBACK2_QUICK_THINK_MODEL,
      process.env.FALLBACK2_DEEP_LLM_BACKEND_URL,
      process.env.FALLBACK2_DEEP_LLM_API_KEY,
      process.env.FALLBACK2_QUICK_LLM_BACKEND_URL,
      process.env.FALLBACK2_QUICK_LLM_API_KEY,
    ].some((v) => v?.trim())

    let fallbackPlan: ModelPlan['fallback'] = null
    if (fallbackProvider) {
      const tier1Provider: string = fallbackProvider
      const tier2Provider = process.env.FALLBACK2_LLM_PROVIDER?.trim() || tier1Provider
      // 用 tier (1|2) 統一解析各層的 provider/model/baseUrl/apiKey。
      const createFallbackClient = (group: 'deep' | 'quick', tier: 1 | 2): LLMClient => {
        const prefix = tier === 1 ? 'FALLBACK_' : 'FALLBACK2_'
        const groupPrefix = group === 'deep' ? `${prefix}DEEP_` : `${prefix}QUICK_`
        const provider = tier === 1 ? tier1Provider : tier2Provider
        const model =
          process.env[`${groupPrefix}THINK_MODEL`]?.trim() ||
          (group === 'deep' ? fallbackDeepModel : fallbackQuickModel)
        const baseUrl =
          process.env[`${groupPrefix}LLM_BACKEND_URL`]?.trim() ||
          process.env[`${prefix}LLM_BACKEND_URL`]?.trim() ||
          process.env.FALLBACK_LLM_BACKEND_URL?.trim() ||
          (provider !== 'google' ? this.config.backendUrl : '') ||
          undefined
        const apiKey =
          process.env[`${groupPrefix}LLM_API_KEY`]?.trim() ||
          process.env[`${groupPrefix}OPENAI_API_KEY`]?.trim() ||
          process.env[`${prefix}LLM_API_KEY`]?.trim() ||
          process.env[`${prefix}OPENAI_API_KEY`]?.trim() ||
          undefined
        return LLMFactory.create({
          provider,
          model,
          apiKey,
          baseUrl,
          temperature: this.config.temperature,
          // 同樣壓低 max_tokens：否則 fallback（如 Groq）會因請求過大的
          // max_tokens 直接回 413 request_too_large。
          maxTokens: this.analyzeMaxTokens,
        })
      }

      const tier1Deep = createFallbackClient('deep', 1)
      const tier1Quick = createFallbackClient('quick', 1)
      this.deepLLM = new FallbackClient(this.deepLLM, [tier1Deep, ...(hasTier2 ? [createFallbackClient('deep', 2)] : [])])
      this.quickLLM = new FallbackClient(this.quickLLM, [tier1Quick, ...(hasTier2 ? [createFallbackClient('quick', 2)] : [])])

      const tier2DeepModel = process.env.FALLBACK2_DEEP_THINK_MODEL?.trim() || fallbackDeepModel
      const tier2QuickModel = process.env.FALLBACK2_QUICK_THINK_MODEL?.trim() || fallbackQuickModel
      fallbackPlan = {
        provider: fallbackProvider,
        deep: fallbackDeepModel,
        quick: fallbackQuickModel,
        deepBaseUrl:
          process.env.FALLBACK_DEEP_LLM_BACKEND_URL?.trim() ||
          process.env.FALLBACK_LLM_BACKEND_URL?.trim() ||
          (fallbackProvider !== 'google' ? this.config.backendUrl : '') ||
          undefined,
        quickBaseUrl:
          process.env.FALLBACK_QUICK_LLM_BACKEND_URL?.trim() ||
          process.env.FALLBACK_LLM_BACKEND_URL?.trim() ||
          (fallbackProvider !== 'google' ? this.config.backendUrl : '') ||
          undefined,
        deepApiKeyHint: this.apiKeyHint(
          process.env.FALLBACK_DEEP_LLM_API_KEY ||
            process.env.FALLBACK_DEEP_OPENAI_API_KEY ||
            process.env.FALLBACK_LLM_API_KEY ||
            process.env.FALLBACK_OPENAI_API_KEY,
        ),
        quickApiKeyHint: this.apiKeyHint(
          process.env.FALLBACK_QUICK_LLM_API_KEY ||
            process.env.FALLBACK_QUICK_OPENAI_API_KEY ||
            process.env.FALLBACK_LLM_API_KEY ||
            process.env.FALLBACK_OPENAI_API_KEY,
        ),
        ...(hasTier2
          ? {
              deep2: tier2DeepModel,
              quick2: tier2QuickModel,
              deep2BaseUrl:
                process.env.FALLBACK2_DEEP_LLM_BACKEND_URL?.trim() ||
                process.env.FALLBACK2_LLM_BACKEND_URL?.trim() ||
                process.env.FALLBACK_LLM_BACKEND_URL?.trim() ||
                (tier2Provider !== 'google' ? this.config.backendUrl : '') ||
                undefined,
              quick2BaseUrl:
                process.env.FALLBACK2_QUICK_LLM_BACKEND_URL?.trim() ||
                process.env.FALLBACK2_LLM_BACKEND_URL?.trim() ||
                process.env.FALLBACK_LLM_BACKEND_URL?.trim() ||
                (tier2Provider !== 'google' ? this.config.backendUrl : '') ||
                undefined,
              deep2ApiKeyHint: this.apiKeyHint(
                process.env.FALLBACK2_DEEP_LLM_API_KEY ||
                  process.env.FALLBACK2_DEEP_OPENAI_API_KEY ||
                  process.env.FALLBACK2_LLM_API_KEY ||
                  process.env.FALLBACK2_OPENAI_API_KEY,
              ),
              quick2ApiKeyHint: this.apiKeyHint(
                process.env.FALLBACK2_QUICK_LLM_API_KEY ||
                  process.env.FALLBACK2_QUICK_OPENAI_API_KEY ||
                  process.env.FALLBACK2_LLM_API_KEY ||
                  process.env.FALLBACK2_OPENAI_API_KEY,
              ),
            }
          : {}),
      }
    }

    this.modelPlan = {
      deep: this.config.deepThinkModel,
      quick: this.config.quickThinkModel,
      fallback: fallbackPlan,
    }

    this.deepLLM = this.usageTracker.attach(this.deepLLM)
    this.quickLLM = this.usageTracker.attach(this.quickLLM)

    this.memory = new MemoryLog(this.config.memoryLogPath)
    this.reflector = new Reflector(this.quickLLM)
  }

  /** 回傳每個 agent 階層所設定的 primary/fallback 模型清單，用於 DB 記錄與 UI 呈現。 */
  getModelPlan(): ModelPlan {
    return this.modelPlan
  }

  /** 把 apiKey 遮罩成前綴提示（例如 sk-abc...），避免明文外洩又方便辨識是哪一把 key。 */
  private apiKeyHint(key: string | undefined): string | undefined {
    if (!key) return undefined
    const k = key.trim()
    if (!k) return undefined
    return k.length <= 8 ? `${k}...` : `${k.substring(0, 8)}...`
  }

  async analyze(
    ticker: string,
    tradeDate: string,
    onProgress?: ProgressCallback,
    options: AnalyzeOptions = {},
  ): Promise<{ state: AnalysisState; signal: string; tokenUsage: TokenUsageSummary }> {
    this.usageTracker.reset()
    onProgress?.('Symbol Normalizer', 'Resolving ticker symbol...')
    const resolvedTicker = await resolveSymbol(ticker)

    // 讓 LLM 重試等待時能通知前端顯示倒數
    const onRetry = (retryAfterMs: number) => onProgress?.('LLM', `retrying in ${Math.round(retryAfterMs / 1000)}s`)
    this.deepLLM.onRetry = onRetry
    this.quickLLM.onRetry = onRetry

    const outputLanguage: AnalysisLanguage =
      options.language ?? (this.config.outputLanguage as AnalysisLanguage) ?? DEFAULT_ANALYSIS_LANGUAGE
    const outputInstruction = buildAnalysisLanguageInstruction(outputLanguage, this.config.twdUsdRate)

    const requestedAgents = options.enabledAgents && options.enabledAgents.length > 0
      ? options.enabledAgents
      : [...AGENT_KEYS]
    const enabledSet = new Set<string>(requestedAgents.filter(a => AGENT_KEY_SET.has(a)))
    const activeKeys = AGENT_KEYS.filter(k => enabledSet.has(k))

    if (activeKeys.length === 0) {
      throw new Error('至少需要啟用一個 Agent 才能進行 AI 分析（目前已全部停用）。')
    }

    let quoteContext = ''
    let profileContext = ''
    let historyContext = ''
    let quote: any = null
    let profile: any = null
    let assetTypeContext = ''

    try {
      onProgress?.('Data Fetcher', `Fetching real-time quote for ${resolvedTicker}...`)
      quote = await tools.getQuote(resolvedTicker)
      quoteContext = `Current Price Quote for ${resolvedTicker}:
- Current Price: $${quote.price}
- Daily Volume: ${quote.volume}
- Last Quote Timestamp: ${new Date(quote.timestamp).toISOString()}`
    } catch (e: any) {
      console.warn(`[TradingEngine] Failed to fetch quote for ${resolvedTicker}:`, e.message)
    }

    try {
      onProgress?.('Data Fetcher', `Fetching company profile for ${resolvedTicker}...`)
      profile = await tools.getProfile(resolvedTicker)
      profileContext = `Company/Fund Profile:
- Name: ${profile.name}
- Sector: ${profile.sector ?? 'N/A'}
- Industry: ${profile.industry ?? 'N/A'}
- Exchange: ${profile.exchange ?? 'N/A'}
- Description: ${profile.description ?? 'N/A'}`
    } catch (e: any) {
      console.warn(`[TradingEngine] Failed to fetch profile for ${resolvedTicker}:`, e.message)
    }

    // ── 標的類型偵測（ETF / 個股 / 指數）──
    // 從 Yahoo profile 的 quoteType 判斷（"ETF" / "EQUITY" 等）。
    // 找不到時回退到呼叫端明確指定的 options.assetType，最後才是預設個股。
    // 分類會以文字注入 instrumentContext，讓每個後續 Agent 都能理解這是 ETF 或個股。
    let detectedAssetType: AssetType | null = null
    if (profile?.quoteType) {
      const t = String(profile.quoteType).toUpperCase()
      if (t.includes('ETF')) detectedAssetType = AssetType.ETF
      else if (t.includes('INDEX')) detectedAssetType = AssetType.Index
      else detectedAssetType = AssetType.Stock
    }
    const assetType: AssetType = detectedAssetType ?? options.assetType ?? AssetType.Stock
    const assetTypeLabel = assetType === AssetType.ETF ? 'ETF（指數股票型基金）' : '個股（普通股）'
    onProgress?.('Instrument Classifier', `Detected ${resolvedTicker} as ${assetType} (${assetTypeLabel})`)
    assetTypeContext = `INSTRUMENT TYPE: This instrument is a ${assetType} (${assetTypeLabel}).
- Analysts MUST treat it as a ${assetType === AssetType.ETF ? 'basket of underlying securities (ETF)' : 'single listed common stock'}.
- ETF: no single-company financial statements / PE / PB / moat; focus on underlying index, holdings, expense ratio, premium/discount to NAV, and tracking error instead.
- Stock: standard equity valuation (financial statements, PE/PB, moat) applies.`

    // Early-Exit Guard 門禁防禦：如果即時報價與 Profile 均無法獲取，代表無效股票代號，立即中斷阻斷！
    const hasValidQuote = quote && typeof quote.price === 'number' && quote.price > 0
    const hasValidProfile = profile && profile.name && profile.name !== resolvedTicker

    if (!hasValidQuote && !hasValidProfile) {
      throw new Error(`無法驗證股票代號 [${ticker}]。查無此股票之即時市場數據與基本面資料，已終止 AI 分析。請確認代號是否正確（例如台股 2330 / 2330.TW 或美股 AAPL）。`)
    }

    try {
      onProgress?.('Data Fetcher', `Fetching historical charts for ${resolvedTicker}...`)
      const history = await tools.getStockData(resolvedTicker)
      if (history && history.length > 0) {
        const recent = history.slice(-15)
        historyContext = `Recent 15-day Price History (OHLCV):
${recent.map(h => `- ${new Date(h.timestamp).toISOString().split('T')[0]}: Open $${h.open.toFixed(2)}, High $${h.high.toFixed(2)}, Low $${h.low.toFixed(2)}, Close $${h.close.toFixed(2)}, Vol ${h.volume}`).join('\n')}`
      }
    } catch (e: any) {
      console.warn(`[TradingEngine] Failed to fetch historical data for ${resolvedTicker}:`, e.message)
    }

    const instrumentContext = `${assetTypeContext}

The instrument to analyze is ${resolvedTicker}.

${profileContext}

${quoteContext}

${historyContext}`

    const initialState: AnalysisState = {
      ticker: resolvedTicker,
      tradeDate,
      assetType,
      instrumentContext,
      pastContext: this.memory.getPastContext(ticker),
      outputLanguage,
      outputInstruction,
      marketReport: '',
      sentimentReport: '',
      newsReport: '',
      fundamentalsReport: '',
      investDebate: {
        bullHistory: '',
        bearHistory: '',
        history: '',
        currentResponse: '',
        judgeDecision: '',
        round: 0,
      },
      investmentPlan: '',
      traderProposal: '',
      riskDebate: {
        aggressiveHistory: '',
        conservativeHistory: '',
        neutralHistory: '',
        history: '',
        latestSpeaker: '',
        judgeDecision: '',
        round: 0,
      },
      finalDecision: '',
    }

    const graph = new WorkflowGraph()

    // agent 名稱 → 該 agent 產出的報告欄位（字串）；用於 fallback 時在末尾附加備援說明。
    const reportFieldByAgent: Record<string, keyof AnalysisState> = {
      'Market Analyst': 'marketReport',
      'Sentiment Analyst': 'sentimentReport',
      'News Analyst': 'newsReport',
      'Fundamentals Analyst': 'fundamentalsReport',
      'Research Manager': 'investmentPlan',
      'Trader': 'traderProposal',
      'Portfolio Manager': 'finalDecision',
    }

    const formatFallbackNote = (u: AgentUsage): string =>
      `\n\n---\n_⚠️ 本回覆已自動切換至備援模型：**${u.model}** (Token: prompt ${u.promptTokens} / completion ${u.completionTokens} / 合計 ${u.totalTokens})_`

    const appendFallbackNote = (
      result: Partial<AnalysisState>,
      name: string,
      usage: AgentUsage | null,
    ) => {
      if (!usage?.usedFallback) return
      const field = reportFieldByAgent[name]
      if (field && typeof result[field] === 'string') {
        ;(result as Record<string, any>)[field] += formatFallbackNote(usage)
      } else if (name === 'Bull Researcher' && result.investDebate?.currentResponse) {
        result.investDebate = {
          ...result.investDebate,
          currentResponse: result.investDebate.currentResponse + formatFallbackNote(usage),
        }
      }
    }

    const wrap = (name: string, fn: (s: AnalysisState) => Promise<Partial<AnalysisState>>) => {
      return async (s: AnalysisState) => {
        onProgress?.(name, 'running...')
        this.usageTracker.setCurrentAgent(name)
        const result = await fn(s)
        appendFallbackNote(result, name, this.usageTracker.getAgent(name))
        onProgress?.(name, 'done')
        return result
      }
    }

    const nodeFactories: Array<[string, (s: AnalysisState) => Promise<Partial<AnalysisState>>]> = [
      ['Market Analyst', createMarketAnalyst(this.quickLLM)],
      ['Sentiment Analyst', createSentimentAnalyst(this.quickLLM)],
      ['News Analyst', createNewsAnalyst(this.quickLLM)],
      ['Fundamentals Analyst', createFundamentalsAnalyst(this.quickLLM)],
      ['Bull Researcher', createBullResearcher(this.quickLLM)],
      ['Research Manager', createResearchManager(this.deepLLM)],
      ['Trader', createTrader(this.quickLLM)],
      ['Portfolio Manager', createPortfolioManager(this.deepLLM)],
    ]

    const activeNodes = nodeFactories.filter(([key]) => enabledSet.has(key))

    for (const [name, fn] of activeNodes) {
      graph.addNode(name, wrap(name, fn))
    }

    for (let i = 0; i < activeNodes.length - 1; i++) {
      graph.addEdge({ from: activeNodes[i][0], to: activeNodes[i + 1][0] })
    }
    graph.addEdge({ from: activeNodes[activeNodes.length - 1][0], to: '__end__' })

    graph.setEntryPoint(activeNodes[0][0])

    const finalState = await graph.execute(initialState)
    const signal = this.signalProcessor.process(finalState.finalDecision)
    const tokenUsage = this.usageTracker.getSummary()

    await this.memory.store({
      ticker,
      date: tradeDate,
      rating: signal,
      decision: finalState.finalDecision,
      pending: true,
    })

    return { state: finalState, signal, tokenUsage }
  }
}
