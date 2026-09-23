import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MarketFocusItem, MarketFocusMeta } from '@stock/database'
import {
  FIRST_REPLY_CATEGORIES,
  FIRST_REPLY_FALLBACK_BANK,
  FIRST_REPLY_MAX_CHARS,
  META_AI_TAG,
  formatFirstReply,
  generateFirstReplyQuestion,
  getFirstReplyMode,
  hasFirstReplyPosted,
  pickFirstReplyCategory,
} from './social-first-reply'

// ─── mocks（沿 social.test.ts 慣例隔離 workspace 相依） ──────────────
const mocks = vi.hoisted(() => ({
  createQuickLLM: vi.fn(),
  getAgentSetting: vi.fn(),
  getSocialPost: vi.fn(),
  loadConfig: vi.fn(),
  attachLlmUsageRecorder: vi.fn(),
}))

function sanitizeDataField(value: string, maxLen = 300): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\r?\n/g, ' ↵ ')
    .replace(/[<>\u007b\u007d\u005b\u005d]/g, (c) => {
      if (c === '<') return '＜'
      if (c === '>') return '＞'
      if (c === '{') return '［'
      if (c === '}') return '］'
      if (c === '[') return '【'
      return '】'
    })
    .trim()
    .slice(0, maxLen)
}
function sanitizeDataName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
}
function dataBlock(name: string, content: string, maxLen = 300): string {
  const safe = sanitizeDataField(content, maxLen)
  if (!safe) return ''
  return `<data name="${sanitizeDataName(name)}">${safe}</data>`
}
function injectionGuardNote(): string {
  return '【安全規則】測試用佔位。'
}

vi.mock('@stock/ai-engine', () => ({
  createQuickLLM: mocks.createQuickLLM,
  dataBlock,
  injectionGuardNote,
  sanitizeDataField,
}))
vi.mock('@stock/core', () => ({ loadConfig: mocks.loadConfig }))
vi.mock('@stock/database', () => ({
  getAgentSetting: mocks.getAgentSetting,
  getSocialPost: mocks.getSocialPost,
  updateSocialPost: vi.fn(),
}))
vi.mock('@/lib/llm-usage', () => ({ attachLlmUsageRecorder: mocks.attachLlmUsageRecorder }))

// ─── fixtures ─────────────────────────────────────────────────────
const meta: MarketFocusMeta = {
  summary: '台股今日大漲，電子股領軍，市場信心回溫。',
  generated_at: '2026-09-23T08:00:00Z',
}
const items: MarketFocusItem[] = [
  {
    title: '台積電法說報喜，AI 需求強勁',
    summary: '毛利率優於預期',
    url: 'https://example.com/1',
    source: '中央社',
    published_at: '2026-09-23T07:00:00Z',
    reason: 'AI 題材',
  },
]
const meme = { title: 'AI 吃到飽', punchline: '股價先吃，基本面後到' }

function stubLlm() {
  const generate = vi.fn()
  const llm = { generate, model: 'test-model' }
  mocks.createQuickLLM.mockReturnValue({ llm, primary: llm, fallbackModel: null })
  return generate
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.loadConfig.mockReturnValue({})
  mocks.getAgentSetting.mockResolvedValue('on')
})

// ─── 四類輪換 ─────────────────────────────────────────────────────
describe('pickFirstReplyCategory｜四類輪換', () => {
  it('同 edition 固定回同一類（乾跑預覽與實發一致）', () => {
    const a = pickFirstReplyCategory('2026-09-23T08:00:00Z')
    const b = pickFirstReplyCategory('2026-09-23T08:00:00Z')
    expect(a).toBe(b)
    expect(FIRST_REPLY_CATEGORIES).toContain(a)
  })

  it('多個 edition 會分散到四類（輪換不斷頭）', () => {
    const seen = new Set(
      Array.from({ length: 30 }, (_, i) => pickFirstReplyCategory(`2026-09-${String(i + 1).padStart(2, '0')}T08:00:00Z`)),
    )
    expect(seen.size).toBeGreaterThan(1)
    for (const c of seen) expect(FIRST_REPLY_CATEGORIES).toContain(c)
  })

  it('四類標籤齊備：價值投資／新聞／風險／情緒', () => {
    expect(FIRST_REPLY_CATEGORIES).toHaveLength(4)
  })
})

// ─── 固定題庫兜底 ─────────────────────────────────────────────────
describe('FIRST_REPLY_FALLBACK_BANK｜4 類各 3 題', () => {
  it('共 12 題，加標註後皆 ≤100 字', () => {
    const all = Object.values(FIRST_REPLY_FALLBACK_BANK).flat()
    expect(all).toHaveLength(12)
    for (const q of all) {
      expect(q.length).toBeGreaterThan(0)
      expect(Array.from(`${META_AI_TAG} ${q}`).length).toBeLessThanOrEqual(FIRST_REPLY_MAX_CHARS)
    }
  })
})

// ─── 組裝格式 ─────────────────────────────────────────────────────
describe('formatFirstReply｜標註與字數', () => {
  it('on 版加 @meta.ai 前綴、全文 ≤100 字', () => {
    const out = formatFirstReply('這波回檔你會先看什麼？', 'on')
    expect(out.startsWith(`${META_AI_TAG} `)).toBe(true)
    expect(Array.from(out).length).toBeLessThanOrEqual(FIRST_REPLY_MAX_CHARS)
  })

  it('editor 版去 tag 純提問', () => {
    const out = formatFirstReply('@meta.ai 這波回檔你會先看什麼？', 'editor')
    expect(out).not.toContain(META_AI_TAG)
    expect(out).toBe('這波回檔你會先看什麼？')
  })

  it('超長問題截斷至 100 字', () => {
    const out = formatFirstReply('台'.repeat(200), 'on')
    expect(Array.from(out).length).toBe(FIRST_REPLY_MAX_CHARS)
  })
})

// ─── 生成主流程 ───────────────────────────────────────────────────
describe('generateFirstReplyQuestion｜LLM 與兜底', () => {
  it('LLM 成功：回傳問題＋類別＋source=llm、含 @meta.ai、≤100 字', async () => {
    const generate = stubLlm()
    generate.mockResolvedValue('今天電子股這麼強，你會追還是等拉回？')

    const out = await generateFirstReplyQuestion(meta, items, meme, { editionKey: 'ed-1', mode: 'on' })

    expect(out.source).toBe('llm')
    expect(out.tagged).toBe(true)
    expect(out.text.startsWith(`${META_AI_TAG} `)).toBe(true)
    expect(Array.from(out.text).length).toBeLessThanOrEqual(FIRST_REPLY_MAX_CHARS)
    expect(out.category).toBe(pickFirstReplyCategory('ed-1'))
    expect(mocks.attachLlmUsageRecorder).toHaveBeenCalledWith(expect.anything(), 'social.first-reply')
  })

  it('LLM 失敗：固定題庫兜底、不 throw', async () => {
    const generate = stubLlm()
    generate.mockRejectedValue(new Error('LLM 429'))

    const out = await generateFirstReplyQuestion(meta, items, meme, { editionKey: 'ed-2', mode: 'on' })

    expect(out.source).toBe('fallback')
    expect(out.text.startsWith(`${META_AI_TAG} `)).toBe(true)
    expect(Array.from(out.text).length).toBeLessThanOrEqual(FIRST_REPLY_MAX_CHARS)
    expect(Object.values(FIRST_REPLY_FALLBACK_BANK).flat().some((q) => out.text.includes(q))).toBe(true)
  })

  it('editor 模式：LLM 成功也不加標註', async () => {
    const generate = stubLlm()
    generate.mockResolvedValue('今天電子股這麼強，你會追還是等拉回？')

    const out = await generateFirstReplyQuestion(meta, items, meme, { editionKey: 'ed-3', mode: 'editor' })

    expect(out.tagged).toBe(false)
    expect(out.text).not.toContain(META_AI_TAG)
  })
})

// ─── 開關與去重 ───────────────────────────────────────────────────
describe('getFirstReplyMode｜後台開關', () => {
  it("未設定回 'editor'（台灣未開放，預設降級）", async () => {
    mocks.getAgentSetting.mockResolvedValue(null)
    expect(await getFirstReplyMode()).toBe('editor')
  })

  it('on／editor／off 照實回傳，非法值視為 editor', async () => {
    mocks.getAgentSetting.mockResolvedValue('on')
    expect(await getFirstReplyMode()).toBe('on')
    mocks.getAgentSetting.mockResolvedValue('editor')
    expect(await getFirstReplyMode()).toBe('editor')
    mocks.getAgentSetting.mockResolvedValue('off')
    expect(await getFirstReplyMode()).toBe('off')
    mocks.getAgentSetting.mockResolvedValue('???')
    expect(await getFirstReplyMode()).toBe('editor')
  })
})

describe('hasFirstReplyPosted｜同 edition 去重', () => {
  it("first_reply_status='posted' 即不重發", async () => {
    mocks.getSocialPost.mockResolvedValue({ id: 1, first_reply_status: 'posted' })
    expect(await hasFirstReplyPosted('threads', 'ed-1')).toBe(true)
  })

  it('未發過／失敗／無列皆回 false（失敗可重試）', async () => {
    mocks.getSocialPost.mockResolvedValue({ id: 1, first_reply_status: 'failed' })
    expect(await hasFirstReplyPosted('threads', 'ed-1')).toBe(false)
    mocks.getSocialPost.mockResolvedValue({ id: 1, first_reply_status: null })
    expect(await hasFirstReplyPosted('instagram', 'ed-1')).toBe(false)
    mocks.getSocialPost.mockResolvedValue(undefined)
    expect(await hasFirstReplyPosted('threads', 'ed-1')).toBe(false)
  })
})
