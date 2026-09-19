import { Newspaper, Sparkles, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { getDict, getLocale } from '@/i18n/server'
import { localizePath } from '@/i18n/paths'
import { buildAlternates } from '@/i18n/metadata'
import { getMarketFocus, getMarketFocusMeta } from '@stock/database'
import { SectionHeading } from '@/components/section-heading'
import { NewsCard } from '@/components/news-card'
import { MarketFocusSubscribe } from '@/components/market-focus-subscribe'
import { MarketFocusTtsBar } from '@/components/market-focus-tts-bar'

const BASE_URL = 'https://vestential.com'

export async function generateMetadata() {
  const dict = await getDict()
  const locale = await getLocale()
  const alts = buildAlternates(locale, '/market-focus')
  const title = `${dict.marketFocus.title} | Vestential`
  return {
    title,
    description: dict.marketFocus.metaDesc,
    alternates: alts,
    openGraph: {
      title,
      description: dict.marketFocus.metaDesc,
      url: alts.canonical,
      siteName: 'Vestential',
      type: 'website',
      locale: locale === 'zh-TW' ? 'zh_TW' : locale,
    },
    twitter: { card: 'summary_large_image' },
  }
}

function formatDateTime(s: string, locale: string): string {
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return s
  return dt.toLocaleDateString(locale) + ' ' + dt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

export default async function MarketFocusPage() {
  const dict = await getDict()
  const locale = await getLocale()
  const [focus, meta] = await Promise.all([getMarketFocus(20, 2), getMarketFocusMeta()])

  const graph: object[] = [
    {
      '@type': 'WebSite',
      name: 'Vestential',
      url: BASE_URL,
      description: dict.marketFocus.metaDesc,
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
      name: dict.marketFocus.title,
      description: dict.marketFocus.metaDesc,
      url: `${BASE_URL}${localizePath(locale, '/market-focus')}`,
      inLanguage: locale,
      isPartOf: { '@type': 'WebSite', name: 'Vestential', url: BASE_URL },
      dateModified: focus[0]?.published_at ? new Date(focus[0].published_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    },
  ]
  if (focus.length > 0) {
    graph.push({
      '@type': 'ItemList',
      name: dict.marketFocus.title,
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
    <div className="max-w-5xl mx-auto w-full px-4 py-8 md:py-10">
      <div className="flex items-center gap-2 mb-3">
        <Newspaper className="w-6 h-6 text-[var(--accent)]" />
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-[var(--text-secondary)]">{dict.marketFocus.aiPickBadge}</span>
      </div>
      <h1 className="text-3xl font-bold mb-3">{dict.marketFocus.title}</h1>
      <div className="mb-6 w-16 h-1 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-green)]" />
      <p className="max-w-2xl text-base text-[var(--text-secondary)] leading-relaxed mb-10">
        {dict.marketFocus.intro}
      </p>

      {/* 當日 AI 總覽 */}
      {meta?.summary ? (
        <section aria-labelledby="market-summary" className="mb-10">
          <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-6 py-5">
            <div className="flex items-center gap-2 mb-2.5">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" />
              <h2 id="market-summary" className="text-base font-semibold text-[var(--text-primary)]">{dict.marketFocus.summaryTitle}</h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-[var(--text-secondary)]">AI</span>
            </div>
            <MarketFocusTtsBar summary={meta.summary} locale={locale} t={dict.marketFocus} />
            <p className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap mt-3">{meta.summary}</p>
            {meta.generated_at && (
              <p className="flex items-center gap-1.5 mt-3 text-xs text-[var(--text-secondary)]">
                <RefreshCw className="w-3.5 h-3.5" />
                {dict.marketFocus.updatedLabel}{formatDateTime(meta.generated_at, locale)}
              </p>
            )}
          </div>
        </section>
      ) : null}

      {/* 電子報訂閱 */}
      <MarketFocusSubscribe
        t={dict.marketFocus}
        socialLinks={{
          instagram: process.env.INSTAGRAM_PROFILE_URL || undefined,
          threads: process.env.THREADS_PROFILE_URL || undefined,
        }}
      />

      {/* 精選新聞 */}
      <section aria-labelledby="market-news" className="mb-10">
        <SectionHeading id="market-news" title={dict.marketFocus.selectedTitle} badge={dict.marketFocus.selectedBadge} />

        {focus.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-2">
            {focus.map((item) => (
              <NewsCard key={item.id} item={item} variant="full" />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">{dict.marketFocus.empty}</p>
        )}
      </section>

      {/* 方法與免責 */}
      <section aria-labelledby="market-method" className="mb-10">
        <SectionHeading id="market-method" title={dict.marketFocus.methodTitle} />
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          {dict.marketFocus.methodDesc}
        </p>
        <div className="rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 px-6 py-5">
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {dict.marketFocus.riskDesc}
          </p>
          <div className="mt-3 pt-3 border-t border-[var(--accent-red)]/20">
            <Link href={localizePath(locale, '/terms')} className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1 font-medium">
              {dict.marketFocus.termsLink}
            </Link>
          </div>
        </div>
      </section>

      <div>
        <Link href={localizePath(locale, '/')} className="text-sm text-[var(--accent)] hover:underline">
          {dict.marketFocus.backHome}
        </Link>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </div>
  )
}