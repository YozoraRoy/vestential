import { TradingEngine } from '@stock/ai-engine'
import { saveAnalysisJob, consumeAnalysisQuota } from '@stock/database'
import {
  DEFAULT_ANALYSIS_LANGUAGE,
  AGENT_KEYS,
  AGENT_KEY_SET,
  type AnalysisLanguage,
} from '@stock/core'
import { DAILY_ANALYSIS_LIMIT, getCurrentUserFromCookies, getTaiwanDateStr } from '../../../lib/auth'
import { runAnalysisStream } from './run-analysis'

let _engine: TradingEngine | null = null
let _engineError: string | null = null

function getEngine(): TradingEngine {
  if (_engineError) throw new Error(_engineError)
  if (_engine) return _engine
  try {
    _engine = new TradingEngine()
    return _engine
  } catch (e: any) {
    _engineError = `TradingEngine init failed: ${e.message}`
    throw new Error(_engineError)
  }
}

export async function POST(req: Request) {
  try {
    const { symbol, date, language, agents } = await req.json()
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol required' }), { status: 400 })
    }

    const outputLanguage: AnalysisLanguage =
      language === 'en' || language === 'ja' || language === 'zh-TW' ? language : DEFAULT_ANALYSIS_LANGUAGE

    const enabledAgents = Array.isArray(agents)
      ? agents.filter((a: unknown): a is string => typeof a === 'string' && AGENT_KEY_SET.has(a))
      : [...AGENT_KEYS]

    if (enabledAgents.length === 0) {
      return new Response(JSON.stringify({ error: '至少需要啟用一個 Agent 才能進行 AI 分析。' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const user = await getCurrentUserFromCookies()
    if (!user) {
      return new Response(JSON.stringify({ error: 'login required' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    // Quota 扣除時機：僅首次執行扣額度（續跑走 /api/analyze/resume，不重扣）。
    const quota = await consumeAnalysisQuota(user.id, getTaiwanDateStr(), DAILY_ANALYSIS_LIMIT)
    if (!quota.allowed) {
      return new Response(
        JSON.stringify({
          error: `今日 AI 分析額度已用完（${quota.used}/${quota.max}），請明天再試`,
          quota,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const encoder = new TextEncoder()
    let engine: TradingEngine

    try {
      engine = getEngine()
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    // 先建 job 再開始串流：失敗/中斷時可從 analysis_jobs 續跑
    const jobId = await saveAnalysisJob({
      userId: user.id,
      ticker: symbol,
      date: date ?? new Date().toISOString().split('T')[0],
      enabledAgents,
    })

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        try {
          const tradeDate = date ?? new Date().toISOString().split('T')[0]
          await runAnalysisStream({
            engine,
            ticker: symbol,
            date: tradeDate,
            language: outputLanguage,
            enabledAgents,
            jobId,
            send,
            run: (onProgress, onAgentComplete) =>
              engine.analyze(
                symbol,
                tradeDate,
                onProgress,
                { language: outputLanguage, enabledAgents, onAgentComplete },
              ),
          })
        } catch (e: any) {
          send('error', { message: e.message })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}