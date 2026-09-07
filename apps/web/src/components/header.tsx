'use client'

import { TrendingUp, LogOut, User, Zap } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LanguageProvider'
import { localizePath } from '@/i18n/paths'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import type { Dict } from '@/i18n/dictionaries'

const navItems: { key: keyof Dict['nav']; href: string }[] = [
  { key: 'home', href: '/' },
  { key: 'oddLot', href: '/odd-lot' },
  { key: 'backtest', href: '/backtest' },
  { key: 'portfolio', href: '/portfolio' },
  { key: 'analyze', href: '/analyze' },
  { key: 'marketFocus', href: '/market-focus' },
  { key: 'agentArena', href: '/agent-arena' },
]

export interface HeaderUser {
  id: number
  displayName: string | null
  email: string | null
  avatarUrl: string | null
}

export function Header({ initialUser }: { initialUser: HeaderUser | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const { dict, locale } = useI18n()
  const [user, setUser] = useState<HeaderUser | null>(initialUser)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const refreshQuota = () => {
      fetch('/api/auth/me')
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (cancelled || !data?.success) return
          if (data.user) setUser(data.user)
          if (typeof data.quota?.remaining === 'number') setRemaining(data.quota.remaining)
        })
        .catch(() => {})
    }
    refreshQuota()
    window.addEventListener('quota-updated', refreshQuota)
    return () => {
      cancelled = true
      window.removeEventListener('quota-updated', refreshQuota)
    }
  }, [user?.id])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
      setMenuOpen(false)
      router.refresh()
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href={localizePath(locale, '/')} className="flex items-center gap-2.5 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand-logo.png"
            alt="Vestential Logo"
            className="w-8 h-8 object-contain transition-transform group-hover:scale-105"
          />
          <span className="text-lg font-bold tracking-tight">Vestential</span>
        </Link>
        <div className="flex items-center gap-1">
          <nav className="flex items-center gap-1 mr-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={localizePath(locale, item.href)}
                  className={`px-3 py-2 text-sm rounded-lg transition ${
                    isActive
                      ? 'text-[var(--text-primary)] bg-white/10'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'
                  }`}
                >
                  {dict.nav[item.key]}
                </Link>
              )
            })}
          </nav>

          <LanguageSwitcher />

          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(prev => !prev)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition"
                aria-label="使用者選單"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center text-xs font-bold">
                    {(user.displayName || user.email || 'U').slice(0, 1).toUpperCase()}
                  </span>
                )}
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-[var(--bg-card)] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5">
                      <div className="text-sm font-medium truncate">
                        {user.displayName || '未命名使用者'}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                        {user.email || '未綁定 Email'}
                      </div>
                      {typeof remaining === 'number' && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-[var(--accent)]">
                          <Zap className="w-3.5 h-3.5" />
                          {dict.common.quotaRemaining}{remaining}
                        </div>
                      )}
                    </div>
                    <Link
                      href={localizePath(locale, '/analyze')}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition"
                    >
                      <User className="w-4 h-4" />
                      {dict.common.myAnalysis}
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      {dict.common.logout}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link
              href={localizePath(locale, '/login')}
              className="px-3 py-2 text-sm rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 transition"
            >
              {dict.common.login}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
