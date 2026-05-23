import type { ReactNode } from 'react'
import { QueryProvider, StoreProvider } from '@/shared/providers'
import { Header } from '@/widgets/header'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <QueryProvider>
        <Header />
        <main>{children}</main>
      </QueryProvider>
    </StoreProvider>
  )
}
