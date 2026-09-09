'use client'

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

/** 「?」hover tooltip。 */
export function Help({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        aria-label="說明"
        className="flex items-center justify-center w-4 h-4 rounded-full bg-white/10 text-[var(--text-secondary)] text-[10px] cursor-help select-none"
      >
        ?
      </span>
      <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 z-20 hidden group-hover:block w-64 rounded-lg border border-white/10 bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] shadow-xl whitespace-normal">
        {text}
      </span>
    </span>
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

export const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))

export const getJson = (url: string) => fetch(url).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))

export function pct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

export function money(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-TW')
}