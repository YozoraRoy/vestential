import type { Metadata } from 'next'
import { LlmUsageClient } from '../LlmUsageClient'

export const metadata: Metadata = {
  title: 'LLM 用量 | Vestential',
  robots: { index: false, follow: false },
}

export default function LlmUsagePage() {
  return <LlmUsageClient />
}