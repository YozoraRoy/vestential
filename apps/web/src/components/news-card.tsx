import { ArrowUpRight, Sparkles, FileText, ShieldCheck } from 'lucide-react'
import type { MarketFocusItem } from '@stock/database'

function formatDateTime(s: string): string {
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return s
  return dt.toLocaleDateString('zh-TW') + ' ' + dt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

interface NewsCardProps {
  item: MarketFocusItem
  /** compact 用於首頁（單列精簡）；full 用於 /market-focus（含 AI 重點解讀、原文摘錄折疊、出處連結）。 */
  variant?: 'compact' | 'full'
}

/** 市場焦點新聞卡。出處：首頁市場焦點區塊、`app/market-focus/page.tsx`。 */
export function NewsCard({ item, variant = 'compact' }: NewsCardProps) {
  const href = item.source_url || item.url

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
        {item.published_at && <span>{formatDateTime(item.published_at)}</span>}
      </div>

      {/* AI 說人話重點摘要（核心主體） */}
      {item.summary && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] mb-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 重點摘要</span>
          </div>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{item.summary}</p>
        </div>
      )}

      {/* 價值投資遴選原因 */}
      {item.reason && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-green)] mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>價值投資遴選原因</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.reason}</p>
        </div>
      )}

      {/* 摘要與遴選原因皆缺時的最小兜底 */}
      {!item.summary && !item.reason && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            AI 摘要與遴選原因尚在整理中，請前往原文閱讀詳情。
          </p>
        </div>
      )}

      {variant === 'full' && (
        <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-3">
          {item.content && (
            <details className="group text-xs">
              <summary className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition select-none inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>查看新聞原文摘錄（參考）</span>
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
              前往新聞出處閱讀原文
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </li>
  )
}