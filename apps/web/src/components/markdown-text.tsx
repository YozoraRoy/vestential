import React from 'react'

/**
 * 輕量 Markdown 渲染（供 LLM 產生的簡報/討論內容使用）。
 * 支援：## 標題、**粗體**、` 行內程式碼、- / * / 1. 清單、空行分段。
 * 刻意不支援原始 HTML（避免 XSS），一律轉義。
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 把一段文字內的行內 markdown（**bold** / `code`）轉成 React nodes，其餘字元已轉義。 */
function inline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(escapeHtml(text.slice(last, match.index)))
    const tok = match[0]
    if (tok.startsWith('**') && tok.endsWith('**')) {
      nodes.push(
        <strong key={key++} className="font-semibold text-[var(--text-primary)]">
          {inline(tok.slice(2, -2))}
        </strong>,
      )
    } else {
      nodes.push(
        <code key={key++} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em]">
          {escapeHtml(tok.slice(1, -1))}
        </code>,
      )
    }
    last = match.index + tok.length
  }
  if (last < text.length) nodes.push(escapeHtml(text.slice(last)))
  return nodes
}

function renderLine(line: string, i: number): React.ReactNode {
  const trimmed = line.trim()
  const h = trimmed.match(/^(#{1,6})\s+(.+)$/)
  if (h) {
    const level = Math.min(h[1].length, 4)
    const classes: Record<number, string> = {
      1: 'text-base font-bold text-[var(--text-primary)] mt-3 mb-1',
      2: 'text-sm font-bold text-[var(--text-primary)] mt-3 mb-1',
      3: 'text-sm font-semibold text-[var(--text-primary)] mt-2 mb-1',
      4: 'text-[13px] font-semibold text-[var(--text-primary)] mt-2 mb-1',
    }
    const H = (`h${level}`) as keyof React.JSX.IntrinsicElements
    return React.createElement(H, { key: i, className: classes[level] }, inline(h[2]))
  }
  const ol = trimmed.match(/^\d+[.)]\s+(.+)$/)
  if (ol) {
    return (
      <div key={i} className="flex gap-1.5">
        <span className="shrink-0 select-none text-[var(--accent)]">•</span>
        <span>{inline(ol[1])}</span>
      </div>
    )
  }
  const ul = trimmed.match(/^[-*•]\s+(.+)$/)
  if (ul) {
    return (
      <div key={i} className="flex gap-1.5">
        <span className="shrink-0 select-none text-[var(--accent)]">•</span>
        <span>{inline(ul[1])}</span>
      </div>
    )
  }
  if (trimmed.startsWith('---') || trimmed.startsWith('***')) {
    return <div key={i} className="my-2 h-px bg-white/10" />
  }
  return (
    <div key={i} className={trimmed === '' ? 'h-2' : ''}>
      {inline(line)}
    </div>
  )
}

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const lines = String(text ?? '').split(/\r?\n/)
  return (
    <div className={className}>
      {lines.map((line, i) => renderLine(line, i))}
    </div>
  )
}
