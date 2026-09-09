import type { Metadata } from 'next'
import { OverviewClient } from './OverviewClient'

export const metadata: Metadata = {
  title: '後台總覽 | Vestential',
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return <OverviewClient />
}