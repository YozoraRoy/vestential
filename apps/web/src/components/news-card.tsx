import { ArrowUpRight, Sparkles, FileText, ShieldCheck, Gauge, LineChart } from 'lucide-react'
import Link from 'next/link'
import type { MarketFocusItem } from '@stock/database'
import { getDict, getLocale } from '@/i18n/server'
import { localizePath } from '@/i18n/paths'

function formatDateTime(s: string, locale: string): string {
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return s
  return dt.toLocaleDateString(locale) + ' ' + dt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

interface NewsCardProps {
  item: MarketFocusItem
  /** compact 用於首頁（單列精簡）；full 用於 /market-focus（含 AI 重點解讀、原文摘錄折疊、出處連結）。 */
  variant?: 'compact' | 'full'
}

/** 市場焦點新聞卡。出處：首頁市場焦點區塊、`app/market-focus/page.tsx`。 */
export async function NewsCard({ item, variant = 'compact' }: NewsCardProps) {
  const dict = await getDict()
  const locale = await getLocale()
  const href = item.source_url || item.url

  // Issue #19：影響方向 badge 文案與顏色
  const direction = item.impact_direction === 'positive' || item.impact_direction === 'negative' || item.impact_direction === 'neutral'
    ? item.impact_direction
    : null
  const directionLabel = direction === 'positive'
    ? dict.marketFocus.newsDirPositive
    : direction === 'negative'
      ? dict.marketFocus.newsDirNegative
      : direction === 'neutral'
        ? dict.marketFocus.newsDirNeutral
        : null
  const directionCls = direction === 'positive'
    ? 'bg-[var(--accent-green)]/15 text-[var(--accent-green)] border-[var(--accent-green)]/30'
    : direction === 'negative'
      ? 'bg-[var(--accent-red)]/15 text-[var(--accent-red)] border-[var(--accent-red)]/30'
      : 'bg-white/5 text-[var(--text-secondary)] border-white/10'
  const hasImpact = Boolean(directionLabel || item.scope || item.horizon || item.affected_sectors || item.action)
  const relatedSymbols = (item.related_symbols ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{4,6}$/.test(s))
    .slice(0, 3)

  return (
    <li className="bg-[var(--bg-card)] rounded-xl p-5 border border-white/5 hover:border-white/10 transition">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start gap-2 text-[var(--text-primary)] font-semibold text-base leading-snug hover:text-[var(--accent)] transition"
      >
        <span className="flex-1">{item.title}</span>
        <ArrowUpRight className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition" />
      </a>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)] mt-2">
        {item.source && <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{item.source}</span>}
        {item.published_at && <span>{formatDateTime(item.published_at, locale)}</span>}
      </div>

      {/* AI 說人話重點摘要（核心主體） */}
      {item.summary && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] mb-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{dict.marketFocus.newsAiSummary}</span>
          </div>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{item.summary}</p>
        </div>
      )}

      {/* 價值投資遴選原因 */}
      {item.reason && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-green)] mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{dict.marketFocus.newsValueReason}</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.reason}</p>
        </div>
      )}

      {/* Issue #19：新聞影響結構化（影響方向＋族群＋時程＋行動） */}
      {hasImpact && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] mb-1.5">
            <Gauge className="w-3.5 h-3.5" />
            <span>{dict.marketFocus.newsImpactTitle}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {directionLabel && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${directionCls}`}>
                {directionLabel}
              </span>
            )}
            {item.horizon && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[var(--text-secondary)]">
                {dict.marketFocus.newsImpactHorizon}：{item.horizon}
              </span>
            )}
          </div>
          <dl className="space-y-1 text-xs leading-relaxed">
            {item.scope && (
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-[var(--text-secondary)]">{dict.marketFocus.newsImpactScope}：</dt>
                <dd className="text-[var(--text-primary)]">{item.scope}</dd>
              </div>
            )}
            {item.affected_sectors && (
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-[var(--text-secondary)]">{dict.marketFocus.newsImpactSectors}：</dt>
                <dd className="text-[var(--text-primary)]">{item.affected_sectors}</dd>
              </div>
            )}
            {item.action && (
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-[var(--text-secondary)]">{dict.marketFocus.newsImpactAction}：</dt>
                <dd className="text-[var(--text-primary)]">{item.action}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Issue #19：可連回對應回測標的 */}
      {relatedSymbols.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
            <LineChart className="w-3.5 h-3.5 text-[var(--accent)]" />
          </span>
          {relatedSymbols.map((sym) => (
            <Link
              key={sym}
              href={localizePath(locale, `/backtest?symbol=${sym}&preset=medium`)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
            >
              {dict.marketFocus.newsBacktestSymbol.replace('{symbol}', sym)}
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          ))}
        </div>
      )}

      {/* 摘要與遴選原因皆缺時的最小兜底 */}
      {!item.summary && !item.reason && !hasImpact && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {dict.marketFocus.newsFallback}
          </p>
        </div>
      )}

      {variant === 'full' && (
        <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-3">
          {item.content && (
            <details className="group text-xs">
              <summary className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition select-none inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>{dict.marketFocus.newsExcerptToggle}</span>
              </summary>
              <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap bg-white/[0.02] p-3 rounded-lg border border-white/5 max-h-48 overflow-y-auto">
                {item.content}
              </p>
            </details>
          )}

          <div>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              {dict.marketFocus.newsReadOriginal}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </li>
  )
}