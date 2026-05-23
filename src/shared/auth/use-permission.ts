'use client'
import { useUIStore } from '@/shared/providers'
import { hasPermission } from './permissions'
import type { Permission } from './permissions'

// UI-only guard for hiding/disabling elements based on role.
// Real enforcement always happens server-side via requirePermission().
export function usePermission(permission: Permission): boolean {
  const user = useUIStore((s) => s.session?.user)
  if (!user) return false
  return hasPermission(user, permission)
}
