import { Newspaper, Sparkles, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { getLocale } from '@/i18n/server'
import { localizePath } from '@/i18n/paths'
import { buildAlternates } from '@/i18n/metadata'
import { getMarketFocus, getMarketFocusMeta } from '@stock/database'
import { SectionHeading } from '@/components/section-heading'
import { NewsCard } from '@/components/news-card'

const BASE_URL = 'https://vestential.com'
const PAGE_TITLE = '市場焦點 | Vestential'
const PAGE_DESC = 'Vestential「市場焦點」：由 AI 依價值投資精神篩選的近期台股重點新聞，提供當日總覽、新聞摘錄與全文閱讀。'

export async function generateMetadata() {
  const locale = await getLocale()
  const alts = buildAlternates(locale, '/market-focus')
  return {
    title: PAGE_TITLE,
    description: PAGE_DESC,
    alternates: alts,
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESC,
      url: alts.canonical,
      siteName: 'Vestential',
      type: 'website',
      locale: locale === 'zh-TW' ? 'zh_TW' : locale,
    },
    twitter: { card: 'summary_large_image' },
  }
}

function formatDateTime(s: string): string {
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return s
  return dt.toLocaleDateString('zh-TW') + ' ' + dt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

export default async function MarketFocusPage() {
  const locale = await getLocale()
  const [focus, meta] = await Promise.all([getMarketFocus(10), getMarketFocusMeta()])

  const graph: object[] = [
    {
      '@type': 'WebSite',
      name: 'Vestential',
      url: BASE_URL,
      description: PAGE_DESC,
      inLanguage: ['zh-TW', 'en', 'ja'],
    },
    {
      '@type': 'Organization',
      name: 'Vestential',
      url: BASE_URL,
      slogan: 'Vestential = Vest + Essential',
    },
    {
      '@type': 'WebPage',
      name: PAGE_TITLE,
      description: PAGE_DESC,
      url: `${BASE_URL}/market-focus`,
      inLanguage: locale,
      isPartOf: { '@type': 'WebSite', name: 'Vestential', url: BASE_URL },
      dateModified: focus[0]?.published_at ? new Date(focus[0].published_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    },
  ]
  if (focus.length > 0) {
    graph.push({
      '@type': 'ItemList',
      name: '市場焦點',
      itemListElement: focus.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.title,
        url: item.source_url || item.url,
        ...(item.published_at ? { datePublished: new Date(item.published_at).toISOString() } : {}),
      })),
    })
  }
  const schema = { '@context': 'https://schema.org', '@graph': graph }

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="flex items-center gap-2 mb-3">
        <Newspaper className="w-6 h-6 text-[var(--accent)]" />
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-[var(--text-secondary)]">AI 精選</span>
      </div>
      <h1 className="text-3xl font-bold mb-3">市場焦點</h1>
      <div className="mb-6 w-16 h-1 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-green)]" />
      <p className="text-base text-[var(--text-secondary)] leading-relaxed mb-10">
        由 AI 依「價值投資、長期累積、紀律」的精神，從近期台股新聞中篩選重點，並整理當日市場總覽。內容僅供參考，不構成任何投資建議。
      </p>

      {/* 當日 AI 總覽 */}
      {meta?.summary ? (
        <section aria-labelledby="market-summary" className="mb-10">
          <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-6 py-5">
            <div className="flex items-center gap-2 mb-2.5">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" />
              <h2 id="market-summary" className="text-base font-semibold text-[var(--text-primary)]">今日 AI 市場總覽</h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-[var(--text-secondary)]">AI</span>
            </div>
            <p className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">{meta.summary}</p>
            {meta.generated_at && (
              <p className="flex items-center gap-1.5 mt-3 text-xs text-[var(--text-secondary)]">
                <RefreshCw className="w-3.5 h-3.5" />
                更新時間：{formatDateTime(meta.generated_at)}
              </p>
            )}
          </div>
        </section>
      ) : null}

      {/* 精選新聞 */}
      <section aria-labelledby="market-news" className="mb-10">
        <SectionHeading id="market-news" title="精選新聞" badge="近 2 天" />

        {focus.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4">
            {focus.map((item) => (
              <NewsCard key={item.id} item={item} variant="full" />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">資訊整理中，稍後再來看看…</p>
        )}
      </section>

      {/* 方法與免責 */}
      <section aria-labelledby="market-method" className="mb-10">
        <SectionHeading id="market-method" title="方法說明" />
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          本頁新聞由 AI 依價值投資精神（基本面、財報、股利與除息、總體經濟、市場週期）從近期台股重點新聞中篩選，
          並由 AI 依「說人話」規範閱讀全文後提煉重點摘要，直陳核心數據與實質影響；同時每日定時更新當日市場總覽。
        </p>
        <div className="rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 px-6 py-5">
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            本頁內容（含 AI 總覽、新聞重點摘要與評論）僅供資訊參考，不構成任何投資建議。AI 可能出錯或遲延，
            投資決策請自行判斷並審慎評估風險。新聞原始全文與著作權均屬原始出處媒體所有。
          </p>
          <div className="mt-3 pt-3 border-t border-[var(--accent-red)]/20">
            <Link href={localizePath(locale, '/terms')} className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1 font-medium">
              服務條款 &rarr;
            </Link>
          </div>
        </div>
      </section>

      <div>
        <Link href={localizePath(locale, '/')} className="text-sm text-[var(--accent)] hover:underline">
          ← 返回首頁
        </Link>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </div>
  )
}