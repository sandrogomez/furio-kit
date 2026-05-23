# ADR-001: Security Baseline — Middleware, Security Headers, Env Validation, Mock Auth Guard

**Date:** 2026-05-22
**Status:** Proposed
**Priority:** Critical
**Deciders:** FurioLabs engineering team

---

## Context

The boilerplate documents a correct security model (HttpOnly cookies, server-side secrets,
Zod validation at boundaries) but does not enforce it structurally. Three gaps make it possible
to ship a production app from this boilerplate with no route protection and no security headers:

1. **No `middleware.ts`** — every route is publicly accessible by default. The `AuthAdapter`
   interface exists and session types are Zod-validated, but nothing calls them on incoming
   requests. Teams that don't add middleware manually ship open endpoints.

2. **No HTTP security headers** — `next.config.ts` contains only `reactCompiler: true`.
   Headers like `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`,
   and `X-Content-Type-Options` are baseline enterprise compliance requirements
   (SOC 2, OWASP, PCI-DSS adjacent). They are not present.

3. **No environment variable validation** — required env vars (e.g. `NEXT_PUBLIC_API_URL`,
   `AUTH_PROVIDER`) default to empty strings via `?? ''`. The app builds and starts with
   missing configuration, failing silently at runtime with user-visible errors.

4. **Mock adapter is the default with no production guard** — `shared/auth/index.ts` exports
   `mockAdapter`. The warning in `mock.ts` is a comment, not an enforcement mechanism.
   A team that ships without changing this exports an unauthenticated app.

---

## Decision

Ship a secure-by-default baseline. The boilerplate must make the wrong thing hard, not just
document the right thing.

### 1. Add `proxy.ts` at the project root (Next.js 16 convention)

> **Note:** Next.js 16 renamed the edge middleware file from `middleware.ts` to `proxy.ts` and the exported function from `middleware` to `proxy`. All references to "middleware" in this ADR mean `proxy.ts`.



Protect all routes by default. Allow-list only public paths (`/login`, `/_next`, `/api/auth`).
Redirect unauthenticated requests to `/login` with a `returnTo` param.

```ts
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authAdapter } from '@/shared/auth'

const PUBLIC_PATHS = ['/login', '/api/auth']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export async function middleware(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname)) return NextResponse.next()

  const session = await authAdapter.validateRequest(request)
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('returnTo', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### 2. Add security headers to `next.config.ts`

```ts
const securityHeaders = [
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // tighten with nonces when CSP nonce pattern is added
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}
```

### 3. Add startup env validation via `src/shared/env.ts`

Parse all required environment variables through a Zod schema at module load time.
Import in `instrumentation.ts` (Next.js 15+ hook that runs once at server startup).

```ts
// src/shared/env.ts
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  AUTH_PROVIDER: z.enum(['auth0', 'ping', 'mock']),
  // Add app-specific required vars here:
  // NEXT_PUBLIC_API_URL: z.string().url(),
})

export const env = EnvSchema.parse(process.env)
```

```ts
// instrumentation.ts (Next.js project root)
export async function register() {
  // Throws at startup — not at user request time — if env is misconfigured.
  await import('@/shared/env')
}
```

### 4. Guard `mockAdapter` at runtime

```ts
// src/shared/auth/adapters/mock.ts  (addition)
if (process.env.NODE_ENV === 'production' && process.env.AUTH_PROVIDER === 'mock') {
  throw new Error(
    '[furio-kit] mockAdapter cannot be used in production. ' +
    'Set AUTH_PROVIDER=auth0 or AUTH_PROVIDER=ping and configure the adapter.'
  )
}
```

---

## Consequences

**Positive:**
- Every app scaffolded from the boilerplate is protected by default.
- Security header compliance is inherited automatically.
- Misconfiguration fails at deploy time, not at user-facing runtime.
- The mock adapter cannot silently reach production.

**Negative / trade-offs:**
- Middleware adds ~1–5ms latency per request for the auth check (acceptable for enterprise).
- Teams with fully public apps (marketing sites) must explicitly opt routes out of the
  matcher — this is intentional friction in the right direction.
- The CSP policy starts permissive (`unsafe-inline`) to avoid breaking teams before they
  have a nonce strategy. ADR-001 should be revisited once a CSP nonce pattern is established.

---

## Acceptance criteria

- [ ] `middleware.ts` exists at the project root and redirects unauthenticated requests to `/login`
- [ ] `next.config.ts` returns security headers for all routes via `headers()`
- [ ] `src/shared/env.ts` validates required env vars with Zod
- [ ] `instrumentation.ts` imports `src/shared/env.ts` to trigger startup validation
- [ ] `mockAdapter` throws in production when `AUTH_PROVIDER === 'mock'`
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes
- [ ] Architecture Guard CI passes
