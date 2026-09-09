'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type Result = { ok: boolean; message: string } | null

export const btn =
  'inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition'
export const btnGhost =
  'inline-flex items-center justify-center px-4 py-2 rounded-lg border border-white/15 text-[var(--text-primary)] text-sm font-medium hover:border-[var(--accent)]/60 hover:text-[var(--accent)] disabled:opacity-50 transition'
export const input =
  'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/60'

export function ResultBanner({ result, onDismiss }: { result: Result; onDismiss: () => void }) {
  if (!result) return null
  return (
    <div
      className={`mb-6 px-4 py-3 rounded-lg text-sm border ${
        result.ok ? 'bg-[var(--accent-green)]/10 border-[var(--accent-green)]/30 text-[var(--accent-green)]' : 'bg-[var(--accent-red)]/10 border-[var(--accent-red)]/30 text-[var(--accent-red)]'
      }`}
    >
      <span className="whitespace-pre-wrap">{result.message}</span>
      <button onClick={onDismiss} className="float-right text-xs opacity-70 hover:opacity-100">✕</button>
    </div>
  )
}

export function Card({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
        {hint ? <Help text={hint} /> : null}
      </div>
      {children}
    </section>
  )
}

/** 「?」hover tooltip。用 portal 掛到 body，避免被 overflow-x-auto 等容器裁切。 */
export function Help({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const show = () => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const tipW = 264
    const left = r.right + 10 + tipW > window.innerWidth ? Math.max(8, r.left - tipW - 10) : r.right + 10
    setPos({ top: r.top - 2, left })
    setOpen(true)
  }
  const hide = () => setOpen(false)

  return (
    <>
      <span
        ref={ref}
        aria-label="說明"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/10 text-[var(--text-secondary)] text-[10px] cursor-help select-none align-middle"
      >
        ?
      </span>
      {open && pos
        ? createPortal(
            <span
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: 264, maxHeight: 220, overflowY: 'auto' }}
              className="z-[100] rounded-lg border border-white/10 bg-[var(--bg-primary)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)] shadow-xl whitespace-normal"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </>
  )
}

/** 唯讀資訊列（不放輸入框）。 */
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-[var(--text-secondary)] shrink-0">{label}</span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

export function SectionPageWrapper({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header className="mb-2">
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-2">{title}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{subtitle}</p>
      </header>
      {children}
    </div>
  )
}

async function fetchJson(url: string, init: RequestInit | undefined, timeoutMs: number) {
  try {
    const res = await Promise.race([
      fetch(url, init),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('請求逾時')), timeoutMs)),
    ])
    return { ok: res.ok, body: await res.json().catch(() => ({})) }
  } catch (e) {
    return { ok: false, body: { error: e instanceof Error ? e.message : '請求失敗' } }
  }
}

export const post = (url: string, body?: unknown, timeoutMs = 30000) =>
  fetchJson(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    },
    timeoutMs,
  )

export const getJson = (url: string, timeoutMs = 30000) => fetchJson(url, undefined, timeoutMs)

export function pct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

export function money(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-TW')
}