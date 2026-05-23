# ADR-008: Internationalisation Foundation

**Date:** 2026-05-22
**Status:** Proposed
**Priority:** Low
**Deciders:** FurioLabs engineering team

---

## Context

The boilerplate has a hardcoded `en-US` locale in `shared/utils/index.ts`:

```ts
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { ... })
}
```

`app/layout.tsx` also hardcodes `<html lang="en">`.

For FurioLabs serving enterprise clients across Latin American and other markets,
internationalisation is not a future concern — it is a baseline requirement. Adding it
post-hoc requires touching every component that renders a user-visible string, every
date/number format call, and every route structure. The cost of retrofitting is high.

The boilerplate should establish the structural foundations so teams inherit i18n by default
and can add languages incrementally without architectural changes.

---

## Decision

Add `next-intl` as the i18n layer. It integrates natively with Next.js App Router and
Server Components, has first-class TypeScript support, and does not require client-side
bundle overhead for static string translations.

### Chosen approach: `next-intl` with locale prefixed routing

Routes become `/en/dashboard`, `/es/dashboard`, etc. The locale is resolved in middleware
and made available to Server and Client Components without prop drilling.

```
app/
  [locale]/             ← dynamic segment wrapping all routes
    layout.tsx          ← provides NextIntlClientProvider
    page.tsx
    (app)/
      dashboard/page.tsx
  globals.css
  layout.tsx            ← root: HTML shell only, lang attr set dynamically
```

### 1. Add `next-intl` and configure supported locales

```bash
pnpm add next-intl
```

```ts
// src/shared/i18n/config.ts
export const locales = ['en', 'es', 'pt'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'
```

### 2. Locale negotiation in middleware (extends ADR-001 middleware)

```ts
// middleware.ts addition
import { createI18nMiddleware } from 'next-intl/middleware'
import { locales, defaultLocale } from '@/shared/i18n/config'

const i18nMiddleware = createI18nMiddleware({ locales, defaultLocale })

export async function middleware(request: NextRequest) {
  // i18n first — sets locale cookie and redirects if needed
  const i18nResponse = i18nMiddleware(request)
  if (i18nResponse) return i18nResponse

  // Then auth (ADR-001)
  // ...
}
```

### 3. Translation files in `src/shared/i18n/messages/`

```
src/shared/i18n/
  config.ts
  messages/
    en.json
    es.json
    pt.json
  index.ts              ← re-exports config and message loader
```

```json
// src/shared/i18n/messages/en.json
{
  "common": {
    "signIn": "Sign in",
    "signOut": "Sign out",
    "loading": "Loading..."
  },
  "home": {
    "title": "Welcome",
    "subtitle": "Your application's home page."
  }
}
```

### 4. Locale-aware `formatDate` in `shared/utils/index.ts`

Replace the hardcoded `en-US` with the active locale:

```ts
export function formatDate(date: Date, locale = 'en'): string {
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
```

### 5. Dynamic `lang` attribute in root layout

```tsx
// app/[locale]/layout.tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: { locale: string }
}) {
  const messages = await getMessages()
  return (
    <html lang={params.locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

---

## Consequences

**Positive:**
- Locale is resolved at the edge (middleware) — no client-side locale detection, no hydration
  mismatch from locale changes.
- Server Components access translations via `useTranslations()` without client overhead.
- Adding a new language is adding a JSON file — no component changes required.
- `lang` attribute on `<html>` is correct for screen readers and SEO.

**Negative / trade-offs:**
- All routes gain a `[locale]` prefix segment in the file tree. This is a structural change
  that requires all existing route files to move into `app/[locale]/`. This is the highest-cost
  part of this ADR and is the primary reason for its `Low` priority — the structural change
  cannot be done incrementally.
- `next-intl` adds a dependency and a new concept (message namespaces) that developers must
  learn.
- Translation file maintenance: English strings added to components must be duplicated in all
  message files. Without a translation management system (Localise, Phrase, Crowdin), this
  becomes a manual burden.

---

## Implementation notes

- This ADR should be implemented **before the first feature is built** in a new project, not
  after. The `[locale]` segment migration on an existing app is disruptive.
- If the org has a standard translation management system, the `messages/` JSON files should
  be treated as generated artifacts pulled from that system, not hand-edited files.
- Currency formatting (`Intl.NumberFormat`) and relative time formatting (`Intl.RelativeTimeFormat`)
  should also be added to `shared/utils/` as locale-aware helpers when this ADR is implemented.
- The Architecture Guard workflow does not need changes — `shared/i18n/` is a valid shared
  slice and follows existing layer rules.

---

## Acceptance criteria

- [ ] `next-intl` installed and configured
- [ ] `src/shared/i18n/config.ts` defines `locales`, `Locale`, and `defaultLocale`
- [ ] `src/shared/i18n/messages/` contains at minimum `en.json` and `es.json`
- [ ] All routes live under `app/[locale]/`
- [ ] `middleware.ts` handles locale negotiation before auth
- [ ] `app/[locale]/layout.tsx` sets `lang` attribute dynamically and mounts `NextIntlClientProvider`
- [ ] `shared/utils/formatDate` accepts a `locale` parameter
- [ ] `<html lang="en">` hardcoding removed from root layout
- [ ] Existing tests pass
- [ ] `pnpm build` passes for all configured locales
