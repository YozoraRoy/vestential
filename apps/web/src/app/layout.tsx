import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { getCurrentUserFromCookies, isAdminUser } from '@/lib/auth'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { getLocale } from '@/i18n/server'

const GA_MEASUREMENT_ID = 'G-1L1W07PGXY'

export const metadata: Metadata = {
  metadataBase: new URL('https://vestential.com'),
  title: 'Vestential',
  description: 'AI-powered stock analysis platform for working professionals: quarterly-line deviation, odd-lot accumulation, P&L tracking, and AI analysis.',
}

export const viewport: Viewport = {
  themeColor: '#0f1118',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserFromCookies()
  const isAdmin = user ? await isAdminUser(user) : false
  const initialUser = user
    ? {
        id: user.id,
        displayName: user.display_name,
        email: user.email,
        avatarUrl: user.avatar_url,
        isAdmin,
      }
    : null
  const locale = await getLocale()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased min-h-screen flex flex-col">
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
        <LanguageProvider>
          <Header initialUser={initialUser} />
          <main className="flex-1">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  )
}
