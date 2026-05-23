# ADR-006: Observability Foundation — Request IDs, Structured Logging, Error Tracking

**Date:** 2026-05-22
**Status:** Proposed
**Priority:** Medium
**Deciders:** FurioLabs engineering team

---

## Context

The boilerplate has no observability infrastructure. There is no:
- Request ID generation or propagation
- Structured logging (everything goes to `console.log/warn/error` as unstructured strings)
- Error tracking integration (Sentry, Datadog, etc.)
- Correlation between server-side errors and client-side renders

For a single-team app this is acceptable. For enterprise frontends deployed across multiple
teams and products, it means:
- Production bugs are diagnosed by reading raw server logs with no way to trace a request
  end-to-end.
- Client-side errors (hydration failures, unhandled promise rejections) are invisible unless
  the user reports them.
- Incidents take longer to resolve because there's no shared debugging language across teams.

The boilerplate should establish the hook points — the plumbing — so every team inherits
observability automatically. The actual sink (Sentry DSN, Datadog API key) is team-specific
configuration.

---

## Decision

Add three observability layers that are additive (no behaviour change when unconfigured) and
act as standard extension points for teams.

### 1. Request ID middleware (extends ADR-001 middleware)

Generate a `X-Request-Id` header on every incoming request. Propagate it to all outgoing
fetch calls and Next.js server logs.

```ts
// middleware.ts addition
import { nanoid } from 'nanoid' // or crypto.randomUUID() — no extra dep

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  const response = NextResponse.next()
  response.headers.set('x-request-id', requestId)
  // Pass to server components via a header that Next.js makes available
  response.headers.set('x-request-id', requestId)
  return response
}
```

### 2. Structured logger in `shared/observability/logger.ts`

A thin wrapper over `console` that:
- Emits structured JSON in production
- Emits readable text in development
- Always includes `requestId`, `service`, and `level` fields
- Is a no-op for fields the caller doesn't provide

```ts
// src/shared/observability/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  requestId?: string
  userId?: string
  [key: string]: unknown
}

function log(level: LogLevel, message: string, context: LogContext = {}) {
  if (process.env.NODE_ENV === 'development') {
    console[level](`[${level.toUpperCase()}] ${message}`, context)
    return
  }
  // Production: structured JSON for log aggregators
  console[level](JSON.stringify({ level, message, ...context, timestamp: new Date().toISOString() }))
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log('debug', msg, ctx),
  info:  (msg: string, ctx?: LogContext) => log('info',  msg, ctx),
  warn:  (msg: string, ctx?: LogContext) => log('warn',  msg, ctx),
  error: (msg: string, ctx?: LogContext) => log('error', msg, ctx),
}
```

Usage in `entities/*/api/`:

```ts
import { logger } from '@/shared/observability/logger'

export async function getUsers() {
  try {
    const res = await fetch(...)
    logger.info('users.fetch.success', { count: data.length })
    return UsersResponseSchema.parse(await res.json())
  } catch (err) {
    logger.error('users.fetch.failed', { error: String(err) })
    throw err
  }
}
```

### 3. Error tracking integration point in `shared/observability/error-tracker.ts`

A thin adapter that teams replace with their provider SDK (Sentry, Datadog, Bugsnag).
Ships as a no-op by default so nothing breaks without configuration.

```ts
// src/shared/observability/error-tracker.ts
interface ErrorContext {
  requestId?: string
  userId?: string
  [key: string]: unknown
}

// No-op by default. Replace with Sentry.captureException etc.
export const errorTracker = {
  captureException: (error: unknown, context: ErrorContext = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[error-tracker] Unhandled exception:', error, context)
    }
    // TODO: integrate provider SDK here
    // Sentry.captureException(error, { extra: context })
  },

  captureMessage: (message: string, context: ErrorContext = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[error-tracker] Message:', message, context)
    }
    // Sentry.captureMessage(message, { extra: context })
  },
}
```

Wire into `app/error.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { errorTracker } from '@/shared/observability/error-tracker'

export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    errorTracker.captureException(error)
  }, [error])
  return <div>Something went wrong.</div>
}
```

### 4. Export from `shared/observability/index.ts`

```ts
export { logger } from './logger'
export { errorTracker } from './error-tracker'
```

---

## Consequences

**Positive:**
- Every data fetching function and Server Action has a clear place to add structured log calls.
- Production errors surface in log aggregators instead of disappearing.
- The error tracker adapter means changing providers (Sentry → Datadog) is one-file change.
- Request IDs enable end-to-end request tracing from the browser network tab to server logs.

**Negative / trade-offs:**
- The structured logger adds boilerplate to fetch functions. Teams will skip it under pressure.
  Mitigate by including logger calls in entity API templates and the plop generator.
- Without actually configuring an error tracking provider, the `error-tracker` is a no-op.
  Teams must take the additional step of wiring the provider — which requires documentation
  and an onboarding checklist entry.
- JSON logging in production changes the format of `next dev` output if not gated on
  `NODE_ENV`. The `NODE_ENV === 'development'` guard in the logger prevents this.

---

## Implementation notes

- `nanoid` is a zero-dependency option for request ID generation, but `crypto.randomUUID()`
  is available in Node 18+ and Cloudflare Workers with no additional package. Prefer the
  built-in.
- The `requestId` should be passed via React Context (server-side) or headers to Client
  Components for client-side error correlation. This is a follow-up task after the foundation
  is in place.
- Sentry integration (when chosen) should use `@sentry/nextjs` and its `withSentryConfig`
  wrapper in `next.config.ts`. Document this in `docs/wiki/09-extending.md`.

---

## Acceptance criteria

- [ ] `src/shared/observability/logger.ts` implemented with dev/prod output switching
- [ ] `src/shared/observability/error-tracker.ts` implemented as a no-op adapter
- [ ] `src/shared/observability/index.ts` barrel export
- [ ] `app/error.tsx` calls `errorTracker.captureException()`
- [ ] `middleware.ts` generates and propagates `X-Request-Id`
- [ ] At least one entity API function (`get-users.ts`) demonstrates `logger.info` and `logger.error` usage
- [ ] `docs/wiki/09-extending.md` documents how to swap in Sentry or another provider
- [ ] `pnpm test` passes
- [ ] Architecture Guard CI passes (observability imports follow FSD layer rules: shared only)
