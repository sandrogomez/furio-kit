import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { QueryProvider, StoreProvider } from '@/shared/providers'
import { Header } from '@/widgets/header'
import './globals.css'

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? 'My App',
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION ?? 'Enterprise React boilerplate by FurioLabs',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning suppresses false-positive hydration errors caused by
          browser extensions (password managers, accessibility tools) injecting attributes
          onto <body> before React hydrates. Per React spec, this only suppresses one level
          deep — errors in children still surface normally. */}
      <body suppressHydrationWarning className="min-h-screen bg-gray-50 text-gray-900">
        <StoreProvider>
          <QueryProvider>
            <Header />
            <main>{children}</main>
          </QueryProvider>
        </StoreProvider>
      </body>
    </html>
  )
}
