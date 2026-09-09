import type { Metadata } from 'next'
import { SettingsClient } from '../SettingsClient'

export const metadata: Metadata = {
  title: 'Agent 設定 | Vestential',
  robots: { index: false, follow: false },
}

export default function SettingsPage() {
  return <SettingsClient />
}