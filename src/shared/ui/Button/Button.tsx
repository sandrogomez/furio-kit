'use client'

import type { ReactNode } from 'react'

export interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
}

// Fallback implementation used before @org/ui-kit is connected.
// Set NEXT_PUBLIC_UI_KIT_CONNECTED=true once the real package is wired up —
// this function will then throw to remind you to replace the stub.
export function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled,
  onClick,
}: ButtonProps) {
  if (process.env.NEXT_PUBLIC_UI_KIT_CONNECTED === 'true') {
    throw new Error(
      '[furio-kit] Button adapter is not connected to @org/ui-kit. ' +
        'Import { Button as OrgButton } from "@org/ui-kit" and wrap it here. ' +
        'See docs/wiki/04-design-system.md.',
    )
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${variantStyles[variant]}`}
    >
      {children}
    </button>
  )
}
