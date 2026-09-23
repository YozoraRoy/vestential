import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isSamePool,
  checkFallbackPoolDiversity,
} from '../src/llm/fallback-client.js'

// ─── Issue #32：fallback 分流檢測（同池＝同供應商＋同模型＋同 key）────

test('isSamePool - 同供應商同模型同 key 判同池', () => {
  assert.equal(
    isSamePool(
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_AAA' },
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_AAA' },
    ),
    true,
  )
})

test('isSamePool - 同模型但不同 key 判不同池（不同帳號配額可分流）', () => {
  assert.equal(
    isSamePool(
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_AAA' },
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_BBB' },
    ),
    false,
  )
})

test('isSamePool - 不同模型／不同供應商判不同池', () => {
  assert.equal(
    isSamePool(
      { provider: 'google', model: 'gemini-2.5-flash' },
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'x' },
    ),
    false,
  )
  assert.equal(
    isSamePool(
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'x' },
      { provider: 'openai', model: 'groq/compound-mini', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'x' },
    ),
    false,
  )
})

test('isSamePool - 雙方皆空 key 判同池（共用同一把預設 key）', () => {
  assert.equal(
    isSamePool(
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1' },
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1' },
    ),
    true,
  )
})

test('checkFallbackPoolDiversity - 生產現況 tier1/tier2 同池同 key 必警告且不洩漏 key', () => {
  const warnings = checkFallbackPoolDiversity(
    { provider: 'google', model: 'gemini-2.5-flash' },
    [
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_SECRET_X' },
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_SECRET_X' },
    ],
  )
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0].includes('tier2'))
  assert.ok(!warnings[0].includes('gsk_SECRET_X'), '警告不得包含 key 明文')
})

test('checkFallbackPoolDiversity - 真分流（primary 不同供應商、tier 間不同 key）無警告', () => {
  const warnings = checkFallbackPoolDiversity(
    { provider: 'google', model: 'gemini-2.5-flash' },
    [
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_AAA' },
      { provider: 'openai', model: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_BBB' },
    ],
  )
  assert.deepEqual(warnings, [])
})

test('checkFallbackPoolDiversity - fallback 沿用 primary 同 key 判主備同池', () => {
  const warnings = checkFallbackPoolDiversity(
    { provider: 'openai', model: 'big-pickle', baseUrl: 'https://opencode.ai/zen/v1', apiKey: 'sk_SAME' },
    [
      { provider: 'openai', model: 'big-pickle', baseUrl: 'https://opencode.ai/zen/v1', apiKey: 'sk_SAME' },
    ],
  )
  assert.equal(warnings.length, 1)
  assert.ok(!warnings[0].includes('sk_SAME'), '警告不得包含 key 明文')
})
