import type { ReactNode } from 'react'
import { cn } from '@/shared/utils'

export interface CardProps {
  children: ReactNode
  className?: string
}

// Fallback implementation used before @org/ui-kit is connected.
// Set NEXT_PUBLIC_UI_KIT_CONNECTED=true once the real package is wired up —
// this function will then throw to remind you to replace the stub.
export function Card({ children, className }: CardProps) {
  if (process.env.NEXT_PUBLIC_UI_KIT_CONNECTED === 'true') {
    throw new Error(
      '[furio-kit] Card adapter is not connected to @org/ui-kit. ' +
        'Import { Card as OrgCard } from "@org/ui-kit" and wrap it here. ' +
        'See docs/wiki/04-design-system.md.',
    )
  }

  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white p-6 shadow-sm', className)}>
      {children}
    </div>
  )
}
