import { ArrowUpRight } from 'lucide-react'
import type { MarketFocusItem } from '@stock/database'

function formatDateTime(s: string): string {
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return s
  return dt.toLocaleDateString('zh-TW') + ' ' + dt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

interface NewsCardProps {
  item: MarketFocusItem
  /** compact 用於首頁（單列精簡）；full 用於 /market-focus（含摘錄、全文、出處連結）。 */
  variant?: 'compact' | 'full'
}

/** 市場焦點新聞卡。出處：首頁市場焦點區塊、`app/market-focus/page.tsx`。 */
export function NewsCard({ item, variant = 'compact' }: NewsCardProps) {
  const href = item.source_url || item.url
  const excerpt = item.content ? item.content.slice(0, 500) : ''
  return (
    <li className="bg-[var(--bg-card)] rounded-xl p-4 border border-white/5 hover:border-white/10 transition">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start gap-2 text-[var(--text-primary)] font-medium leading-snug hover:text-[var(--accent)] transition"
      >
        <span className="flex-1">{item.title}</span>
        <ArrowUpRight className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition" />
      </a>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)] mt-1.5">
        {item.source && <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{item.source}</span>}
        {item.published_at && <span>{formatDateTime(item.published_at)}</span>}
      </div>
      {item.reason && (
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-2 pt-2 border-t border-white/5">{item.reason}</p>
      )}
      {variant === 'full' && (
        <div className="mt-3 pt-3 border-t border-white/5">
          {item.content ? (
            <>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{excerpt}{item.content.length > 500 ? '…' : ''}</p>
              <details className="group text-sm mt-3">
                <summary className="cursor-pointer font-medium text-[var(--accent)] hover:opacity-80 transition select-none">
                  閱讀全文摘錄
                </summary>
                <p className="mt-2 text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{item.content}</p>
              </details>
            </>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">摘要與全文尚未取得，請前往原文閱讀。</p>
          )}
          <div className="flex items-center gap-3 mt-3">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:opacity-80 transition"
            >
              前往原文
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </li>
  )
}