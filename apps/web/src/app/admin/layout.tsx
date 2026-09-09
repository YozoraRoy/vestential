import { redirect } from 'next/navigation'
import { getCurrentUserFromCookies, isAdminUser } from '@/lib/auth'
import { AdminNav } from './AdminNav'

export const metadata = { robots: { index: false, follow: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserFromCookies()
  if (!user || !(await isAdminUser(user))) {
    redirect('/login?redirect=/admin')
  }
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <AdminNav />
      <main className="lg:pl-60">
        <div className="max-w-6xl mx-auto px-4 py-8 md:py-10">{children}</div>
      </main>
    </div>
  )
}