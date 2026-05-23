import type { Metadata } from 'next'
import type { ReactNode } from 'react'
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
          onto <body> before React hydrates. */}
      <body suppressHydrationWarning className="min-h-screen bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  )
}
