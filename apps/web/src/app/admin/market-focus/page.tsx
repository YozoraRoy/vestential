import type { Metadata } from 'next'
import { MarketFocusClient } from '../MarketFocusClient'

export const metadata: Metadata = {
  title: '市場焦點小編 | Vestential',
  robots: { index: false, follow: false },
}

export default function MarketFocusPage() {
  return <MarketFocusClient />
}