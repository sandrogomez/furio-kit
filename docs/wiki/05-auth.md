# 05 — Authentication

**Quick start:** For local development, set `MOCK_AUTH_USER=1` in `.env.local` and verify `src/shared/auth/index.ts` imports `mockAdapter`. To go to production, swap the import to `auth0Adapter` or `pingAdapter`, add the required env vars, and deploy.

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

Route protection is handled by `proxy.ts`, which acts as a Next.js middleware replacement. On every request that matches a protected path, `proxy.ts`:

1. Calls `authAdapter.validateRequest(request)`.
2. If the user is authenticated, allows the request to continue.
3. If the session is missing or invalid, redirects the browser to `authAdapter.getLoginUrl(request.url)`.

The `config.matcher` array in `proxy.ts` declares which paths are protected:

```ts
// proxy.ts (excerpt)
export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*'],
}
```

**To protect a new route**, add its path pattern to `config.matcher`:

```ts
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/settings/:path*',
    '/reports/:path*',   // add new protected paths here
  ],
}
```

Next.js middleware path syntax applies: `:path*` matches zero or more segments, `:path+` matches one or more.

---

## 3. Switching Providers

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

## 4. Required Environment Variables

Add these to `.env.local` (development) or your deployment environment. Never prefix auth secrets with `NEXT_PUBLIC_`.

### Mock

```bash
MOCK_AUTH_USER=1
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

## 5. Adding a New Provider

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

## 6. Testing Auth Locally

Use the mock adapter for all local development. It skips any real token exchange and returns a hardcoded user object, so you can develop and test protected routes without a live identity provider.

```bash
# .env.local
MOCK_AUTH_USER=1
```

Confirm `src/shared/auth/index.ts` is importing `mockAdapter` before starting the dev server. If you need to test the unauthenticated flow (e.g. the login redirect), unset or remove `MOCK_AUTH_USER`.

For integration tests that exercise auth logic, stub `authAdapter.validateRequest` at the module boundary rather than calling a real provider.

---

## 7. Security Rules

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
