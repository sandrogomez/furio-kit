# ADR-003: Provider Scoping — Move Providers Out of Root Layout

**Date:** 2026-05-22
**Status:** Proposed
**Priority:** High
**Deciders:** FurioLabs engineering team

---

## Context

`StoreProvider` (Zustand) and `QueryProvider` (TanStack Query) are both mounted in
`app/layout.tsx` — the root layout that wraps every page in the application.

This means every route, including fully server-rendered ones with zero client interaction,
ships the Zustand and TanStack Query client bundles. For an enterprise app that may have:
- A fully SSR marketing/public section
- An authenticated dashboard section with heavy client interactivity
- Admin-only sections with their own state needs

...this is unnecessary JavaScript weight on routes that don't need it, and it contradicts
the RSC-first goal of reducing browser-side dependency.

The current state couples the provider infrastructure to the root layout, making it
impossible to have provider-free routes without special-casing.

---

## Decision

Scope providers to the route groups that actually require them using Next.js
[route group layouts](https://nextjs.org/docs/app/building-your-application/routing/route-groups).

### Target directory structure

```
app/
  layout.tsx              ← Root layout: HTML shell, CSS, metadata ONLY. No providers.
  (public)/               ← Route group: no auth, no providers
    layout.tsx            ← Minimal layout (optional)
    page.tsx              ← Public home/landing
    about/page.tsx
  (auth)/                 ← Route group: login flow — no session required
    login/page.tsx
  (app)/                  ← Route group: authenticated app shell
    layout.tsx            ← Mounts StoreProvider + QueryProvider + auth guard
    dashboard/page.tsx
    settings/page.tsx
  (admin)/                ← Route group: admin-only
    layout.tsx            ← Adds role check on top of (app)/layout.tsx
    users/page.tsx
```

### Root layout becomes a pure shell

```tsx
// app/layout.tsx
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className="min-h-screen bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  )
}
```

### Authenticated app layout carries the providers

```tsx
// app/(app)/layout.tsx
'use server'
import { StoreProvider, QueryProvider } from '@/shared/providers'
import { Header } from '@/widgets/header'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <QueryProvider>
        <Header />
        <main>{children}</main>
      </QueryProvider>
    </StoreProvider>
  )
}
```

---

## Consequences

**Positive:**
- Public/marketing routes ship zero provider JavaScript. Pages are pure HTML from the server.
- Provider cost (Zustand + TanStack Query client bundle) is paid only by routes that need it.
- The client boundary is pushed further down the component tree, improving RSC ratio.
- Different route groups can use different provider configurations if needed in the future.

**Negative / trade-offs:**
- The directory structure becomes more nested. New developers need to understand route groups.
- Widgets like `Header` that appear in multiple groups may need to be lifted or duplicated.
  The `Header` widget is currently server-side — it can remain shared, but its placement
  needs thought when some layouts don't have it.
- Migrating an existing app that started with the root-layout pattern requires moving files.
  Teams should apply this from day one; retrofitting is painful.

---

## Implementation notes

- Route groups (`(groupName)`) do not affect the URL structure — `/dashboard` remains `/dashboard`.
- The existing `(auth)/login/page.tsx` is already a route group — this ADR extends that pattern
  to the full app.
- The `Header` widget should move to `app/(app)/layout.tsx`, not stay in root.
- If a page inside `(app)` needs a different header (e.g. a settings page without the nav),
  use a nested layout inside the group, not special-casing in the Header component itself.

---

## Acceptance criteria

- [ ] `app/layout.tsx` contains only the HTML shell (no providers, no Header)
- [ ] `app/(app)/layout.tsx` mounts `StoreProvider`, `QueryProvider`, and `Header`
- [ ] `app/(public)/` group exists for unauthenticated public routes
- [ ] `app/(admin)/layout.tsx` adds role guard on top of the app layout
- [ ] Public routes (e.g. `/`) do not include Zustand or TanStack Query in the JS bundle
      (verifiable via `pnpm build` bundle analysis)
- [ ] All existing routes continue to work at the same paths
- [ ] `pnpm test` passes
- [ ] Architecture Guard CI passes
