'use client'

import { useCallback, useEffect, useState } from 'react'

// ─── 節慶全域橫幅（client）─────────────────────────────────────────
// role=status、可鍵盤關閉（button＋Esc）、sessionStorage 當日關閉、
// prefers-reduced-motion 停動畫、360px 不溢出、深色 tokens＋金綠漸層＋glassmorphism。

interface FestivalBannerProps {
  message: string
  dismissLabel: string
  /** Asia/Taipei 的 YYYY-MM-DD（sessionStorage 當日關閉 key 用）。 */
  dateStr: string
}

function dismissKey(dateStr: string): string {
  return `festival-banner-dismissed:${dateStr}`
}

export function FestivalBanner({ message, dismissLabel, dateStr }: FestivalBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(dismissKey(dateStr)) === '1') setDismissed(true)
    } catch {
      /* sessionStorage 不可用時忽略，橫幅照常顯示 */
    }
  }, [dateStr])

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(dismissKey(dateStr), '1')
    } catch {
      /* 寫入失敗仍關閉本次顯示 */
    }
    setDismissed(true)
  }, [dateStr])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismiss])

  if (dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="festival-banner relative flex w-full max-w-full box-border items-center gap-2 overflow-hidden px-3 py-2.5 text-[var(--text-primary)] backdrop-blur-md"
    >
      <p className="m-0 min-w-0 flex-1 text-sm leading-relaxed break-words">{message}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={dismissLabel}
        className="inline-flex min-h-8 min-w-8 flex-none cursor-pointer items-center justify-center rounded-lg border border-white/20 bg-transparent px-2 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-white/40 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
      >
        ✕
      </button>
      <style>{`
        .festival-banner {
          background:
            linear-gradient(100deg, rgba(20, 83, 45, 0.55), rgba(113, 63, 18, 0.45)),
            rgba(11, 13, 19, 0.72);
          border-bottom: 1px solid rgba(250, 204, 21, 0.35);
          box-shadow: 0 0 24px rgba(34, 197, 94, 0.18), 0 0 32px rgba(250, 204, 21, 0.1);
          animation: festival-glow 5s ease-in-out infinite;
        }
        @keyframes festival-glow {
          0%, 100% { box-shadow: 0 0 24px rgba(34, 197, 94, 0.18), 0 0 32px rgba(250, 204, 21, 0.1); }
          50% { box-shadow: 0 0 32px rgba(34, 197, 94, 0.3), 0 0 44px rgba(250, 204, 21, 0.18); }
        }
        @media (prefers-reduced-motion: reduce) {
          .festival-banner { animation: none; }
        }
      `}</style>
    </div>
  )
}
