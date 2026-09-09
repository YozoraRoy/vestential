import { load } from 'cheerio'
import { createQuickLLM } from '@stock/ai-engine'
import { loadConfig } from '@stock/core'
import { getAgentSetting } from '@stock/database'
import type { MarketFocusItem } from '@stock/database'
import { saveMarketFocus, saveMarketFocusMeta } from '@stock/database'

// ─── 候選新聞來源設定 (多來源聚合池) ─────────────────────────────
// 1. 鉅亨網 (Anue Cnyes)：台股、外匯、頭條
const CNYES_CATS = ['tw_stock', 'forex', 'headline']
const CNYES_SOURCE = '鉅亨網'

// 2. 經濟日報 (UDN Money)：全台最大財經紙媒焦點與重大要聞
const UDN_RSS_URLS = [
  'https://money.udn.com/rssfeed/news/1001/5588', // 焦點頭條
  'https://money.udn.com/rssfeed/news/1001/5589', // 產經重大
]

// 3. Yahoo 奇摩股市：全台最大財經聚合台（涵蓋中央社/非凡/時報/工商等）
const YAHOO_STOCK_RSS = 'https://tw.stock.yahoo.com/rss?category=tw-market'

const USER_AGENT = 'Mozilla/5.0 (Vestential MultiSource MarketFocus/1.0)'
const MAX_CANDIDATES = 60
const RECENT_DAYS = 2
const MAX_CONTENT_CHARS = 4000

// ─── 候選池解析器 (JSON-LD & RSS) ────────────────────────────────
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

function parseRssXml(xml: string, defaultSource: string): NewsCandidate[] {
  const out: NewsCandidate[] = []
  try {
    const $ = load(xml, { xmlMode: true })
    $('item').each((_, el) => {
      const rawTitle = $(el).find('title').text().trim()
      const rawLink = $(el).find('link').text().trim()
      const pubDate = $(el).find('pubDate').text().trim()
      if (!rawTitle || !rawLink) return

      // 清理標題尾端後綴（如 " - Yahoo 奇摩股市"、" | 經濟日報"）
      const cleanTitle = rawTitle
        .replace(/\s*[-–|]\s*(Yahoo.*|經濟日報.*|鉅亨網.*)$/i, '')
        .trim()

      const mediaSource = $(el).find('source').text().trim() || defaultSource

      out.push({
        title: cleanTitle,
        url: rawLink,
        source: mediaSource,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      })
    })
  } catch (err) {
    console.warn(`[MarketFocus] parseRssXml error (${defaultSource}):`, err)
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
        if (out.length >= 25) return out
      }
    } catch (e) {
      console.warn(`[MarketFocus] cnyes cat=${cat} fetch error:`, e)
    }
  }
  return out
}

async function fetchUdnNews(): Promise<NewsCandidate[]> {
  const out: NewsCandidate[] = []
  for (const url of UDN_RSS_URLS) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(6000),
        cache: 'no-store',
      })
      if (!res.ok) continue
      const candidates = parseRssXml(await res.text(), '經濟日報')
      out.push(...candidates)
    } catch (e) {
      console.warn(`[MarketFocus] UDN fetch error (${url}):`, e)
    }
  }
  return out
}

async function fetchYahooStockNews(): Promise<NewsCandidate[]> {
  try {
    const res = await fetch(YAHOO_STOCK_RSS, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    })
    if (!res.ok) return []
    return parseRssXml(await res.text(), 'Yahoo股市')
  } catch (e) {
    console.warn('[MarketFocus] Yahoo Stock RSS fetch error:', e)
    return []
  }
}

/** 多來源新聞聚合候選池：聚合 鉅亨網 + 經濟日報 + Yahoo 股市 (含中央社/非凡等)，並去重與清洗。 */
export async function fetchMultiSourceCandidates(): Promise<NewsCandidate[]> {
  const [cnyes, udn, yahoo] = await Promise.allSettled([
    fetchCnyesNews(),
    fetchUdnNews(),
    fetchYahooStockNews(),
  ])

  const all: NewsCandidate[] = [
    ...(cnyes.status === 'fulfilled' ? cnyes.value : []),
    ...(udn.status === 'fulfilled' ? udn.value : []),
    ...(yahoo.status === 'fulfilled' ? yahoo.value : []),
  ]

  const seenUrls = new Set<string>()
  const seenTitles = new Set<string>()
  const unique: NewsCandidate[] = []

  for (const item of all) {
    if (!item.url || !item.title) continue
    const cleanUrl = item.url.split('?')[0].split('#')[0]
    const titleKey = item.title.replace(/\s+/g, '').slice(0, 16)

    if (seenUrls.has(cleanUrl) || seenTitles.has(titleKey)) continue
    seenUrls.add(cleanUrl)
    seenTitles.add(titleKey)
    unique.push(item)
    if (unique.length >= MAX_CANDIDATES) break
  }

  return unique
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

const ARTICLE_FETCH_RETRIES = 2
const ARTICLE_FETCH_BASE_DELAY_MS = 800

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
      signal: AbortSignal.timeout(6000),
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
      $('main p, .article-content p, .story-content p, .post-content p, .caas-body p, .article-body__editor p').each((_, el) => {
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
export const SUMMARY_SYSTEM_PROMPT = `你是 Vestential 的市場焦點主筆。請根據今日精選新聞，為投資人撰寫一份精簡、客觀、說人話的「當日市場總覽」（約 250~400 字）。

核心原則（參考 speak-human-tw 去 AI 味規範，嚴格執行）：
1. 開門見山：第一句直接切入今日市場發生的核心事實或關鍵數據，嚴禁「今天的市場氛圍有點...的味道」、「在瞬息萬變的市場中」等公式化開場。
2. 禁絕說教與身分腔：嚴禁出現「不過，作為價值投資者，我們必須保持冷靜」、「我們要學會...」等人生導師式說教；只客觀陳述事實、產業變化與數據關聯。
3. 剔除贅詞與 AI 慣用語：
   - 嚴禁使用「值得注意的是」、「不可否認的是」、「這意味著」、「相反地」、「說到底」。
   - 避免「不是 A 而是 B」的刻意對比句式。
   - 避免假坦白鉤子（「說真的」、「老實說」）。
4. 自然收尾，禁止罐頭總結：分析寫完即可自然結束，嚴禁在文末使用「總結來說」、「總的來說」、「綜上所述」、「機會在於...風險在於...」等套版公式。
5. 在地化與專業性：使用繁體中文台灣金融語境，全形標點（，。！？），數字及英文代碼前後保留半形空格，不用中國用語（如接地氣、質素、打法等）。
6. 聚焦價值核心：關注基本面動能、實質營收獲利、總經數據（就業/通膨/利率）與資金流向，精準傳達重點。
7. 只輸出 JSON，不要任何其他文字：{"summary":"..."}`

/** 依精選新聞生成當日市場總覽;失敗時以新聞標題兜底。 */
export async function generateDailySummary(items: MarketFocusItem[]): Promise<string> {
  try {
    const config = loadConfig()
    // 透過 createQuickLLM 帶上 fallback chain:primary(OpenAI)被配額 429 封鎖時自動切換備援模型
    const rawToken = (await getAgentSetting('market_focus.summary_max_tokens')) ?? ''
    const maxTokens = (rawToken && Number(rawToken) > 0 && Number(rawToken)) || 2048
    const { llm } = createQuickLLM(config, { maxTokens })
    const promptOverride = (await getAgentSetting('market_focus.summary_prompt')) ?? ''
    const system = promptOverride ? `${SUMMARY_SYSTEM_PROMPT}\n\n【後台覆寫指示】\n${promptOverride}` : SUMMARY_SYSTEM_PROMPT
    const list = items.map((it, i) => `${i + 1}. [${it.source}] ${it.title}${it.reason ? `（選取理由：${it.reason}）` : ''}`).join('\n')
    const raw = await llm.generate(system, `以下是今日精選新聞：\n${list}\n\n請撰寫當日市場總覽。`)
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

export const SYSTEM_PROMPT = `你是 Vestential(台灣股票投資資訊平台)的總編輯。Vestential 的精神是「價值投資」:重視基本面、長期累積、投資紀律、以及用簡單指標(如季線乖離)判斷市場位置。你負責為市場焦點挑選新聞。

規則:
1. 從候選清單中挑選「最符合價值投資精神」的 10 則。
2. 領域平衡偏好：盡量兼顧「半導體/科技硬體」、「傳產/金融/綠能重電」、「總體經濟/利率政策」等不同面向，避免單一族群過度集中。
3. 排除:短線明牌、個股炒作、小道消息、未證實的利多利空、娛樂/八卦,或與台灣投資無關的新聞。
4. 每則給一句 30 字以內的繁體中文理由，說明它為何值得看。說人話，直陳核心基本面或實質影響，嚴禁「值得注意的是」、「不可否認」等空泛廢話。
5. 只輸出 JSON，不要任何其他文字:
{"selected":[{"index":0,"reason":"..."}]}`

function buildUserPrompt(candidates: NewsCandidate[]): string {
  const list = candidates
    .map((c, i) => `${i}. [${c.source}] ${c.title}`)
    .join('\n')
  return `以下是候選新聞(共 ${candidates.length} 則):\n${list}\n\n請選出符合原則的 10 則。`
}

interface SelectEntry {
  index: number
  reason: string
}

/** 依「價值投資」精神用 LLM 過濾候選新聞;失敗時回傳原始前 N 則(理由為空)當兜底。 */
export async function filterNewsByAI(candidates: NewsCandidate[]): Promise<MarketFocusItem[]> {
  if (candidates.length === 0) return []
  try {
    const config = loadConfig()
    const { llm } = createQuickLLM(config, { maxTokens: 2048 })
    const rawCount = (await getAgentSetting('market_focus.select_count')) ?? ''
    const selectCount = (rawCount && Number(rawCount) > 0 && Number(rawCount)) || 10
    const promptOverride = (await getAgentSetting('market_focus.select_prompt')) ?? ''
    const system = promptOverride ? `${SYSTEM_PROMPT}\n\n【後台覆寫指示】\n${promptOverride}` : SYSTEM_PROMPT
    const prompt = buildUserPrompt(candidates).replace(`\n\n請選出符合原則的 10 則。`, `\n\n請選出符合原則的 ${selectCount} 則。`)
    const raw = await llm.generate(system, prompt)
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
      if (items.length >= selectCount) break
    }
    if (items.length > 0) return items
  } catch (e) {
    console.error('[MarketFocus] LLM filter failed, falling back to raw headlines:', e)
  }
  const rawCount2 = (await getAgentSetting('market_focus.select_count').catch(() => null)) ?? ''
  const fallbackCount = (rawCount2 && Number(rawCount2) > 0 && Number(rawCount2)) || 10
  return candidates.slice(0, fallbackCount).map((c) => ({
    title: c.title,
    url: c.url,
    source: c.source,
    published_at: c.publishedAt,
    reason: null,
  }))
}

// ─── 每則新聞 AI 說人話重點摘要 ──────────────────────────────────
const ARTICLE_SUMMARIES_SYSTEM_PROMPT = `你是 Vestential 的資深台股主筆。請為以下精選新聞，逐則撰寫一份 100~180 字的繁體中文「說人話重點摘要」。

核心原則（嚴格遵守 speak-human-tw 去 AI 味規範）：
1. 開門見山：首句直接點出核心事件與關鍵數據（如營收增減幅、毛利率、簽約金額、資本支出、政策決議）。嚴禁「在...背景下」、「隨著...發展」等套話開場。
2. 直陳實質影響：點明對該產業鏈、上下游供應商或台股投資人的實質影響（受惠題材、獲利能見度或潛在估值壓力），不說空話。
3. 嚴禁說教與心靈雞湯：不寫「投資人應保持理性」、「面對波動要耐心」等自我感動或道德勸說。
4. 剔除解說導引贅詞：嚴禁使用「值得注意的是」、「不可否認的是」、「顯而易見的是」、「這意味著」、「不是 A 而是 B」。直接陳述客觀事實。
5. 自然收尾，禁罐頭總結：直接停在關鍵數字或結論，嚴禁「總結來說」、「綜上所述」。
6. 台灣金融語境：使用繁體中文（台灣習慣詞彙），全形標點符號（，、。！？）。
7. 只輸出純 JSON，不要任何其他文字：
{"summaries":[{"index":0,"summary":"..."},{"index":1,"summary":"..."}]}`

/** 依據每則新聞的標題與正文內容，由 LLM 生成說人話重點摘要。 */
export async function generateArticleSummaries(
  items: { title: string; source: string | null; content?: string | null; reason?: string | null }[],
): Promise<string[]> {
  if (items.length === 0) return []
  try {
    const config = loadConfig()
    const { llm } = createQuickLLM(config, { maxTokens: 1800 })
    const promptList = items
      .map((it, idx) => {
        const textSnippet = it.content ? it.content.slice(0, 350).replace(/\s+/g, ' ').trim() : '（無正文）'
        return `[新聞 ${idx}] 標題：${it.title}\n來源：${it.source ?? '未知'}\n選取理由：${it.reason ?? '無'}\n正文摘錄：${textSnippet}`
      })
      .join('\n\n')

    const raw = await llm.generate(
      ARTICLE_SUMMARIES_SYSTEM_PROMPT,
      `請為以下 ${items.length} 則新聞分別產出說人話重點摘要：\n\n${promptList}`,
    )
    const cleaned = raw.replace(/```json[\s\S]*?```/g, (m) => m.slice(7, -3)).trim()
    const parsed = JSON.parse(cleaned) as { summaries?: { index: number; summary: string }[] }
    const summaryMap = new Map<number, string>()
    if (Array.isArray(parsed?.summaries)) {
      for (const entry of parsed.summaries) {
        if (typeof entry.index === 'number' && typeof entry.summary === 'string' && entry.summary.trim()) {
          summaryMap.set(entry.index, entry.summary.trim())
        }
      }
    }

    return items.map((it, idx) => {
      const s = summaryMap.get(idx)
      if (s) return s
      return it.reason ? `核心重點：${it.reason}` : ''
    })
  } catch (err) {
    console.error('[MarketFocus] generateArticleSummaries failed, falling back:', err)
    return items.map((it) => (it.reason ? `核心重點：${it.reason}` : ''))
  }
}

/** 抓取候選新聞 (多來源聚合池) → 保留近 2 天且依發布時間新到舊排序 → AI 過濾 → 並行爬全文 → AI 逐則摘要與當日總覽 → 寫入 DB。回傳儲存後的清單。 */
export async function refreshMarketFocus(): Promise<MarketFocusItem[]> {
  const { enriched } = await runMarketFocusPipeline(false)
  return enriched
}

/**
 * 市場焦點乾跑（後台預覽用）：跑完整生成流程但不寫 DB。
 * 回傳精選新聞清單＋每日總覽，供 /admin 預覽後再決定是否發布。
 */
export async function previewMarketFocus(): Promise<{
  items: MarketFocusItem[]
  summary: string
}> {
  const { enriched, summary } = await runMarketFocusPipeline(true)
  return { items: enriched, summary }
}

async function runMarketFocusPipeline(dryRun: boolean): Promise<{ enriched: MarketFocusItem[]; summary: string }> {
  const candidates = await fetchMultiSourceCandidates()

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
    .slice(0, 12)

  const crawled = await Promise.allSettled(items.map((it) => fetchArticleContent(it.url)))
  const enriched: MarketFocusItem[] = items.map((it, i) => ({
    ...it,
    content: crawled[i].status === 'fulfilled' ? crawled[i].value.content : null,
    source_url: crawled[i].status === 'fulfilled' ? crawled[i].value.sourceUrl : null,
  }))
  for (const it of enriched) {
    if (!it.content) console.warn(`[MarketFocus] no article content saved for: ${it.title} (${it.source_url ?? it.url})`)
  }

  // 為每則新聞生成說人話 AI 重點摘要
  const articleSummaries = await generateArticleSummaries(enriched)
  for (let i = 0; i < enriched.length; i++) {
    enriched[i].summary = articleSummaries[i] || null
  }

  const summary = await generateDailySummary(enriched)
  if (!dryRun) {
    await saveMarketFocus(enriched)
    await saveMarketFocusMeta({ summary, generatedAt: new Date().toISOString() })
  }
  return { enriched, summary }
}