import Link from 'next/link'
import { getDict, getLocale } from '@/i18n/server'
import { localizePath } from '@/i18n/paths'
import { buildAlternates } from '@/i18n/metadata'

export async function generateMetadata() {
  const dict = await getDict()
  const locale = await getLocale()
  const { metaTitle, metaDesc } = dict.privacy
  return {
    title: metaTitle,
    description: metaDesc,
    alternates: buildAlternates(locale, '/privacy'),
  }
}

export default async function PrivacyPage() {
  const dict = await getDict()
  const locale = await getLocale()
  const d = dict.privacy
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-8">{d.title}</h1>
      <div className="prose prose-invert max-w-none space-y-6 text-base text-[var(--text-secondary)] leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{d.s1Title}</h2>
          <p>{d.s1p1}</p>
          <p>{d.s1p2}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{d.s2Title}</h2>
          <p>{d.s2p1}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>{d.s2li1}</li>
            <li>{d.s2li2}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{d.s3Title}</h2>
          <p>{d.s3p1}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{d.s4Title}</h2>
          <p>{d.s4p1}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{d.s5Title}</h2>
          <p>{d.s5p1}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{d.s6Title}</h2>
          <p>
            {d.s6p1}{' '}
            <a href="mailto:service@vestential.com" className="text-[var(--accent)] hover:underline">
              service@vestential.com
            </a>
            {d.s6Suffix}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{d.s7Title}</h2>
          <p>{d.s7p1}</p>
        </section>

        <p className="text-[var(--text-secondary)] pt-4">{d.updated}</p>
      </div>
      <div className="mt-8">
        <Link href={localizePath(locale, '/')} className="text-sm text-[var(--accent)] hover:underline">
          {dict.common.backToHome}
        </Link>
      </div>
    </div>
  )
}