# ADR-002: RBAC Enforcement Pattern

**Date:** 2026-05-22
**Status:** Proposed
**Priority:** High
**Deciders:** FurioLabs engineering team

---

## Context

`AuthUser` already carries `role: 'admin' | 'member' | 'viewer'`, and `SessionSchema` validates
it via Zod. However, there is no standard way to check permissions anywhere in the codebase:

- No utility function for role-checking in Server Components or Server Actions.
- No middleware-level route guard for role-gated paths.
- No React hook for role-checking in Client Components.
- No pattern for UI visibility toggling based on role.

Without a standard answer, teams will build conflicting ad hoc solutions:
some will check `session.user.role === 'admin'` inline, others will create their own
utilities, and role logic will become inconsistent across frontends.

This is a standardisation problem as much as a security problem. The boilerplate should
define the pattern once so every frontend inherits it.

---

## Decision

Add a minimal RBAC utility layer in `shared/auth` that covers the three surfaces where
role checks occur: middleware, Server Components/Actions, and Client Components.

### 1. Permission map in `shared/auth/permissions.ts`

Define permissions as explicit named actions, not raw role comparisons. This decouples
the permission check from the role model — when roles change, only the map changes.

```ts
// src/shared/auth/permissions.ts
import type { AuthUser } from './types'

type Permission =
  | 'users:read'
  | 'users:write'
  | 'settings:read'
  | 'settings:write'
  | 'reports:read'
  // extend per application

const ROLE_PERMISSIONS: Record<AuthUser['role'], Permission[]> = {
  admin:  ['users:read', 'users:write', 'settings:read', 'settings:write', 'reports:read'],
  member: ['users:read', 'reports:read'],
  viewer: ['reports:read'],
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false
}
```

### 2. Server-side guard utility in `shared/auth/require-permission.ts`

For use in Server Components, Server Actions, and API route handlers.
Throws a redirect or HTTP error if the session is missing or the permission is denied.

```ts
// src/shared/auth/require-permission.ts
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { authAdapter } from './index'
import { hasPermission } from './permissions'
import type { Permission } from './permissions'
import type { Session } from './types'

/** Server Component / Server Action usage. */
export async function requireSession(): Promise<Session> {
  // In Server Components, use cookies() from next/headers instead of a NextRequest.
  // This function is a placeholder — adapt to cookies()-based session retrieval.
  redirect('/login')
}

/** Call at the top of a protected Server Action. */
export async function requirePermission(
  request: NextRequest,
  permission: Permission,
): Promise<Session> {
  const session = await authAdapter.validateRequest(request)
  if (!session) redirect('/login')
  if (!hasPermission(session.user, permission)) redirect('/403')
  return session
}
```

### 3. Client Component hook in `shared/auth/use-permission.ts`

For UI visibility — hiding buttons, disabling actions. This is UI-only; real enforcement
always happens on the server.

```ts
// src/shared/auth/use-permission.ts
'use client'
import { useUIStore } from '@/shared/providers'  // or a dedicated session context
import { hasPermission } from './permissions'
import type { Permission } from './permissions'

export function usePermission(permission: Permission): boolean {
  const user = useUIStore((s) => s.session?.user)  // requires session in store (see notes)
  if (!user) return false
  return hasPermission(user, permission)
}
```

### 4. Middleware-level route guard (extends ADR-001)

Role-gated route groups (e.g. `/admin/*`) can be protected directly in `middleware.ts`
after session validation:

```ts
if (request.nextUrl.pathname.startsWith('/admin')) {
  if (!hasPermission(session.user, 'settings:write')) {
    return NextResponse.redirect(new URL('/403', request.url))
  }
}
```

---

## Consequences

**Positive:**
- A single permission map is the source of truth across all surfaces (middleware, server, client).
- UI role-checks and server enforcement use the same `hasPermission` function — no drift.
- Adding a new role or permission is one-file change.
- Teams don't invent their own role-checking patterns.

**Negative / trade-offs:**
- The permission map must be maintained as the application's access model evolves.
  Stale permissions are a risk if no review process is defined.
- The `usePermission` hook requires session to be available in client-side state
  (Zustand store or a React context). This implies storing the session's public fields
  (user id, role) client-side — which is acceptable for non-secret data but must be
  clearly documented as a separate concern from the HttpOnly session cookie.

---

## Implementation notes

- `Permission` type should be application-specific — the boilerplate ships a generic
  starting set and documents that teams must extend it.
- Do not store the full `Session` (including `expiresAt`) in Zustand. Only store what
  the UI needs (`AuthUser` fields: id, name, role). The full session lives in the
  HttpOnly cookie and is validated server-side per request.
- A `/403` page must be added to `app/403/page.tsx` before this ADR can be closed.

---

## Acceptance criteria

- [ ] `src/shared/auth/permissions.ts` defines `Permission` type, `ROLE_PERMISSIONS` map, and `hasPermission()`
- [ ] `src/shared/auth/require-permission.ts` provides a server-side guard callable from Server Actions
- [ ] `src/shared/auth/use-permission.ts` provides a client-side hook for UI visibility
- [ ] `middleware.ts` applies role checks for path groups (at minimum `/admin/*`)
- [ ] `app/403/page.tsx` exists as the denied-access page
- [ ] `src/shared/auth/index.ts` re-exports the new utilities
- [ ] Unit tests cover `hasPermission()` for all roles and a representative set of permissions
- [ ] Architecture Guard CI passes
