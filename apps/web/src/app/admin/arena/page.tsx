import type { Metadata } from 'next'
import { ArenaClient } from '../ArenaClient'

export const metadata: Metadata = {
  title: '競技場管理 | Vestential',
  robots: { index: false, follow: false },
}

export default function ArenaPage() {
  return <ArenaClient />
}