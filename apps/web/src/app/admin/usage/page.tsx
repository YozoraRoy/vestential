import type { Metadata } from 'next'
import { UsageClient } from '../UsageClient'

export const metadata: Metadata = {
  title: '用量報表 | Vestential',
  robots: { index: false, follow: false },
}

export default function UsagePage() {
  return <UsageClient />
}