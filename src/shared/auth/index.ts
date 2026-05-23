/**
 * Active auth adapter.
 *
 * Swap the import below to switch identity providers — one line change.
 *
 * Available adapters:
 *   - ./adapters/mock    — dev-only; returns null unless MOCK_AUTH_USER is set
 *   - ./adapters/auth0   — Auth0 OIDC (requires @auth0/nextjs-auth0)
 *   - ./adapters/ping    — PingFederate / PingOne OIDC (requires jose)
 */
import { mockAdapter } from './adapters/mock'

export const authAdapter = mockAdapter

// Re-export types so callers only need one import path
export type { AuthAdapter } from './auth-adapter'
export type { AuthUser, Session } from './types'
export { hasPermission } from './permissions'
export type { Permission } from './permissions'
export { usePermission } from './use-permission'
