'use client'

import { useEffect, useState } from 'react'
import type { CycleEntrySignalRow } from '@stock/database'
import { CycleEntryView, type CycleEntryDict } from './cycle-entry-view'
import { CycleEntryDetailModal } from './cycle-entry-detail-modal'

const SUFFIX_RE = /\.(TW|TWO)$/i

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(SUFFIX_RE, '')
}

interface Props {
  signals: CycleEntrySignalRow[]
  dict: CycleEntryDict
}

export function CycleEntrySection({ signals, dict }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)

  // URL 直連分享：?symbol=2317 自動開啟對應標的詳情
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sym = new URLSearchParams(window.location.search).get('symbol')
    if (!sym) return
    const found = signals.find((s) => normalizeSymbol(s.symbol) === normalizeSymbol(sym))
    if (found) setSelectedSymbol(found.symbol)
  }, [signals])

  // 開關 Modal 時同步 URL（replaceState，不觸發路由跳轉）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (selectedSymbol) {
      url.searchParams.set('symbol', normalizeSymbol(selectedSymbol))
    } else {
      url.searchParams.delete('symbol')
    }
    window.history.replaceState({}, '', url.toString())
  }, [selectedSymbol])

  const selected = signals.find((s) => s.symbol === selectedSymbol) ?? null

  return (
    <>
      <CycleEntryView signals={signals} dict={dict} onSelect={(s) => setSelectedSymbol(s.symbol)} />
      <CycleEntryDetailModal signal={selected} dict={dict} onClose={() => setSelectedSymbol(null)} />
    </>
  )
}