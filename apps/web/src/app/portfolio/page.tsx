'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp, Zap, RefreshCw, Sparkles, History, ChevronDown, ChevronUp, Upload, Trash2, CheckCircle2, Plus, X, Search } from 'lucide-react'
import { searchStocks, StockCandidateList } from '@/components/stock-search'
import { useI18n } from '@/i18n/LanguageProvider'

function formatLLMError(raw: string, llmRateLimited: string): string {
  if (/rate.?limit|429|tokens per minute|TPM|exhausted/i.test(raw)) {
    return llmRateLimited
  }
  return raw
}

type Market = 'tw' | 'us'

function buildStrategies(ui: {
  strategyBuffett: string; strategyBuffettEn: string;
  strategyGrowth: string; strategyGrowthEn: string;
  strategyDividend: string; strategyDividendEn: string;
  strategyMomentum: string; strategyMomentumEn: string;
  strategyBalanced: string; strategyBalancedEn: string;
}) {
  return [
    { id: 'buffett', nameZh: ui.strategyBuffett, nameEn: ui.strategyBuffettEn },
    { id: 'growth', nameZh: ui.strategyGrowth, nameEn: ui.strategyGrowthEn },
    { id: 'dividend', nameZh: ui.strategyDividend, nameEn: ui.strategyDividendEn },
    { id: 'momentum', nameZh: ui.strategyMomentum, nameEn: ui.strategyMomentumEn },
    { id: 'balanced', nameZh: ui.strategyBalanced, nameEn: ui.strategyBalancedEn },
  ]
}

interface PnL {
  costBasis: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  totalReturn: number
  totalReturnPct: number
  yieldOnCost: number
}

interface Advice {
  rating: 'BUY' | 'HOLD' | 'SELL' | 'AVOID'
  confidence: number
  fairValue?: number
  marginOfSafety?: number
  upsideDownsidePct?: number
  summary: string
  keyPoints: string[]
  risks: string[]
  action: string
}

interface HistoryItem {
  id: number
  market: Market
  symbol: string
  symbol_name: string | null
  shares: number
  cost: number
  current_price: number
  dividend: number
  cost_basis: number
  market_value: number
  unrealized_pnl: number
  unrealized_pnl_pct: number
  total_return: number
  total_return_pct: number
  yield_on_cost: number
  strategy: string | null
  recommendation: string | null
  summary: string | null
  report_json: string | null
  created_at: string
}

interface RecognizedPosition {
  market: Market
  symbol: string
  symbolName?: string
  shares: number
  cost: number
  currentPrice: number
  dividend: number
}

const RATING_STYLE: Record<string, { text: string; bg: string }> = {
  BUY: { text: 'text-[var(--accent-green)]', bg: 'var(--accent-green)' },
  HOLD: { text: 'text-[var(--accent)]', bg: 'var(--accent)' },
  SELL: { text: 'text-[var(--accent-red)]', bg: 'var(--accent-red)' },
  AVOID: { text: 'text-[var(--text-secondary)]', bg: 'var(--text-secondary)' },
}

function formatMoney(n: number, market: Market): string {
  const symbol = market === 'tw' ? 'NT$' : '$'
  return `${symbol}${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function num(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export default function PortfolioPage() {
  const router = useRouter()
  const { dict } = useI18n()
  const ui = dict.portfolio
  const STRATEGIES = useMemo(() => buildStrategies(ui), [ui])

  const [market, setMarket] = useState<Market>('tw')
  const [symbol, setSymbol] = useState('')
  const [symbolName, setSymbolName] = useState<string>('')
  const [shares, setShares] = useState('')
  const [cost, setCost] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [dividend, setDividend] = useState('')
  const [strategyId, setStrategyId] = useState('buffett')

  const [quoteLoading, setQuoteLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [savedResult, setSavedResult] = useState<(PnL & { id: number; market: Market; symbol: string; symbolName?: string }) | null>(null)
  const [aiResult, setAiResult] = useState<{ advice: Advice; strategy: { nameZh: string; nameEn: string }; usedFallback?: boolean } | null>(null)
  const [progress, setProgress] = useState<{ step: string; detail: string }[]>([])
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null)

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const [authMode, setAuthMode] = useState<'loading' | 'user' | 'guest'>('loading')
  const [claimOpen, setClaimOpen] = useState(false)
  const [claimResult, setClaimResult] = useState<string | null>(null)
  const [claimRedeem, setClaimRedeem] = useState('')
  const [claimError, setClaimError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  const [recognitionQuota, setRecognitionQuota] = useState<{ used: number; max: number; remaining: number } | null>(null)
  const [recognized, setRecognized] = useState<Array<RecognizedPosition & { saved?: boolean }>>([])
  const [recognitionMethod, setRecognitionMethod] = useState<'vision' | 'ocr' | null>(null)
  const [enrichState, setEnrichState] = useState<{ names: number; symbols: number; prices: number } | null>(null)
  const [searchFor, setSearchFor] = useState<number | null>(null)
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; name: string }>>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const buildPayload = () => {
    const nShares = num(shares)
    const nCost = num(cost)
    const nPrice = num(currentPrice)
    const nDiv = num(dividend) ?? 0
    if (!symbol.trim()) {
      setError(ui.errSymbolRequired)
      return null
    }
    if (nShares == null || !(nShares > 0)) {
      setError(ui.errSharesGreaterThanZero)
      return null
    }
    if (nCost == null || nCost < 0) {
      setError(ui.errCostNonNegative)
      return null
    }
    if (nPrice == null || !(nPrice > 0)) {
      setError(ui.errPriceGreaterThanZero)
      return null
    }
    return {
      market,
      symbol: symbol.trim().toUpperCase(),
      shares: nShares,
      cost: nCost,
      currentPrice: nPrice,
      dividend: nDiv,
      symbolName: symbolName || undefined,
    }
  }

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/portfolio/records?limit=20')
      const data = await res.json()
      if (data.success) setHistory(data.records)
    } catch (e) {
      console.error('Failed to fetch portfolio history:', e)
    }
  }

  const fetchRecognitionQuota = async () => {
    try {
      const res = await fetch('/api/portfolio/recognize')
      const data = await res.json()
      if (data && typeof data.remaining === 'number') setRecognitionQuota(data)
    } catch {}
  }

  useEffect(() => {
    if (authMode === 'user') fetchRecognitionQuota()
  }, [authMode])

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error(ui.errImageReadFailed))
      reader.onload = () => {
        const img = new Image()
        img.onerror = () => reject(new Error(ui.errImageFormatUnknown))
        img.onload = () => {
          const MAX = 1600
          let { width, height } = img
          if (width > MAX || height > MAX) {
            const ratio = Math.min(MAX / width, MAX / height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error(ui.errImageCannotProcess))
            return
          }
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.src = reader.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  const handleRecognize = async (file: File) => {
    if (authMode !== 'user') {
      setError(ui.guestAiLoginRequired)
      return
    }
    if (!file.type.startsWith('image/')) {
      setError(ui.errUploadImage)
      return
    }
    setError(null)
    setRecognizing(true)
    setRecognized([])
    setRecognitionMethod(null)
    setEnrichState(null)
    setSearchFor(null)
    setSearchResults([])
    try {
      const preview = await resizeImage(file)
      setImagePreview(preview)
      const res = await fetch('/api/portfolio/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: preview }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        if (typeof data?.quota?.used === 'number') setRecognitionQuota(data.quota)
        setRecognizing(false)
        return
      }
      const positions = (data.positions ?? []).map((p: RecognizedPosition) => ({
        market: p.market === 'us' ? 'us' : 'tw',
        symbol: p.symbol,
        symbolName: p.symbolName,
        shares: p.shares,
        cost: p.cost,
        currentPrice: p.currentPrice,
        dividend: p.dividend ?? 0,
        saved: false,
      }))
      setRecognized(positions)
      setRecognitionMethod(data.method === 'ocr' ? 'ocr' : data.method === 'vision' ? 'vision' : null)
      if (data.enriched) setEnrichState(data.enriched)
      if (data.quota) setRecognitionQuota(data.quota)
      if (positions.length === 0) setError(ui.errRecognizeNone)
    } catch (e: any) {
      setError(e.message || ui.errRecognizeFailed)
    } finally {
      setRecognizing(false)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleRecognize(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleRecognize(file)
  }

  const updateRecognized = (index: number, patch: Partial<RecognizedPosition> & { saved?: boolean }) => {
    setRecognized((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch, saved: false } : p)))
  }

  const handleSearchStock = async (i: number) => {
    const p = recognized[i]
    const q = (p.symbolName || p.symbol || '').trim()
    if (!q) {
      setError(ui.errSearchFillNameOrSymbol)
      return
    }
    setError(null)
    setSearchLoading(true)
    try {
      const results = await searchStocks(q, p.market)
      setSearchResults(results)
      setSearchFor(i)
    } catch {
      setError(ui.errSearchFailed)
    } finally {
      setSearchLoading(false)
    }
  }

  const handlePickStock = async (i: number, r: { symbol: string; name: string }) => {
    setSearchFor(null)
    const p = recognized[i]
    updateRecognized(i, { symbol: r.symbol.toUpperCase(), symbolName: r.name || undefined })
    setNotice(ui.noticePickFilled.replace('{symbol}', r.symbol))
    try {
      const res = await fetch(`/api/portfolio/quote?symbol=${encodeURIComponent(r.symbol)}&market=${p.market}`)
      const data = await res.json()
      if (res.ok && typeof data.price === 'number') {
        updateRecognized(i, { currentPrice: data.price, symbolName: data.name || r.name || undefined })
        setNotice(ui.noticePickPriceFetched.replace('{symbol}', data.symbol).replace('{name}', data.name || r.name).replace('{price}', String(data.price)))
      } else {
        setNotice(ui.noticePickManualPrice.replace('{symbol}', r.symbol))
      }
    } catch {
      setNotice(ui.noticePickManualPrice.replace('{symbol}', r.symbol))
    }
  }

  const saveRecognizedPosition = async (p: RecognizedPosition & { saved?: boolean }, index: number) => {
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: p.market,
          symbol: p.symbol.toUpperCase(),
          shares: p.shares,
          cost: p.cost,
          currentPrice: p.currentPrice,
          dividend: p.dividend ?? 0,
          symbolName: p.symbolName || undefined,
          strategyId,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(ui.errRecordSaveFailed.replace('{symbol}', p.symbol).replace('{error}', data.error))
        return false
      }
      updateRecognized(index, { saved: true })
      await fetchHistory()
      return true
    } catch {
      setError(ui.errRecordSaveError.replace('{symbol}', p.symbol))
      return false
    }
  }

  const saveAllRecognized = async () => {
    const pending = recognized.map((p, i) => ({ p, i })).filter((x) => !x.p.saved)
    let ok = 0
    for (const { p, i } of pending) {
      const r = await saveRecognizedPosition(p, i)
      if (r) ok++
    }
    if (ok > 0) {
      setNotice(ui.noticeCreatedRecords.replace('{n}', String(ok)))
      setShowAdd(false)
    } else {
      setNotice(null)
    }
  }

  const clearRecognition = () => {
    if (recognizing) return
    setImagePreview(null)
    setRecognized([])
    setRecognitionMethod(null)
    setEnrichState(null)
    setSearchFor(null)
    setSearchResults([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me')
        const data = await res.json()
        setAuthMode(data?.success ? 'user' : 'guest')
      } catch {
        setAuthMode('guest')
      }
      await fetchHistory()
    })()
  }, [router])

  const handleCreateClaim = async () => {
    setClaimError(null)
    setClaimResult(null)
    try {
      const res = await fetch('/api/portfolio/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setClaimError(data.error || '產生認領碼失敗')
        return
      }
      setClaimResult(data.code)
    } catch (e: any) {
      setClaimError(e.message || '產生認領碼失敗')
    }
  }

  const handleRedeemClaim = async () => {
    setClaimError(null)
    setClaimResult(null)
    if (!claimRedeem.trim()) {
      setClaimError(ui.guestErrCodeRequired)
      return
    }
    try {
      const res = await fetch('/api/portfolio/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redeem', code: claimRedeem }),
      })
      const data = await res.json()
      if (!res.ok) {
        setClaimError(data.error || '兌換認領碼失敗')
        return
      }
      setClaimRedeem('')
      setClaimResult(ui.guestRedeemed)
      await fetchHistory()
    } catch (e: any) {
      setClaimError(e.message || '兌換認領碼失敗')
    }
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (retryCountdown === null || retryCountdown <= 0) return
    retryTimerRef.current = setInterval(() => {
      setRetryCountdown(prev => {
        if (prev === null || prev <= 1) return null
        return prev - 1
      })
    }, 1000)
    return () => { if (retryTimerRef.current) clearInterval(retryTimerRef.current) }
  }, [retryCountdown !== null])

  const handleFetchQuote = async () => {
    const sym = symbol.trim()
    if (!sym) {
      setError(ui.errQuoteRequired)
      return
    }
    setQuoteLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/portfolio/quote?symbol=${encodeURIComponent(sym)}&market=${market}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || ui.errQuoteFailed)
        return
      }
      setCurrentPrice(String(data.price))
      if (data.name) setSymbolName(data.name)
      setNotice(ui.noticeFetchedQuote.replace('{symbol}', data.symbol).replace('{price}', String(data.price)))
    } catch (e: any) {
      setError(e.message || ui.errQuoteFailed)
    } finally {
      setQuoteLoading(false)
    }
  }

  const handleSave = async () => {
    const payload = buildPayload()
    if (!payload) return
    setSaving(true)
    setError(null)
    setNotice(null)
    setAiResult(null)
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
        return
      }
      setSavedResult(data.record)
      setNotice(ui.noticeSavedPnlRecord)
      await fetchHistory()
      setShowAdd(false)
    } catch (e: any) {
      setError(e.message || ui.noticeSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  const handleAnalyze = async () => {
    if (authMode !== 'user') {
      setError(ui.guestAiLoginRequired)
      return
    }
    const payload = buildPayload()
    if (!payload) return
    setAnalyzing(true)
    setError(null)
    setNotice(null)
    setAiResult(null)
    setProgress([])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/portfolio/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, strategyId }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        if (res.status === 401) {
          router.replace(`/login?redirect=${encodeURIComponent('/portfolio')}`)
          return
        }
        if (res.status === 429) {
          setError(body.error || ui.rateLimitError.replace('{used}', String(body.quota?.used ?? 3)))
          return
        }
        setError(body.error || `HTTP ${res.status}`)
        return
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''
        for (const block of blocks) {
          const lines = block.split('\n')
          let eventType = 'message'
          let data = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7)
            else if (line.startsWith('data: ')) data = line.slice(6)
          }
          if (!data) continue
          const parsed = JSON.parse(data)
          if (eventType === 'progress') {
            setProgress(prev => [...prev, parsed])
            if (parsed.step === 'LLM' && typeof parsed.detail === 'string') {
              const m = parsed.detail.match(/retrying in (\d+)s/)
              if (m) setRetryCountdown(parseInt(m[1], 10))
            }
          } else if (eventType === 'result') {
            setAiResult(parsed)
            setRetryCountdown(null)
            window.dispatchEvent(new Event('quota-updated'))
            await fetchHistory()
          } else if (eventType === 'error') {
            setError(formatLLMError(parsed.message, ui.llmRateLimited))
            setRetryCountdown(null)
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      setAnalyzing(false)
      setRetryCountdown(null)
      if (retryTimerRef.current) clearInterval(retryTimerRef.current)
      abortRef.current = null
    }
  }

  const ratingColor = (rating?: string | null) => (rating ? RATING_STYLE[rating]?.text || 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')

  const expandHistory = (item: HistoryItem) => {
    setExpandedId(prev => (prev === item.id ? null : item.id))
  }

  const strategyName = (id: string | null) => STRATEGIES.find(s => s.id === id)?.nameZh ?? id ?? ''
  const currency = market === 'tw' ? 'NT$' : '$'

  const stats = useMemo(() => {
    const byMarket: Record<Market, { count: number; pnl: number }> = {
      tw: { count: 0, pnl: 0 },
      us: { count: 0, pnl: 0 },
    }
    for (const r of history) {
      const m = r.market === 'us' ? 'us' : 'tw'
      byMarket[m].count += 1
      byMarket[m].pnl += r.unrealized_pnl
    }
    return byMarket
  }, [history])

  const inputCls =
    'w-full bg-[var(--bg-secondary)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-[var(--accent-green)]" />
          <div>
            <h1 className="text-2xl font-bold">{ui.headerTitle}</h1>
            <p className="text-sm text-[var(--text-secondary)]">{showAdd ? ui.headerSubtitleAdd : ui.headerSubtitleView}</p>
          </div>
        </div>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" />
            {ui.headerAdd}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mb-4">{error}</p>}
      {notice && <p className="text-xs text-[var(--accent)] mb-4">{notice}</p>}

      {authMode === 'guest' && (
        <div className="bg-[var(--bg-card)] border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 text-sm">
              <p className="font-medium text-[var(--text-primary)]">{ui.guestBannerTitle}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">{ui.guestBannerDesc}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href="/login?redirect=/portfolio"
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition"
              >
                {ui.guestLogin}
              </a>
              <button
                type="button"
                onClick={() => setClaimOpen(v => !v)}
                className="px-4 py-2 rounded-lg bg-white/10 text-sm hover:bg-white/15 transition"
              >
                {ui.guestClaimBtn}
              </button>
            </div>
          </div>

          {claimOpen && (
            <div className="mt-4 border-t border-white/10 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-[var(--text-primary)] mb-1">{ui.guestCreateTitle}</p>
                <p className="text-xs text-[var(--text-secondary)] mb-2">{ui.guestCreateHint}</p>
                <button
                  type="button"
                  onClick={handleCreateClaim}
                  className="px-4 py-2 rounded-lg bg-white/10 text-sm hover:bg-white/15 transition"
                >
                  {ui.guestCreate}
                </button>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-primary)] mb-1">{ui.guestRedeemTitle}</p>
                <div className="flex gap-2">
                  <input
                    value={claimRedeem}
                    onChange={e => setClaimRedeem(e.target.value)}
                    placeholder={ui.guestRedeemPlaceholder}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={handleRedeemClaim}
                    className="shrink-0 px-4 py-2 rounded-lg bg-[var(--accent-green)] text-white text-sm font-medium hover:opacity-90 transition"
                  >
                    {ui.guestRedeem}
                  </button>
                </div>
              </div>
              {claimResult && (
                <div className="md:col-span-2 rounded-lg bg-[var(--bg-secondary)] border border-white/10 p-3">
                  <p className="text-xs text-[var(--text-secondary)]">
                    {ui.guestCreateTitle}：
                  </p>
                  <p className="font-mono text-lg tracking-wider text-[var(--accent-green)] break-all select-all mt-1">{claimResult}</p>
                  {claimResult !== ui.guestRedeemed && (
                    <p className="text-[10px] text-amber-400 mt-1">{ui.guestCreateHint}</p>
                  )}
                </div>
              )}
              {claimError && <p className="md:col-span-2 text-xs text-red-400">{claimError}</p>}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4 text-[var(--accent)]" />
              {ui.addPanelTitle}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{ui.addPanelSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-sm text-[var(--text-primary)] hover:bg-white/15 transition"
          >
            <X className="w-4 h-4" />
            {ui.addPanelBack}
          </button>
        </div>

      {authMode === 'user' && (
      <div className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Upload className="w-4 h-4 text-[var(--accent)]" />
            {ui.aiUploadTitle}
          </h2>
          {recognitionQuota != null && (
            <span className="text-xs text-[var(--text-secondary)]">
              {ui.aiUploadQuotaLabel.replace('{remaining}', String(recognitionQuota.remaining)).replace('{max}', String(recognitionQuota.max))}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-4">{ui.aiUploadDesc}</p>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} disabled={recognizing} />
        <div
          onDragOver={e => {
            e.preventDefault()
            if (recognizing) return
          }}
          onDrop={recognizing ? undefined : handleDrop}
          onClick={() => {
            if (recognizing) return
            fileInputRef.current?.click()
          }}
          className={`rounded-xl p-8 text-center transition group ${
            recognizing
              ? 'cursor-wait border-2 border-dashed border-white/10 opacity-60 pointer-events-none'
              : 'cursor-pointer border-2 border-dashed border-white/10 hover:border-[var(--accent)]'
          }`}
        >
          <Upload className="w-10 h-10 mx-auto mb-3 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition" />
          {recognizing ? (
            <p className="text-sm text-[var(--text-secondary)] flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              {ui.uploadRecognizing}
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--text-primary)]">{ui.uploadHintDrag}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{ui.uploadHintSupport}</p>
            </>
          )}
        </div>

        {imagePreview && (
          <div className="mt-4">
            <div className="flex items-start gap-4 mb-4">
              <img src={imagePreview} alt={ui.altPreview} className="max-h-40 w-auto rounded-lg border border-white/10" />
              <div className="text-sm">
                <p className="font-medium text-[var(--text-primary)]">
                  {recognized.length > 0
                    ? <>{ui.previewDetected.replace('{n}', String(recognized.length))}</>
                    : ui.previewWaitAi}
                </p>
                {recognized.length > 0 && recognitionMethod === 'ocr' && (
                  <p className="mt-1 text-[11px] text-amber-400">{ui.previewOcrFallback}</p>
                )}
                <button
                  type="button"
                  onClick={clearRecognition}
                  disabled={recognizing}
                  className="mt-2 text-xs text-[var(--text-secondary)] hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--text-secondary)]"
                >
                  {ui.previewClearResult}
                </button>
              </div>
            </div>

            {recognized.length > 0 && (
              <div className="space-y-3">
                {enrichState && (enrichState.symbols + enrichState.names + enrichState.prices) > 0 && (
                  <p className="text-[11px] text-[var(--accent)]">
                    {ui.enrichAutoFill.replace('{symbols}', String(enrichState.symbols)).replace('{names}', String(enrichState.names)).replace('{prices}', String(enrichState.prices))}
                    <Search className="w-3 h-3 inline" /> {ui.enrichSearch}
                  </p>
                )}
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-xs min-w-[720px]">
                    <thead>
                      <tr className="text-left text-[var(--text-secondary)] border-b border-white/10 bg-[var(--bg-secondary)]/50">
                        <th className="px-2 py-2 font-medium">{ui.colIndex}</th>
                        <th className="px-2 py-2 font-medium">{ui.colMarket}</th>
                        <th className="px-2 py-2 font-medium">{ui.colSymbol}</th>
                        <th className="px-2 py-2 font-medium">{ui.colName}</th>
                        <th className="px-2 py-2 font-medium">{ui.colShares}</th>
                        <th className="px-2 py-2 font-medium">{ui.colCostPerShare}</th>
                        <th className="px-2 py-2 font-medium">{ui.colCurrentPrice}</th>
                        <th className="px-2 py-2 font-medium">{ui.colDividend}</th>
                        <th className="px-2 py-2 font-medium">{ui.colStatus}</th>
                        <th className="px-2 py-2 font-medium text-right">{ui.colAction}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recognized.map((p, i) => (
                        <Fragment key={i}>
                        <tr className={`border-b border-white/5 ${p.saved ? 'opacity-60' : ''}`}>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1 min-w-[64px]">
                              <span className="text-[var(--text-secondary)]">{i + 1}</span>
                              {(!p.symbol || !p.currentPrice || p.currentPrice <= 0) && (
                                <button
                                  type="button"
                                  onClick={() => handleSearchStock(i)}
                                  className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 bg-[var(--bg-secondary)] text-[var(--accent)] hover:border-[var(--accent)] transition text-[10px]"
                                  title={ui.btnSearchStock}
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  {ui.btnSync}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={p.market}
                              onChange={e => updateRecognized(i, { market: e.target.value as Market })}
                              className="bg-[var(--bg-secondary)] border border-white/10 rounded px-1 py-1"
                            >
                              <option value="tw">{ui.marketTw}</option>
                              <option value="us">{ui.marketUs}</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              value={p.symbol}
                              onChange={e => updateRecognized(i, { symbol: e.target.value.toUpperCase() })}
                              className="w-20 bg-[var(--bg-secondary)] border border-white/10 rounded px-2 py-1"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              value={p.symbolName ?? ''}
                              placeholder={ui.placeholderName}
                              onChange={e => updateRecognized(i, { symbolName: e.target.value })}
                              className="w-24 bg-[var(--bg-secondary)] border border-white/10 rounded px-2 py-1"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number" min="0" value={p.shares}
                              onChange={e => updateRecognized(i, { shares: Number(e.target.value) || 0 })}
                              className="w-24 bg-[var(--bg-secondary)] border border-white/10 rounded px-2 py-1"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number" min="0" step="0.01" value={p.cost}
                              onChange={e => updateRecognized(i, { cost: Number(e.target.value) || 0 })}
                              className="w-24 bg-[var(--bg-secondary)] border border-white/10 rounded px-2 py-1"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number" min="0" step="0.01" value={p.currentPrice}
                              onChange={e => updateRecognized(i, { currentPrice: Number(e.target.value) || 0 })}
                              className="w-24 bg-[var(--bg-secondary)] border border-white/10 rounded px-2 py-1"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number" min="0" step="0.01" value={p.dividend}
                              onChange={e => updateRecognized(i, { dividend: Number(e.target.value) || 0 })}
                              className="w-24 bg-[var(--bg-secondary)] border border-white/10 rounded px-2 py-1"
                            />
                          </td>
                          <td className="px-2 py-2">
                            {p.saved ? (
                              <span className="flex items-center gap-1 text-[var(--accent-green)]">
                                <CheckCircle2 className="w-3.5 h-3.5" /> {ui.statusSaved}
                              </span>
                            ) : (
                              <span className="text-[var(--text-secondary)]">{ui.statusUnsaved}</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleSearchStock(i)}
                                className="text-[var(--text-secondary)] hover:text-[var(--accent)]"
                                title={ui.btnSearchStock}
                              >
                                <Search className="w-3.5 h-3.5" />
                              </button>
                              {p.saved ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await fetchHistory()
                                    setNotice(ui.noticeRecordUpdated.replace('{symbol}', p.symbol))
                                    setExpandedId(null)
                                  }}
                                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                >
                                  {ui.btnViewRecord}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => saveRecognizedPosition(p, i)}
                                  className="text-[var(--accent)] hover:text-[var(--accent-green)]"
                                >
                                  {ui.btnCreate}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setRecognized(prev => prev.filter((_, j) => j !== i))}
                                className="text-[var(--text-secondary)] hover:text-red-400"
                                title={ui.btnDeleteRow}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {searchFor === i && (
                          <tr className="bg-[var(--bg-secondary)]/60 border-b border-white/5">
                            <td colSpan={10} className="px-2 py-2">
                              {(searchLoading || searchResults.length === 0) && (
                                <div className="flex items-center justify-between gap-2">
                                  <StockCandidateList
                                    candidates={searchResults}
                                    loading={searchLoading}
                                    onPick={() => {}}
                                    layout="chips"
                                    emptyText={ui.searchEmptyResult}
                                    className="flex-auto"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setSearchFor(null)}
                                    className="ml-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0"
                                  >
                                    <X className="w-3.5 h-3.5 inline" /> {ui.searchClose}
                                  </button>
                                </div>
                              )}
                              {!searchLoading && searchResults.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <p className="text-xs text-[var(--text-secondary)]">{ui.searchPickPrompt}</p>
                                    <button
                                      type="button"
                                      onClick={() => setSearchFor(null)}
                                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    >
                                      <X className="w-3.5 h-3.5 inline" /> {ui.searchCancel}
                                    </button>
                                  </div>
                                  <StockCandidateList
                                    candidates={searchResults}
                                    loading={false}
                                    onPick={(r) => handlePickStock(i, r)}
                                    layout="chips"
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <p className="text-xs text-[var(--text-secondary)]">{ui.editHint}</p>
                  <button
                    type="button"
                    onClick={saveAllRecognized}
                    className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-green)] text-white text-sm font-medium hover:opacity-90 transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {ui.btnSaveAll}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {authMode !== 'user' && (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-6 mb-6 text-center">
          <p className="text-sm text-[var(--text-secondary)] mb-3">{ui.guestAiLoginRequired}</p>
          <a
            href="/login?redirect=/portfolio"
            className="inline-flex px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition"
          >
            {ui.guestLogin}
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{ui.formMarket}</span>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {(['tw', 'us'] as Market[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMarket(m); setSymbol(''); setSymbolName(''); setCurrentPrice('') }}
                  className={`px-4 py-1.5 text-sm transition ${market === m ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  {m === 'tw' ? ui.marketTw : ui.marketUs}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">{ui.formSymbolLabel.replace('{example}', market === 'tw' ? ui.formSymbolExampleTw : ui.formSymbolExampleUs)}</label>
            <div className="flex gap-2">
              <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder={market === 'tw' ? '2330' : 'AAPL'} className={inputCls} />
              <button
                type="button"
                onClick={handleFetchQuote}
                disabled={quoteLoading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 text-sm hover:bg-white/15 transition disabled:opacity-50"
              >
                {quoteLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {ui.formFetchPrice}
              </button>
            </div>
            {symbolName && <p className="mt-1 text-xs text-[var(--accent)]">{symbolName}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">{ui.formShares}</label>
              <input type="number" min="0" step="1" value={shares} onChange={e => setShares(e.target.value)} placeholder="1000" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">{ui.formCostPerShare.replace('{currency}', currency)}</label>
              <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} placeholder="100" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">{ui.formPricePerShare.replace('{currency}', currency)}</label>
              <input type="number" min="0" step="0.01" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} placeholder="110" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">{ui.formCumDividend.replace('{currency}', currency)}</label>
              <input type="number" min="0" step="0.01" value={dividend} onChange={e => setDividend(e.target.value)} placeholder="0" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">{ui.formStrategy}</label>
            <select value={strategyId} onChange={e => setStrategyId(e.target.value)} className={inputCls}>
              {STRATEGIES.map(s => (
                <option key={s.id} value={s.id}>{s.nameZh}（{s.nameEn}）</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || analyzing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/15 transition disabled:opacity-50"
            >
              <History className="w-4 h-4" />
              {saving ? ui.formSaving : ui.formSavePnl}
            </button>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || saving || authMode !== 'user'}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {analyzing ? ui.formAiAnalyzing : ui.formAiAnalyze}
            </button>
          </div>

          {analyzing && (
            <div className="space-y-1">
              {retryCountdown !== null && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-amber-400">
                    {ui.rateLimitRetrying.replace('{n}', String(retryCountdown))}
                  </span>
                </div>
              )}
              {progress.map((p, i) => (
                <p key={i} className="text-xs text-[var(--text-secondary)]">
                  {p.step}: {p.detail}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {savedResult && (
            <div className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-6">
              <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--accent-green)]" />
                {savedResult.symbolName || savedResult.symbol} — {ui.resultTitle}
              </h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[var(--text-secondary)] text-xs">{ui.resultTotalCost}</p>
                  <p className="font-medium">{formatMoney(savedResult.costBasis, savedResult.market)}</p>
                </div>
                <div>
                  <p className="text-[var(--text-secondary)] text-xs">{ui.resultMarketValue}</p>
                  <p className="font-medium">{formatMoney(savedResult.marketValue, savedResult.market)}</p>
                </div>
                <div>
                  <p className="text-[var(--text-secondary)] text-xs">{ui.resultUnrealizedPnl}</p>
                  <p className={`font-bold ${savedResult.unrealizedPnl >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                    {formatMoney(savedResult.unrealizedPnl, savedResult.market)}{' '}
                    <span className="text-xs">{formatPct(savedResult.unrealizedPnlPct)}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[var(--text-secondary)] text-xs">{ui.resultTotalReturn}</p>
                  <p className={`font-bold ${savedResult.totalReturn >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                    {formatMoney(savedResult.totalReturn, savedResult.market)}{' '}
                    <span className="text-xs">{formatPct(savedResult.totalReturnPct)}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[var(--text-secondary)] text-xs">{ui.resultYieldOnCost}</p>
                  <p className="font-medium">{savedResult.yieldOnCost.toFixed(2)}%</p>
                </div>
              </div>
            </div>
          )}

          {aiResult && (
            <div className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                  {ui.aiSuggestionTitle.replace('{strategy}', aiResult.strategy.nameZh)}
                </h2>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${RATING_STYLE[aiResult.advice.rating]?.text}`}
                  style={{ backgroundColor: `${RATING_STYLE[aiResult.advice.rating]?.bg}22` }}>
                  {aiResult.advice.rating}
                </span>
              </div>
              <p className="text-sm mb-1">{ui.aiConfidence.replace('{pct}', (aiResult.advice.confidence * 100).toFixed(0))}</p>
              {(aiResult.advice.fairValue != null || aiResult.advice.marginOfSafety != null || aiResult.advice.upsideDownsidePct != null) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] mb-2">
                  {aiResult.advice.fairValue != null && <span>{ui.aiFairValue.replace('{currency}', currency).replace('{value}', aiResult.advice.fairValue.toLocaleString('en-US', { maximumFractionDigits: 2 }))}</span>}
                  {aiResult.advice.marginOfSafety != null && <span>{ui.aiMarginOfSafety.replace('{pct}', aiResult.advice.marginOfSafety.toFixed(2))}</span>}
                  {aiResult.advice.upsideDownsidePct != null && <span>{ui.aiUpside.replace('{pct}', formatPct(aiResult.advice.upsideDownsidePct))}</span>}
                </div>
              )}
              <p className="text-sm font-medium mb-2">{aiResult.advice.summary}</p>
              <div className="mb-2">
                <p className="text-xs text-[var(--text-secondary)] mb-1">{ui.aiKeyPoints}</p>
                <ul className="space-y-0.5">
                  {aiResult.advice.keyPoints.map((k, i) => (
                    <li key={i} className="text-xs text-[var(--text-primary)]">• {k}</li>
                  ))}
                </ul>
              </div>
              <div className="mb-3">
                <p className="text-xs text-[var(--text-secondary)] mb-1">{ui.aiRisks}</p>
                <ul className="space-y-0.5">
                  {aiResult.advice.risks.map((r, i) => (
                    <li key={i} className="text-xs text-[var(--accent-red)]">• {r}</li>
                  ))}
                </ul>
              </div>
              <p className="text-sm bg-[var(--bg-secondary)] rounded-lg p-3 border border-white/5">{aiResult.advice.action}</p>
              {aiResult.usedFallback && <p className="mt-2 text-[10px] text-[var(--text-secondary)]">{ui.aiUsedFallback}</p>}
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {history.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <div className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-4">
            <p className="text-xs text-[var(--text-secondary)]">{ui.summaryHoldings}</p>
            <p className="text-xl font-bold mt-1">{history.length}</p>
          </div>
          <div className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-4">
            <p className="text-xs text-[var(--text-secondary)]">{ui.summaryWithAi}</p>
            <p className="text-xl font-bold mt-1">{history.filter(r => r.recommendation).length}</p>
          </div>
          <div className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-4">
            <p className="text-xs text-[var(--text-secondary)]">{ui.summaryTwPnl}</p>
            <p className={`text-lg font-bold mt-1 ${stats.tw.pnl >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>{formatMoney(stats.tw.pnl, 'tw')}</p>
          </div>
          <div className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-4">
            <p className="text-xs text-[var(--text-secondary)]">{ui.summaryUsPnl}</p>
            <p className={`text-lg font-bold mt-1 ${stats.us.pnl >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>{formatMoney(stats.us.pnl, 'us')}</p>
          </div>
        </div>
      )}

      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5 text-[var(--text-secondary)]" />
            {ui.historyTitle}
          </h2>
          {!showAdd && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-sm hover:bg-white/15 transition"
            >
              <Plus className="w-4 h-4" />
              {ui.headerAdd}
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="bg-[var(--bg-card)] rounded-xl border border-white/5 p-8 text-center">
            <p className="text-sm text-[var(--text-secondary)]">{ui.historyEmpty}</p>
            {!showAdd && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition"
              >
                <Plus className="w-4 h-4" />
                {ui.historyAddFirst}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {history.map(item => {
              const open = expandedId === item.id
              return (
                <div key={item.id} className="bg-[var(--bg-card)] rounded-xl border border-white/5 overflow-hidden">
                  <button type="button" onClick={() => expandHistory(item)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${ratingColor(item.recommendation)}`}
                        style={item.recommendation ? { backgroundColor: `${RATING_STYLE[item.recommendation]?.bg || 'rgba(255,255,255,0.08)'}22` } : undefined}>
                        {item.recommendation || '—'}
                      </span>
                      <span className="font-medium truncate">{item.symbol_name || item.symbol}</span>
                      <span className="text-xs text-[var(--text-secondary)] shrink-0">{item.symbol}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-sm font-bold ${item.total_return >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                        {formatMoney(item.total_return, item.market)} {formatPct(item.total_return_pct)}
                      </span>
                      {item.strategy && <span className="text-[10px] text-[var(--text-secondary)] hidden md:inline">{strategyName(item.strategy)}</span>}
                      {open ? <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />}
                    </div>
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-1 border-t border-white/5">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-3">
                        <div><p className="text-xs text-[var(--text-secondary)]">{ui.detailShares}</p><p>{item.shares}</p></div>
                        <div><p className="text-xs text-[var(--text-secondary)]">{ui.detailCost}</p><p>{formatMoney(item.cost, item.market)}</p></div>
                        <div><p className="text-xs text-[var(--text-secondary)]">{ui.detailPrice}</p><p>{formatMoney(item.current_price, item.market)}</p></div>
                        <div><p className="text-xs text-[var(--text-secondary)]">{ui.detailDividend}</p><p>{formatMoney(item.dividend, item.market)}</p></div>
                        <div><p className="text-xs text-[var(--text-secondary)]">{ui.detailTotalCost}</p><p>{formatMoney(item.cost_basis, item.market)}</p></div>
                        <div><p className="text-xs text-[var(--text-secondary)]">{ui.detailMarketValue}</p><p>{formatMoney(item.market_value, item.market)}</p></div>
                        <div className="text-[var(--accent-red)]"><p className="text-xs text-[var(--text-secondary)]">{ui.detailUnrealizedPnl}</p><p>{formatMoney(item.unrealized_pnl, item.market)} ({formatPct(item.unrealized_pnl_pct)})</p></div>
                        <div><p className="text-xs text-[var(--text-secondary)]">{ui.detailYield}</p><p>{item.yield_on_cost.toFixed(2)}%</p></div>
                        <div className="col-span-2 md:col-span-4">
                          <p className="text-xs text-[var(--text-secondary)]">{ui.detailCreatedAt}</p>
                          <p className="text-xs">{(item.created_at || '').replace('T', ' ')}</p>
                        </div>
                        {item.summary && (
                          <div className="col-span-2 md:col-span-4">
                            <p className="text-xs text-[var(--text-secondary)]">{ui.detailAiSummary}</p>
                            <p className="text-sm">{item.summary}</p>
                          </div>
                        )}
                        {item.report_json && <JsonAdviceView json={item.report_json} market={item.market} ui={ui} />}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function JsonAdviceView({ json, market, ui }: { json: string; market: Market; ui: { detailKeyPoints: string; detailRisks: string; detailAction: string } }) {
  const [parsed, setParsed] = useState<{ advice?: Advice } | null>(null)
  useEffect(() => {
    try {
      setParsed(JSON.parse(json))
    } catch {
      setParsed(null)
    }
  }, [json])
  if (!parsed?.advice) return null
  return (
    <div className="col-span-2 md:col-span-4 rounded-lg bg-[var(--bg-secondary)] p-3 border border-white/5 space-y-2">
      <p className="text-xs text-[var(--text-secondary)]">{ui.detailKeyPoints}</p>
      <ul className="space-y-0.5">
        {parsed.advice.keyPoints.map((k, i) => (
          <li key={i} className="text-xs">• {k}</li>
        ))}
      </ul>
      <p className="text-xs text-[var(--accent-red)]">{ui.detailRisks}</p>
      <ul className="space-y-0.5">
        {parsed.advice.risks.map((r, i) => (
          <li key={i} className="text-xs text-[var(--accent-red)]">• {r}</li>
        ))}
      </ul>
      <p className="text-xs text-[var(--text-secondary)]">{ui.detailAction}</p>
      <p className="text-sm">{parsed.advice.action}</p>
    </div>
  )
}
