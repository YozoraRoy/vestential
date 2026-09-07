import { Bot } from 'lucide-react'
import { getDict, getLocale } from '@/i18n/server'
import { localizePath } from '@/i18n/paths'
import { buildAlternates } from '@/i18n/metadata'
import { AgentArenaView } from '@/components/agent-arena-view'

const BASE_URL = 'https://vestential.com'

export async function generateMetadata() {
  const dict = await getDict()
  const locale = await getLocale()
  const alts = buildAlternates(locale, '/agent-arena')
  return {
    title: dict.agentArena.metaTitle,
    description: dict.agentArena.metaDesc,
    alternates: alts,
    openGraph: {
      title: dict.agentArena.metaTitle,
      description: dict.agentArena.metaDesc,
      url: alts.canonical,
      siteName: 'Vestential',
      type: 'website',
      locale: locale === 'zh-TW' ? 'zh_TW' : locale,
    },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function AgentArenaPage() {
  const dict = await getDict()
  const locale = await getLocale()

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: 'Vestential', url: BASE_URL, description: dict.agentArena.metaDesc, inLanguage: ['zh-TW', 'en', 'ja'] },
      { '@type': 'Organization', name: 'Vestential', url: BASE_URL, slogan: 'Vestential = Vest + Essential' },
      { '@type': 'WebPage', name: dict.agentArena.metaTitle, description: dict.agentArena.metaDesc, url: `${BASE_URL}/agent-arena`, inLanguage: locale },
    ],
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-8 md:py-10">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-6 h-6 text-[var(--accent-violet)]" />
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-violet)]/15 text-[var(--accent-violet)]">AI Arena</span>
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-3">{dict.agentArena.title}</h1>
      <div className="mb-6 w-16 h-1 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-violet)]" />
      <p className="max-w-3xl text-base text-[var(--text-secondary)] leading-relaxed mb-8">{dict.agentArena.subtitle}</p>

      <AgentArenaView homePath={localizePath(locale, '/')} loginPath={localizePath(locale, '/login')} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
    </div>
  )
}