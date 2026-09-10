import type { Metadata } from 'next'
import { SubscribersClient } from '../SubscribersClient'

export const metadata: Metadata = {
  title: '訂閱名單 | Vestential',
  robots: { index: false, follow: false },
}

export default function SubscribersPage() {
  return <SubscribersClient />
}