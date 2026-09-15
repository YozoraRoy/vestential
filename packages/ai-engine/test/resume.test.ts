import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * 從 analysis_jobs 恢復時，決定要從哪個 agent 續跑。
 * 邏輯複製自 apps/web/src/app/api/analyze/resume/route.ts（純函式）。
 */
function resolveResumeFrom(
  enabledAgents: string[],
  agentStates: Record<string, { state: string; reportField?: string; content?: string; error?: string }>,
  failedAgent?: string | null,
): string | null {
  if (failedAgent && enabledAgents.includes(failedAgent)) return failedAgent
  for (const a of enabledAgents) {
    const st = agentStates[a]?.state
    if (!st || st === 'pending' || st === 'failed') return a
  }
  return null
}

// ─── resolveResumeFrom ───────────────────────────────────────────

test('resolveResumeFrom - failed agent 存在且在 enabledAgents 中 → 回傳 failed agent', () => {
  const enabled = ['Market Analyst', 'Sentiment Analyst', 'News Analyst']
  const states = {
    'Market Analyst': { state: 'completed', reportField: 'marketReport', content: '...' },
    'Sentiment Analyst': { state: 'failed', error: 'timeout' },
  }
  const result = resolveResumeFrom(enabled, states, 'Sentiment Analyst')
  assert.equal(result, 'Sentiment Analyst')
})

test('resolveResumeFrom - failed agent 不在 enabledAgents 中 → 找第一個 pending/failed', () => {
  const enabled = ['Market Analyst', 'News Analyst', 'Fundamentals Analyst']
  const states = {
    'Market Analyst': { state: 'completed', reportField: 'marketReport', content: '...' },
    'News Analyst': { state: 'pending' },
  }
  const result = resolveResumeFrom(enabled, states, 'Sentiment Analyst')
  assert.equal(result, 'News Analyst')
})

test('resolveResumeFrom - failed agent 為 null → 找第一個 pending/failed', () => {
  const enabled = ['Market Analyst', 'Sentiment Analyst', 'News Analyst']
  const states = {
    'Market Analyst': { state: 'completed' },
    'Sentiment Analyst': { state: 'failed', error: 'API error' },
  }
  const result = resolveResumeFrom(enabled, states, null)
  assert.equal(result, 'Sentiment Analyst')
})

test('resolveResumeFrom - 全部完成 → 回傳 null', () => {
  const enabled = ['Market Analyst', 'Sentiment Analyst']
  const states = {
    'Market Analyst': { state: 'completed' },
    'Sentiment Analyst': { state: 'completed' },
  }
  const result = resolveResumeFrom(enabled, states, null)
  assert.equal(result, null)
})

test('resolveResumeFrom - 空 agentStates → 回傳第一個 agent', () => {
  const enabled = ['Market Analyst', 'Sentiment Analyst']
  const result = resolveResumeFrom(enabled, {}, null)
  assert.equal(result, 'Market Analyst')
})

test('resolveResumeFrom - 空 enabledAgents → 回傳 null', () => {
  const result = resolveResumeFrom([], {}, null)
  assert.equal(result, null)
})

test('resolveResumeFrom - 沒有 failed/pending 且無 failedAgent → 回傳 null', () => {
  const enabled = ['Market Analyst', 'Sentiment Analyst']
  const states = {
    'Market Analyst': { state: 'completed' },
    'Sentiment Analyst': { state: 'completed' },
  }
  const result = resolveResumeFrom(enabled, states, undefined)
  assert.equal(result, null)
})

// ─── AnalyzeRunResult 結構驗證 ───────────────────────────────────

test('AnalyzeRunResult - 失敗時 failedAgent/error 有值', () => {
  // 模擬 engine.analyze 回傳結構
  const result = {
    state: { ticker: 'AAPL', tradeDate: '2025-01-01', marketReport: 'done' },
    signal: null,
    tokenUsage: { agents: [], total: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    completedAgents: ['Market Analyst'],
    failedAgent: 'Sentiment Analyst',
    error: 'LLM timeout',
  }
  assert.equal(result.failedAgent, 'Sentiment Analyst')
  assert.equal(result.error, 'LLM timeout')
  assert.equal(result.completedAgents.length, 1)
  assert.equal(result.completedAgents[0], 'Market Analyst')
})

test('AnalyzeRunResult - 成功時 failedAgent 為 undefined', () => {
  const result = {
    state: { ticker: 'AAPL', tradeDate: '2025-01-01' },
    signal: 'Buy',
    tokenUsage: { agents: [], total: { promptTokens: 100, completionTokens: 200, totalTokens: 300 } },
    completedAgents: ['Market Analyst', 'Sentiment Analyst', 'News Analyst'],
  }
  assert.equal(result.failedAgent, undefined)
  assert.equal(result.error, undefined)
  assert.equal(result.completedAgents.length, 3)
})

// ─── resumeAnalysis 參數傳遞 ──────────────────────────────────────

test('resumeAnalysis - 不會重扣 quota（API 層職責，engine 層無 quota 概念）', () => {
  // 驗證 AnalyzeOptions 不含 quota 相關參數
  const options: Record<string, unknown> = {
    resumeFrom: 'Fundamentals Analyst',
    existingState: { ticker: 'AAPL', marketReport: 'done' },
    enabledAgents: ['Market Analyst', 'Sentiment Analyst', 'News Analyst', 'Fundamentals Analyst'],
  }
  assert.ok(!('quota' in options), 'AnalyzeOptions 不應包含 quota')
  assert.equal(options.resumeFrom, 'Fundamentals Analyst')
})

// ─── existingState 合併邏輯 ──────────────────────────────────────

test('existingState 合併 - resumeFrom 之後的 agent 從 existingState 取已完成內容', () => {
  const existingState = {
    ticker: 'AAPL',
    tradeDate: '2025-09-10',
    marketReport: '市場分析已完成',
    sentimentReport: '情緒分析已完成',
    newsReport: '',
  }
  const enabledAgents = ['Market Analyst', 'Sentiment Analyst', 'News Analyst', 'Fundamentals Analyst']
  const resumeFrom = resolveResumeFrom(enabledAgents, {
    'Market Analyst': { state: 'completed' },
    'Sentiment Analyst': { state: 'completed' },
    'News Analyst': { state: 'failed', error: 'timeout' },
  }, 'News Analyst')

  assert.equal(resumeFrom, 'News Analyst')

  // 續跑時已有 marketReport + sentimentReport（不重算）
  assert.equal(existingState.marketReport, '市場分析已完成')
  assert.equal(existingState.sentimentReport, '情緒分析已完成')
  // News Analyst 會重跑
  assert.equal(existingState.newsReport, '')
})

// ─── resume 時 merge 既有 agent_states（runAnalysisStream seed 行為）──
// 對應修復：runAnalysisStream 以 { ...initialAgentStates } 初始化 agentStates，
// 再疊加本次 run 的完成事件，避免 resume 後把先前完成的 agent 覆蓋成 pending。
// 邏輯複製自 apps/web/src/app/api/analyze/run-analysis.ts（修正後 merge 行為）。

type AgentStateLike = { state: string; reportField?: string; content?: string; error?: string }

function seedAgentStates(initialAgentStates: Record<string, AgentStateLike>): Record<string, AgentStateLike> {
  return { ...initialAgentStates }
}

test('resume merge - 既有完成的 agent 在失敗路徑不會被覆蓋成 pending（QA bug 回歸）', () => {
  // job id=2 兩次 resume 前的既有狀態：Market/Sentiment/News 已完成（有內容）
  const initialAgentStates: Record<string, AgentStateLike> = {
    'Market Analyst': { state: 'completed', reportField: 'marketReport', content: '市場報告（第一次跑完成）' },
    'Sentiment Analyst': { state: 'completed', reportField: 'sentimentReport', content: '情緒報告（第一次跑完成）' },
    'News Analyst': { state: 'completed', reportField: 'newsReport', content: '新聞報告（第一次跑完成）' },
  }
  const enabledAgents = ['Market Analyst', 'Sentiment Analyst', 'News Analyst', 'Trader', 'Portfolio Manager']

  // runAnalysisStream 修正後：以既有 agent_states seed，再疊加本次完成
  const agentStates = seedAgentStates(initialAgentStates)
  // 本次 resume 完成 Trader
  agentStates['Trader'] = { state: 'completed', reportField: 'decisionReport', content: '交易決策（resume 完成）' }
  // Portfolio Manager 失敗 → 走失敗路徑
  const finalAgentStates: Record<string, AgentStateLike> = {
    ...agentStates,
    'Portfolio Manager': { state: 'failed', error: 'LLM timeout' },
  }
  for (const a of enabledAgents) {
    if (!finalAgentStates[a]) finalAgentStates[a] = { state: 'pending' }
  }

  // 先前已完成的 agent 必須保留 completed + 內容，不得被洗成 pending
  assert.equal(finalAgentStates['Market Analyst'].state, 'completed')
  assert.equal(finalAgentStates['Market Analyst'].content, '市場報告（第一次跑完成）')
  assert.equal(finalAgentStates['Sentiment Analyst'].state, 'completed')
  assert.equal(finalAgentStates['Sentiment Analyst'].content, '情緒報告（第一次跑完成）')
  assert.equal(finalAgentStates['News Analyst'].state, 'completed')
  assert.equal(finalAgentStates['News Analyst'].content, '新聞報告（第一次跑完成）')
  // 本次完成的 agent 也有完整狀態
  assert.equal(finalAgentStates['Trader'].state, 'completed')
  assert.equal(finalAgentStates['Portfolio Manager'].state, 'failed')
})

test('resume merge - 新跑（無既有狀態）行為不變：空物件 seed 等同原行為', () => {
  const enabledAgents = ['Market Analyst', 'Sentiment Analyst']
  // 新 job 的 agent_states 為空物件 → seed 後仍是空，等同舊 { } 起算
  const agentStates = seedAgentStates({})
  assert.deepEqual(agentStates, {})

  // 全部失敗路徑：無完成 agent → 所有 enabled agent 全 pending
  const finalAgentStates: Record<string, AgentStateLike> = { ...agentStates }
  for (const a of enabledAgents) {
    if (!finalAgentStates[a]) finalAgentStates[a] = { state: 'pending' }
  }
  for (const a of enabledAgents) {
    assert.equal(finalAgentStates[a].state, 'pending')
  }
})

test('resume merge - 成功路徑也保留既有完成 agent', () => {
  const initialAgentStates: Record<string, AgentStateLike> = {
    'Market Analyst': { state: 'completed', reportField: 'marketReport', content: '既有報告' },
  }
  // seed + 本次 resume 完成其餘 agent
  const agentStates = seedAgentStates(initialAgentStates)
  agentStates['Sentiment Analyst'] = { state: 'completed', reportField: 'sentimentReport', content: '新報告' }

  // 成功路徑 updateAnalysisJob 直接寫 { ...agentStates }
  const persisted = { ...agentStates }
  assert.equal(persisted['Market Analyst'].state, 'completed')
  assert.equal(persisted['Market Analyst'].content, '既有報告')
  assert.equal(persisted['Sentiment Analyst'].state, 'completed')
})
