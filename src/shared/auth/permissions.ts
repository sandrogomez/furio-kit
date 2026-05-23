import type { AuthUser } from './types'

export type Permission =
  | 'users:read'
  | 'users:write'
  | 'settings:read'
  | 'settings:write'
  | 'reports:read'

const ROLE_PERMISSIONS: Record<AuthUser['role'], Permission[]> = {
  admin: ['users:read', 'users:write', 'settings:read', 'settings:write', 'reports:read'],
  member: ['users:read', 'reports:read'],
  viewer: ['reports:read'],
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false
}
