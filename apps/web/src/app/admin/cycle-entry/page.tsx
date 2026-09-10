import type { Metadata } from 'next'
import { CycleEntryClient } from '../CycleEntryClient'

export const metadata: Metadata = {
  title: '週期進場小編 | Vestential',
  robots: { index: false, follow: false },
}

export default function CycleEntryPage() {
  return <CycleEntryClient />
}