'use client'

import Link from 'next/link'
import { useI18n } from '@/i18n/LanguageProvider'
import { localizePath } from '@/i18n/paths'
import type { Dict } from '@/i18n/dictionaries'

const footerLinks: { key: keyof Dict['footer']; href: string }[] = [
  { key: 'privacy', href: '/privacy' },
  { key: 'terms', href: '/terms' },
  { key: 'about', href: '/about' },
]

export function Footer() {
  const { dict, locale } = useI18n()
  return (
    <footer className="border-t border-white/5 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand-logo.png" alt="" className="w-4 h-4 object-contain opacity-70" />
            <span>© {new Date().getFullYear()} Vestential</span>
          </div>
          <nav className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={localizePath(locale, link.href)}
                className="hover:text-[var(--text-primary)] transition"
              >
                {dict.footer[link.key]}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}