# 05 — Authentication

**Quick start:** For local development, set `AUTH_PROVIDER=mock` in `.env.local`. The mock adapter is already the default and always returns a fake authenticated user, so you can develop against protected routes immediately. To go to production, set `AUTH_PROVIDER=auth0` or `AUTH_PROVIDER=ping`, swap the import in `src/shared/auth/index.ts`, add the required env vars, and deploy.

---

## 1. Auth Architecture

Authentication uses a pluggable adapter pattern. The `AuthAdapter` interface in `src/shared/auth/auth-adapter.ts` defines a contract that every provider must satisfy:

```ts
// src/shared/auth/auth-adapter.ts
export interface AuthAdapter {
  validateRequest(request: Request): Promise<AuthUser | null>
  getLoginUrl(redirectTo?: string): string
}
```

- `validateRequest` — reads the session from the incoming `Request` (via HttpOnly cookies), validates it, and returns the authenticated user or `null`.
- `getLoginUrl` — returns the provider-specific login URL, optionally with a post-login redirect target.

Three adapters ship out of the box:

| Adapter | File | Use case |
|---|---|---|
| Mock | `src/shared/auth/adapters/mock.ts` | Local development; always returns a fake user |
| Auth0 | `src/shared/auth/adapters/auth0.ts` | Auth0 tenant integration |
| PingFederate | `src/shared/auth/adapters/ping.ts` | On-prem / enterprise PingFederate |

`src/shared/auth/index.ts` exports the active adapter as the single named export `authAdapter`. All other code imports from here — never from an adapter file directly.

All session data is stored in `HttpOnly; Secure; SameSite=Strict` cookies set server-side. Tokens never touch `localStorage` or the client bundle.

---

## 2. Route Protection

Route protection is handled by `proxy.ts` at the project root (Next.js 16's edge middleware file). It protects **all routes by default** using an allowlist approach.

On every request, `proxy.ts`:

1. Checks if the path is in `PUBLIC_PATHS` (the allowlist). If so, lets the request through immediately.
2. Calls `authAdapter.validateRequest(request)` for all other paths.
3. If the user is authenticated, attaches a `x-request-id` header and allows the request to continue.
4. If the session is missing or invalid, redirects the browser to `authAdapter.getLoginUrl(pathname)` with the original path as a `returnTo` query parameter.

```ts
// proxy.ts (excerpt)
const PUBLIC_PATHS = ['/login', '/api/auth']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

The `config.matcher` excludes Next.js static assets (`_next/static`, `_next/image`, `favicon.ico`) from the middleware entirely. Everything else is checked.

**To make a new route public**, add it to `PUBLIC_PATHS`:

```ts
const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/about',       // add new public paths here
  '/pricing',
]
```

**Do not change `config.matcher`** to allow public paths — that approach creates gaps. Always use the `PUBLIC_PATHS` allowlist instead, which makes public paths explicit and auditable in one place.

---

## 3. Environment Validation and Mock Guard

### Startup env validation

`src/shared/env.ts` validates all required environment variables at server startup using Zod. The server refuses to start if any required variable is missing or invalid — the failure happens at deploy time, not at user request time.

```ts
// src/shared/env.ts
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  AUTH_PROVIDER: z.enum(['auth0', 'ping', 'mock']).default('mock'),
})

export const env = EnvSchema.parse({ ... })
```

This is triggered by `instrumentation.ts` (a Next.js startup hook):

```ts
// instrumentation.ts
export async function register() {
  await import('@/shared/env')
}
```

To add a new required env var, add it to `EnvSchema` in `src/shared/env.ts`. The server will throw a clear Zod error on startup if it is missing.

### Mock adapter production guard

`src/shared/auth/adapters/mock.ts` throws at module load time if `NODE_ENV === 'production'`:

```ts
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    '[furio-kit] mockAdapter cannot be used in production. ' +
    'Set AUTH_PROVIDER=auth0 or AUTH_PROVIDER=ping and configure the adapter.'
  )
}
```

This makes it impossible to accidentally ship an unauthenticated app. The build succeeds but the server fails to start, surfacing the issue before any user traffic hits it.

---

## 4. Switching Providers

Open `src/shared/auth/index.ts` and change the one import to select the active provider:

```ts
// Mock (development)
import { mockAdapter } from './adapters/mock'
export const authAdapter = mockAdapter

// Auth0 (production)
import { auth0Adapter } from './adapters/auth0'
export const authAdapter = auth0Adapter

// PingFederate (production)
import { pingAdapter } from './adapters/ping'
export const authAdapter = pingAdapter
```

Only one import should be active at a time. No other file needs to change.

---

## 5. Required Environment Variables

Add these to `.env.local` (development) or your deployment environment. Never prefix auth secrets with `NEXT_PUBLIC_`.

### Mock

```bash
AUTH_PROVIDER=mock
```

### Auth0

```bash
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
```

### PingFederate

```bash
PING_ISSUER=https://your-ping-host/as
PING_CLIENT_ID=your_client_id
PING_CLIENT_SECRET=your_client_secret
```

Keep `.env.example` up to date when adding new variables so other developers know what is required.

---

## 6. Adding a New Provider

Follow these five steps to integrate a provider that is not already included.

**Step 1.** Create the adapter file:

```
src/shared/auth/adapters/your-provider.ts
```

**Step 2.** Implement the `AuthAdapter` interface:

```ts
// src/shared/auth/adapters/your-provider.ts
import type { AuthAdapter } from '../auth-adapter'

export const yourProviderAdapter: AuthAdapter = {
  async validateRequest(request) {
    // Read session cookie from request.headers
    // Verify token with your provider's SDK or JWKS endpoint
    // Return AuthUser on success, null on failure
  },

  getLoginUrl(redirectTo) {
    const params = new URLSearchParams({
      redirect_uri: redirectTo ?? process.env.YOUR_PROVIDER_REDIRECT_URI!,
      // ...provider-specific params
    })
    return `${process.env.YOUR_PROVIDER_ISSUER}/authorize?${params}`
  },
}
```

**Step 3.** Export the adapter using the naming convention `yourProviderAdapter` (camelCase, `Adapter` suffix).

**Step 4.** Switch the import in `src/shared/auth/index.ts`:

```ts
import { yourProviderAdapter } from './adapters/your-provider'
export const authAdapter = yourProviderAdapter
```

**Step 5.** Add all required env vars to `.env.example` with inline comments explaining each one:

```bash
# Your Provider — OAuth 2.0 / OIDC
YOUR_PROVIDER_ISSUER=          # e.g. https://idp.example.com/as
YOUR_PROVIDER_CLIENT_ID=
YOUR_PROVIDER_CLIENT_SECRET=
YOUR_PROVIDER_REDIRECT_URI=    # must match the registered callback URL
```

---

## 7. Role-Based Access Control (RBAC)

RBAC is implemented in `src/shared/auth/permissions.ts`. It defines a `Permission` type, a `ROLE_PERMISSIONS` map, and a `hasPermission()` function.

### Permissions and roles

```ts
// src/shared/auth/permissions.ts
export type Permission =
  | 'users:read'
  | 'users:write'
  | 'settings:read'
  | 'settings:write'
  | 'reports:read'

const ROLE_PERMISSIONS: Record<AuthUser['role'], Permission[]> = {
  admin:  ['users:read', 'users:write', 'settings:read', 'settings:write', 'reports:read'],
  member: ['users:read', 'reports:read'],
  viewer: ['reports:read'],
}
```

Add new permissions to the `Permission` type, then assign them to the appropriate roles in `ROLE_PERMISSIONS`.

### Server-side (Server Components, Server Actions)

Use `hasPermission()` directly with the authenticated user from `proxy.ts` or a Server Component:

```ts
import { hasPermission } from '@/shared/auth'

// In a Server Component or Server Action:
const user = await authAdapter.validateRequest(request)
if (!user || !hasPermission(user, 'settings:write')) {
  redirect('/403')
}
```

### Client-side (Client Components)

Use the `usePermission()` hook, which reads the session user from the Zustand store:

```tsx
'use client'
import { usePermission } from '@/shared/auth'

export function AdminPanel() {
  const canWrite = usePermission('settings:write')
  if (!canWrite) return null
  return <div>Admin settings…</div>
}
```

### 403 page

A `app/403/page.tsx` renders the access-denied state. Redirect to it from Server Components or Server Actions when a permission check fails.

---

## 8. Testing Auth Locally

Use the mock adapter for all local development. It skips any real token exchange and returns a hardcoded user object, so you can develop and test protected routes without a live identity provider.

```bash
# .env.local
AUTH_PROVIDER=mock
```

Confirm `src/shared/auth/index.ts` is importing `mockAdapter` before starting the dev server. If you need to test the unauthenticated flow (e.g. the login redirect), temporarily remove `AUTH_PROVIDER` from `.env.local`.

For integration tests that exercise auth logic, stub `authAdapter.validateRequest` at the module boundary rather than calling a real provider.

---

## 9. Security Rules

These rules are non-negotiable. They reflect the security posture defined in [CLAUDE.md](../../CLAUDE.md) and must be maintained when adding or modifying auth code.

| Rule | Rationale |
|---|---|
| Auth tokens stored in `HttpOnly; Secure; SameSite=Strict` cookies only | Prevents XSS token theft; `HttpOnly` blocks JavaScript access |
| Never use `localStorage` or `sessionStorage` for tokens | Both are accessible to JavaScript and vulnerable to XSS |
| Never prefix auth secrets with `NEXT_PUBLIC_` | `NEXT_PUBLIC_` variables are bundled into the client JavaScript |
| Session validation only in Server Components or `proxy.ts` | Client Components cannot be trusted to enforce access control |
| All `validateRequest` implementations must use Zod to parse session payloads | Ensures token claims are the expected shape before use |
| Rendering user-supplied content as raw HTML requires DOMPurify sanitization first | Prevents stored XSS if auth error messages or user names are rendered |

If a security rule and a development convenience conflict, the security rule wins.
