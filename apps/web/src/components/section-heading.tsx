import type { LucideIcon } from 'lucide-react'

interface SectionHeadingProps {
  id: string
  title: string
  icon?: LucideIcon
  badge?: string
  size?: 'md' | 'lg'
  /** 右側操作區（如「查看完整頁面 →」連結）。 */
  children?: React.ReactNode
}

/**
 * Section 標題帶：icon + H2 + 選用徽章，右側可掛操作連結。
 * 出處：`app/page.tsx`（功能區塊／市場焦點）、`app/market-focus/page.tsx`。
 */
export function SectionHeading({ id, title, icon: Icon, badge, size = 'lg', children }: SectionHeadingProps) {
  const headingCls =
    size === 'md' ? 'text-lg font-semibold' : 'text-xl font-bold'
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 text-[var(--accent)]" />}
        <h2 id={id} className={`${headingCls} text-[var(--text-primary)]`}>
          {title}
        </h2>
        {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-[var(--text-secondary)]">{badge}</span>}
      </div>
      {children}
    </div>
  )
}