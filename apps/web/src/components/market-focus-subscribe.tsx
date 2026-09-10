'use client'

import { Instagram, Mail, MessageCircle } from 'lucide-react'
import { useState } from 'react'

type SubscribeState = 'idle' | 'loading' | 'done' | 'error'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface MarketFocusSocialLinks {
  instagram?: string
  threads?: string
}

interface MarketFocusSubscribeProps {
  socialLinks?: MarketFocusSocialLinks
}

export function MarketFocusSubscribe({ socialLinks }: MarketFocusSubscribeProps) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<SubscribeState>('idle')
  const [message, setMessage] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value || !EMAIL_RE.test(value) || value.length > 255) {
      setState('error')
      setMessage('請輸入有效的 Email 地址。')
      return
    }
    setState('loading')
    const res = await fetch('/api/market-focus/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: value }),
    }).catch(() => null)
    const body = (await res?.json().catch(() => ({}))) as { success?: boolean; error?: string }
    if (res?.ok && body.success) {
      setState('done')
      setMessage('確認信已寄出！請到信箱點擊信中連結完成訂閱。')
    } else {
      setState('error')
      setMessage(body?.error ?? '訂閱失敗，請稍後再試。')
    }
  }

  return (
    <section aria-labelledby="newsletter-title" className="mb-10">
      <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-6 py-5">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-4 h-4 text-[var(--accent)]" />
          <h2 id="newsletter-title" className="text-base font-semibold text-[var(--text-primary)]">
            訂閱市場焦點電子報
          </h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          留下 Email，最新一期「市場焦點」總覽更新時自動寄給您，免費且可隨時一鍵退訂。
        </p>
        {state === 'done' ? (
          <p className="text-sm text-[var(--accent-green)] font-medium">{message}</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (state === 'error') {
                  setState('idle')
                  setMessage('')
                }
              }}
              placeholder="you@example.com"
              aria-label="Email"
              className="flex-1 px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--accent)]/60"
            />
            <button
              type="submit"
              disabled={state === 'loading' || email.trim().length === 0}
              className="px-5 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {state === 'loading' ? '訂閱中…' : '訂閱'}
            </button>
          </form>
        )}
        {state === 'error' && <p className="mt-3 text-sm text-[var(--accent-red)]">{message}</p>}
        <p className="mt-3 text-xs text-[var(--text-secondary)]/80">
          訂閱採雙重驗證（double opt-in）：提交後會收到一封確認信，點擊確認才算完成訂閱。完成後您可隨時使用信件內文退訂連結取消。
        </p>
        {(socialLinks?.instagram || socialLinks?.threads) && (
          <div className="mt-4 pt-3 border-t border-white/10 text-xs text-[var(--text-secondary)]/80 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>追蹤我們：</span>
            {socialLinks.instagram && (
              <a
                href={socialLinks.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline font-medium"
              >
                <Instagram className="w-3.5 h-3.5" />
                Instagram
              </a>
            )}
            {socialLinks.threads && (
              <a
                href={socialLinks.threads}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline font-medium"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Threads
              </a>
            )}
            <span className="text-[var(--text-secondary)]/60">每日市場焦點不漏接</span>
          </div>
        )}
      </div>
    </section>
  )
}