import type { Metadata } from 'next'
import { SocialClient } from '../SocialClient'

export const metadata: Metadata = {
  title: '社群小編 | Vestential',
  robots: { index: false, follow: false },
}

export default function SocialPage() {
  return <SocialClient />
}