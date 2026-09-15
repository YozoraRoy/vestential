'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  TrendingUp, AlertTriangle, Newspaper, BarChart3,
  ThumbsUp, ClipboardList, ShoppingCart, Briefcase,
  XCircle, CheckCircle2, Loader2,
  LucideIcon,
} from 'lucide-react'
import { useI18n } from '@/i18n/LanguageProvider'

export const AGENT_ICONS: Record<string, LucideIcon> = {
  'Market Analyst': TrendingUp,
  'Sentiment Analyst': AlertTriangle,
  'News Analyst': Newspaper,
  'Fundamentals Analyst': BarChart3,
  'Bull Researcher': ThumbsUp,
  'Research Manager': ClipboardList,
  'Trader': ShoppingCart,
  'Portfolio Manager': Briefcase,
}

type AgentStatus = 'completed' | 'failed' | 'running'

interface AgentReportSectionProps {
  agent: string
  content: string
  status?: AgentStatus
  error?: string
}

/** 單一 Agent 即時報告（部分完成／續跑時逐個渲染）。 */
export function AgentReportSection({ agent, content, status = 'completed', error }: AgentReportSectionProps) {
  const { dict } = useI18n()
  const ui = dict.analyzePage
  const progressUi = dict.progressPanel
  const Icon = AGENT_ICONS[agent] ?? FileIcon
  const label = progressUi.eachAgent[agent] ?? agent

  const borderClass =
    status === 'failed'
      ? 'border-red-500/30'
      : status === 'running'
        ? 'border-[var(--accent)]/30'
        : 'border-white/10'

  return (
    <section className={`bg-[var(--bg-card)] rounded-xl border ${borderClass} overflow-hidden`}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/5">
        <Icon className={`w-4 h-4 ${status === 'failed' ? 'text-red-400' : 'text-[var(--accent)]'}`} />
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="ml-auto">
          {status === 'completed' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--accent-green)]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {ui.agentComplete}
            </span>
          )}
          {status === 'failed' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-400">
              <XCircle className="w-3.5 h-3.5" />
              {ui.agentFailed}
            </span>
          )}
          {status === 'running' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--accent)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {progressUi.analyzing}
            </span>
          )}
        </span>
      </div>
      {status === 'failed' && error && (
        <div className="px-4 py-2 bg-red-900/10 text-red-400 text-xs border-b border-red-500/20">
          {error}
        </div>
      )}
      {content && (
        <div className="px-4 py-4 prose prose-invert max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </section>
  )
}

function FileIcon() {
  return (
    <svg className="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

/** 將 Agent 名稱對應到報告區塊欄位（前端渲染用）。 */
export const REPORT_FIELD_TO_AGENT: Record<string, string> = {
  marketReport: 'Market Analyst',
  sentimentReport: 'Sentiment Analyst',
  newsReport: 'News Analyst',
  fundamentalsReport: 'Fundamentals Analyst',
  investmentPlan: 'Research Manager',
  traderProposal: 'Trader',
  finalDecision: 'Portfolio Manager',
}