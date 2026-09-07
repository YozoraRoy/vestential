import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: Record<string, any> = {}

  // Test 1: Can we import the engine?
  try {
    const mod = await import('@stock/ai-engine')
    results.importOk = true
    results.importKeys = Object.keys(mod)
  } catch (e: any) {
    results.importOk = false
    results.importError = e.message
    results.importStack = e.stack?.split('\n').slice(0, 5).join('\n')
  }

  // Test 2: Can we construct the engine? (only if import ok)
  if (results.importOk) {
    try {
      const { TradingEngine } = await import('@stock/ai-engine')
      const engine = new TradingEngine()
      results.constructOk = true
      results.engineType = typeof engine
      results.engineKeys = Object.keys(engine)
    } catch (e: any) {
      results.constructOk = false
      results.constructError = e.message
      results.constructStack = e.stack?.split('\n').slice(0, 5).join('\n')
    }
  }

  // Test 3: database import
  try {
    const db = await import('@stock/database')
    results.dbOk = true
    results.dbKeys = Object.keys(db).filter(k => k !== 'default')
  } catch (e: any) {
    results.dbOk = false
    results.dbError = e.message
  }

  // Test 4: network connectivity
  async function checkUrl(url: string, name: string) {
    try {
      const c = new AbortController()
      const t = setTimeout(() => c.abort(), 10000)
      const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
      clearTimeout(t)
      return { name, ok: r.ok, status: r.status }
    } catch (e: any) {
      return { name, ok: false, error: e.message }
    }
  }

  results.connectivity = await Promise.all([
    checkUrl('https://query1.finance.yahoo.com/v8/finance/chart/0050.TW?range=1d&interval=1d', 'Yahoo 0050.TW'),
    checkUrl('https://opencode.ai/zen/v1/chat/completions', 'OpenCode AI'),
  ])

  results.env = {
    NODE_VERSION: process.version,
    LLM_PROVIDER: process.env.LLM_PROVIDER ? 'set' : 'unset',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'set(' + process.env.OPENAI_API_KEY.substring(0, 8) + '...)' : 'unset',
    LLM_BACKEND_URL: process.env.LLM_BACKEND_URL,
    DEEP_THINK_MODEL: process.env.DEEP_THINK_MODEL,
    QUICK_THINK_MODEL: process.env.QUICK_THINK_MODEL,
    FALLBACK_LLM_PROVIDER: process.env.FALLBACK_LLM_PROVIDER || 'unset',
    FALLBACK_DEEP_THINK_MODEL: process.env.FALLBACK_DEEP_THINK_MODEL || 'unset',
    FALLBACK_QUICK_THINK_MODEL: process.env.FALLBACK_QUICK_THINK_MODEL || 'unset',
    FALLBACK_DEEP_LLM_BACKEND_URL: process.env.FALLBACK_DEEP_LLM_BACKEND_URL || 'unset',
    FALLBACK_QUICK_LLM_BACKEND_URL: process.env.FALLBACK_QUICK_LLM_BACKEND_URL || 'unset',
    FALLBACK_DEEP_LLM_API_KEY: process.env.FALLBACK_DEEP_LLM_API_KEY ? 'set(' + process.env.FALLBACK_DEEP_LLM_API_KEY.substring(0, 8) + '...)' : 'unset',
    FALLBACK_QUICK_LLM_API_KEY: process.env.FALLBACK_QUICK_LLM_API_KEY ? 'set(' + process.env.FALLBACK_QUICK_LLM_API_KEY.substring(0, 8) + '...)' : 'unset',
    FALLBACK2_LLM_PROVIDER: process.env.FALLBACK2_LLM_PROVIDER || 'unset',
    FALLBACK2_DEEP_THINK_MODEL: process.env.FALLBACK2_DEEP_THINK_MODEL || 'unset',
    FALLBACK2_QUICK_THINK_MODEL: process.env.FALLBACK2_QUICK_THINK_MODEL || 'unset',
    FALLBACK2_DEEP_LLM_BACKEND_URL: process.env.FALLBACK2_DEEP_LLM_BACKEND_URL || 'unset',
    FALLBACK2_QUICK_LLM_BACKEND_URL: process.env.FALLBACK2_QUICK_LLM_BACKEND_URL || 'unset',
    FALLBACK2_DEEP_LLM_API_KEY: process.env.FALLBACK2_DEEP_LLM_API_KEY ? 'set(' + process.env.FALLBACK2_DEEP_LLM_API_KEY.substring(0, 8) + '...)' : 'unset',
    FALLBACK2_QUICK_LLM_API_KEY: process.env.FALLBACK2_QUICK_LLM_API_KEY ? 'set(' + process.env.FALLBACK2_QUICK_LLM_API_KEY.substring(0, 8) + '...)' : 'unset',
  }

  return NextResponse.json(results)
}
