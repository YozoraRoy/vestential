import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUserFromCookies, isAdminUser } from '@/lib/auth'
import { AdminClient } from './AdminClient'

export const metadata: Metadata = {
  title: '後台管理 | Vestential',
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const user = await getCurrentUserFromCookies()
  if (!user || !(await isAdminUser(user))) {
    redirect('/login?redirect=/admin')
  }
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 md:py-14">
      <header className="mb-10">
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-2">後台管理</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          系統狀態・用量報表・市場焦點・社群小編・競技場管理・Agent 設定
        </p>
      </header>
      <AdminClient />
    </div>
  )
}
