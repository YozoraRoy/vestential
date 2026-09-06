import { load } from 'cheerio'
import { createQuickLLM } from '@stock/ai-engine'
import { loadConfig } from '@stock/core'
import type { MarketFocusItem } from '@stock/database'
import { saveMarketFocus, saveMarketFocusMeta } from '@stock/database'

// 鉅亨網新聞(台灣)。取用 SSR 頁內嵌的 JSON-LD CollectionPage 資料(標題/連結/發布時間)墊出候選池,
// 交給 LLM 依價值投資精神過濾。文章頁為服務端渲染,可抓全文。
const CNYES_CATS = ['tw_stock', 'forex', 'headline']

const USER_AGENT = 'Mozilla/5.0 (Vestential MarketFocus/1.0)'
const MAX_CANDIDATES = 30
const RECENT_DAYS = 2
const MAX_CONTENT_CHARS = 4000
const CNYES_SOURCE = '鉅亨網'

// ─── 候選池抓取 (鉅亨 JSON-LD) ─────────────────────────────────
function parseCnyesJsonLd(html: string): NewsCandidate[] {
  const out: NewsCandidate[] = []
  const scripts = html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)
  for (const m of scripts) {
    try {
      const j = JSON.parse(m[1]) as { mainEntity?: { itemListElement?: unknown[] } }
      const list = j?.mainEntity?.itemListElement
      if (!Array.isArray(list)) continue
      for (const x of list) {
        const it = (x as { item?: Record<string, unknown> }).item ?? (x as Record<string, unknown>)
        const url = typeof it?.url === 'string' ? it.url : ''
        const headline = typeof it?.headline === 'string' ? it.headline : ''
        const publishedAt = typeof it?.datePublished === 'string' ? it.datePublished : ''
        if (!url || !headline) continue
        out.push({
          title: headline.replace(/\s*\|\s*鉅亨網.*$/, '').trim(),
          url,
          source: CNYES_SOURCE,
          publishedAt,
        })
      }
    } catch {
      // 忽略無法解析的 JSON-LD 區塊
    }
  }
  return out
}

async function fetchCnyesNews(): Promise<NewsCandidate[]> {
  const seen = new Set<string>()
  const out: NewsCandidate[] = []
  for (const cat of CNYES_CATS) {
    try {
      const res = await fetch(`https://news.cnyes.com/news/cat/${cat}`, {
        headers: { 'user-agent': USER_AGENT },
        cache: 'no-store',
      })
      if (!res.ok) {
        console.warn(`[MarketFocus] cnyes cat=${cat} failed (${res.status})`)
        continue
      }
      for (const c of parseCnyesJsonLd(await res.text())) {
        if (seen.has(c.url)) continue
        seen.add(c.url)
        out.push(c)
        if (out.length >= MAX_CANDIDATES) return out
      }
    } catch (e) {
      console.warn(`[MarketFocus] cnyes cat=${cat} fetch error:`, e)
    }
  }
  return out
}

// ─── 全文抓取(robots 檢查 + cheerio 抽正文) ─────────────────────
const robotsCache = new Map<string, { rules: string[]; fetchedAt: number }>()

function parseRobotsTxt(text: string): string[] {
  const disallows: string[] = []
  let agent = ''
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const m = /^([^:]+):\s*(.*)$/.exec(s)
    if (!m) continue
    const field = m[1].trim().toLowerCase()
    const value = m[2].trim()
    if (field === 'user-agent') {
      agent = value.toLowerCase()
    } else if (field === 'disallow' && agent === '*' && value) {
      disallows.push(value)
    }
  }
  return disallows
}

/** 依 robots.txt 判斷指定網址是否允許抓取;紀錄使用 User-Agent: *。 */
async function isAllowedByRobots(target: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return true
  }
  if (url.origin.startsWith('https://www.google.com') || url.origin.startsWith('https://news.google.com')) return true
  const now = Date.now()
  const cached = robotsCache.get(url.origin)
  let rules: string[]
  if (cached && now - cached.fetchedAt < 10 * 60 * 1000) {
    rules = cached.rules
  } else {
    try {
      const res = await fetch(url.origin + '/robots.txt', {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(5000),
      })
      rules = res.ok ? parseRobotsTxt(await res.text()) : []
    } catch {
      rules = []
    }
    robotsCache.set(url.origin, { rules, fetchedAt: now })
  }
  const path = url.pathname + url.search
  return !rules.some((d) => path.startsWith(d))
}

function extractLongestParagraph($: ReturnType<typeof load>): string {
  let best = ''
  $('p').each((_, el) => {
    const t = $(el).text().trim()
    if (t.length > best.length) best = t
  })
  return best
}

const ARTICLE_FETCH_RETRIES = 3
const ARTICLE_FETCH_BASE_DELAY_MS = 1200

/** 對短暫性失敗(網路錯誤、429/408/5xx)做重試;4xx 其他狀態不重試直接回傳。 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= ARTICLE_FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)) {
        return res
      }
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (e) {
      lastErr = e
    }
    if (attempt < ARTICLE_FETCH_RETRIES) {
      const delay = ARTICLE_FETCH_BASE_DELAY_MS * attempt
      console.warn(`[MarketFocus] article fetch attempt ${attempt} failed, retrying in ${delay}ms: ${url}`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('article fetch failed')
}

/** 抓取文章全文並解析原始來源 URL;失敗或 robots 拒絕時各自回傳 null。 */
export async function fetchArticleContent(url: string): Promise<{ content: string | null; sourceUrl: string | null }> {
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { content: null, sourceUrl: url }
    const finalUrl = res.url || url
    if (!(await isAllowedByRobots(finalUrl))) {
      console.log(`[MarketFocus] robots.txt disallows crawling: ${finalUrl}`)
      return { content: null, sourceUrl: finalUrl }
    }
    const html = await res.text()
    const $ = load(html)
    $('script, style, noscript, nav, footer, aside, form, iframe, svg, .ad, .ads, .advert, [class*="ad-"], [class*="advertisement"], [id*="ad-"]').remove()

    let text = ''
    $('article').first().find('p, h2, h3, li').each((_, el) => {
      const t = $(el).text().trim()
      if (t.length > 10) text += t + '\n'
    })
    if (text.length < 200) {
      text = ''
      $('main p, .article-content p, .story-content p, .post-content p').each((_, el) => {
        const t = $(el).text().trim()
        if (t.length > 10) text += t + '\n'
      })
    }
    if (text.length < 200) text = extractLongestParagraph($)

    const clean = text.replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_CONTENT_CHARS)
    return { content: clean || null, sourceUrl: finalUrl }
  } catch (e) {
    console.error('[MarketFocus] article fetch failed after retries:', url, e)
    // 保留原始新聞網址,讓清單仍能呈現有效直連連結,而不是存入 NULL
    return { content: null, sourceUrl: url }
  }
}

// ─── 當日 AI 總覽 ────────────────────────────────────────────────
const SUMMARY_SYSTEM_PROMPT = `你是 Vestential 的「市場焦點」副總編輯,撰寫當日市場總覽,提供給首頁與 /market-focus 頁讀者。
規則:
1. 以繁體中文、口語、專業但不艱澀的語氣,寫 300~500 字的當日市場總覽。
2. 必須涵蓋下方精選新聞的核心重點,主要聚焦基本面、股利/除息、總體經濟與市場週期等價值投資面向。
3. 若當中有風險訊號(如指數過熱、個股標示高估),明確提醒讀者謹慎。
4. 文末以一句話總結當日市場存在的機會與風險。
5. 只輸出 JSON,不要任何其他文字:{"summary":"..."}`

/** 依精選新聞生成當日市場總覽;失敗時以新聞標題兜底。 */
export async function generateDailySummary(items: MarketFocusItem[]): Promise<string> {
  try {
    const config = loadConfig()
    // 透過 createQuickLLM 帶上 fallback chain:primary(OpenAI)被配額 429 封鎖時自動切換備援模型
    const { llm } = createQuickLLM(config, { maxTokens: 2048 })
    const list = items.map((it, i) => `${i + 1}. [${it.source}] ${it.title}${it.reason ? `（選取理由：${it.reason}）` : ''}`).join('\n')
    const raw = await llm.generate(SUMMARY_SYSTEM_PROMPT, `以下是今日精選新聞：\n${list}\n\n請撰寫當日市場總覽。`)
    const parsed = JSON.parse(raw.replace(/```json[\s\S]*?```/g, (m) => m.slice(7, -3)).trim()) as { summary?: string }
    const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : ''
    if (summary) return summary
  } catch (e) {
    console.error('[MarketFocus] daily summary failed, falling back to headlines:', e)
  }
  return `當日市場焦點：${items.map((it) => it.title).join('；')}`
}

export interface NewsCandidate {
  title: string
  url: string
  source: string
  publishedAt: string
}

/** 轉成可排序的 ISO 字串;無法解析時回傳空字串。 */
function toIsoDate(publishedAt: string): string {
  const dt = new Date(publishedAt)
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString()
}

const SYSTEM_PROMPT = `你是 Vestential(台灣股票投資資訊平台)的總編輯。Vestential 的精神是「價值投資」:重視基本面、長期累積、投資紀律、以及用簡單指標(如季線乖離)判斷市場位置。你負責為首頁「市場焦點」挑選新聞。

規則:
1. 從候選清單中挑選「最符合價值投資精神」的最多 6 則。
2. 偏好:基本面/財報/股利與除息/總體經濟/市場週期(指數、季線乖離)/長期資產配置相關新聞。
3. 排除:短線明牌、個股炒作、小道消息、未證實的利多利空、娛樂/八卦,或與台灣投資無關的新聞。
4. 每則給一句 30 字以內的繁體中文理由,說明它為何值得看。
5. 只輸出 JSON,不要任何其他文字:
{"selected":[{"index":0,"reason":"..."}]}`

function buildUserPrompt(candidates: NewsCandidate[]): string {
  const list = candidates
    .map((c, i) => `${i}. [${c.source}] ${c.title}`)
    .join('\n')
  return `以下是候選新聞(共 ${candidates.length} 則):\n${list}\n\n請選出最多 6 則。`
}

interface SelectEntry {
  index: number
  reason: string
}

/** 依「價值投資」精神用 LLM 過濾候選新聞;失敗時回傳原始前 6 則(理由為空)當兜底。 */
export async function filterNewsByAI(candidates: NewsCandidate[]): Promise<MarketFocusItem[]> {
  if (candidates.length === 0) return []
  try {
    const config = loadConfig()
    const { llm } = createQuickLLM(config, { maxTokens: 2048 })
    const raw = await llm.generate(SYSTEM_PROMPT, buildUserPrompt(candidates))
    const parsed = JSON.parse(raw.replace(/```json[\s\S]*?```/g, (m) => m.slice(7, -3)).trim()) as {
      selected: SelectEntry[]
    }
    const selected = Array.isArray(parsed?.selected) ? parsed.selected : []
    const items: MarketFocusItem[] = []
    for (const s of selected) {
      const c = candidates[s.index]
      if (!c) continue
      items.push({
        title: c.title,
        url: c.url,
        source: c.source,
        published_at: c.publishedAt,
        reason: typeof s.reason === 'string' ? s.reason.trim() : null,
      })
      if (items.length >= 6) break
    }
    if (items.length > 0) return items
  } catch (e) {
    console.error('[MarketFocus] LLM filter failed, falling back to raw headlines:', e)
  }
  return candidates.slice(0, 6).map((c) => ({
    title: c.title,
    url: c.url,
    source: c.source,
    published_at: c.publishedAt,
    reason: null,
  }))
}

/** 抓取候選新聞 → 保留近 2 天且依發布時間新到舊排序 → AI 過濾 → 並行爬全文 → 生成當日總覽 → 寫入 DB。回傳儲存後的清單。 */
export async function refreshMarketFocus(): Promise<MarketFocusItem[]> {
  const candidates = await fetchCnyesNews()

  const now = Date.now()
  const cutoff = now - RECENT_DAYS * 24 * 60 * 60 * 1000
  const recent = candidates
    .map((c) => ({ c, t: Date.parse(c.publishedAt) }))
    .filter((x) => !Number.isNaN(x.t) && x.t >= cutoff)
    .sort((a, b) => b.t - a.t)
    .map((x) => x.c)

  const items = (await filterNewsByAI(recent))
    .map((it) => ({ ...it, published_at: it.published_at ? toIsoDate(it.published_at) : '' }))
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, 6)

  const crawled = await Promise.allSettled(items.map((it) => fetchArticleContent(it.url)))
  const enriched = items.map((it, i) => ({
    ...it,
    content: crawled[i].status === 'fulfilled' ? crawled[i].value.content : null,
    source_url: crawled[i].status === 'fulfilled' ? crawled[i].value.sourceUrl : null,
  }))
  for (const it of enriched) {
    if (!it.content) console.warn(`[MarketFocus] no article content saved for: ${it.title} (${it.source_url ?? it.url})`)
  }

  await saveMarketFocus(enriched)
  const summary = await generateDailySummary(enriched)
  await saveMarketFocusMeta({ summary, generatedAt: new Date().toISOString() })
  return enriched
}