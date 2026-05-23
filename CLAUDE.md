# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`furio-kit` is a React boilerplate by FurioLabs targeting corporate/enterprise frontends. It uses Next.js App Router with React Server Components as the primary rendering paradigm.

UI primitives (Atoms, Molecules) are **not owned by this codebase**. Each organization provides its own design system as an external package (`@org/ui-kit`). This application consumes that package through a thin adapter layer in `src/shared/ui/`.

## Technology Stack

- **Next.js 16+** — App Router, Turbopack dev server, Server Actions
- **React 19+** — React Compiler, Server Components by default
- **TypeScript** — strict mode
- **pnpm** — package manager
- **Biome 2+** — linting and formatting (replaces ESLint + Prettier)
- **Tailwind CSS v4** — utility-first styling; no config file, content scanning is automatic
- **`@tailwindcss/postcss`** — required PostCSS plugin for Tailwind v4
- **`clsx` + `tailwind-merge`** — combined via `cn()` in `shared/utils` for safe class merging
- **Zod** — runtime schema validation at system boundaries
- **TanStack Query** — client-side cache management and optimistic updates
- **Zustand** — client UI state (SSR-safe initialization required)
- **Vitest** — unit and integration tests
- **`@org/ui-kit`** — external design system package; provides Atoms and Molecules following Atomic Design

## Commands

```bash
pnpm dev          # dev server (Turbopack)
pnpm build        # production build
pnpm start        # production server
pnpm lint         # Biome lint
pnpm format       # Biome format
pnpm test         # Vitest run
pnpm test:watch   # Vitest watch mode
pnpm audit        # check for vulnerabilities
```

## Tailwind v4 Setup

Tailwind v4 differs from v3 in three ways relevant to this codebase:

- **No `tailwind.config.ts`** — content scanning is automatic; delete this file if it reappears
- **CSS import**: `app/globals.css` uses `@import "tailwindcss"` (not the v3 `@tailwind` directives)
- **PostCSS plugin**: `postcss.config.mjs` uses `'@tailwindcss/postcss'` (not `tailwindcss`)

## Design System: `@org/ui-kit`

Each organization deploying `furio-kit` supplies their own `@org/ui-kit` package. The package follows Atomic Design and exposes:

| Level | Examples | Notes |
|---|---|---|
| **Atoms** | `Button`, `Input`, `Badge`, `Icon`, `Label` | Stateless, fully styled primitives |
| **Molecules** | `FormField`, `Card`, `Modal`, `Tooltip` | Composed from Atoms |
| **Tokens** | CSS variables or a `tokens` export | Colors, spacing, typography |

`furio-kit` **never re-implements** components that exist in `@org/ui-kit`. It only wraps them.

### Adapter pattern (mandatory)

`@org/ui-kit` must never be imported directly from `features`, `entities`, `widgets`, or `views`. All consumption goes through adapter components in `shared/ui`.

```bash
shared/ui/
  Button/
    Button.tsx      ← "use client"; wraps @org/ui-kit Button
    index.ts
  Card/
    Card.tsx        ← Server Component; wraps @org/ui-kit Card
    index.ts
  index.ts          ← barrel: re-exports all adapters
```

Example adapter:

```tsx
// shared/ui/Button/Button.tsx
'use client'
import { Button as OrgButton } from '@org/ui-kit'
import type { ReactNode } from 'react'

export interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

export function Button({ children, variant = 'primary', ...rest }: ButtonProps) {
  return <OrgButton variant={variant} {...rest}>{children}</OrgButton>
}
```

Internal layers import from `shared/ui`, never from `@org/ui-kit` directly:

```ts
import { Button } from '@/shared/ui'   // correct
import { Button } from '@org/ui-kit'   // forbidden
```

### RSC compatibility of adapters

Assume `@org/ui-kit` components are Client Components unless the package explicitly states otherwise. Mark adapters `"use client"` when wrapping interactive primitives. Purely presentational adapters can remain Server Components.

## Rendering Architecture

### React Server Components (default)

All components are Server Components unless explicitly marked `"use client"`. Server Components:

- Fetch data directly (no `useEffect`, no TanStack Query)
- Access backend services, databases, and environment secrets
- Cannot use hooks, event handlers, or browser APIs
- Are never hydrated on the client — they produce static HTML

### Client Components (`"use client"`)

Mark a component `"use client"` only when it needs:

- React hooks (`useState`, `useEffect`, `useRef`, etc.)
- Browser APIs or event handlers
- Zustand stores or TanStack Query hooks

`"use client"` is a boundary, not a per-component flag — it propagates to all children. Push this boundary as deep as possible.

### Data Fetching

| Scenario | Approach |
|---|---|
| Initial page data | `async` Server Component — `await fetch()`/DB call directly |
| Mutations | Server Actions (`"use server"`) |
| Client-side cache / optimistic UI | TanStack Query (within Client Components) |
| SSR + client handoff | TanStack Query `HydrationBoundary` + `dehydrate()` in Server Components |

Never fetch data inside Client Components for the initial render. Pass data down as props from Server Components.

### Server Actions

Define Server Actions in `actions/` files with `"use server"`. They handle mutations server-side and can be called directly from Client Components.

## App Router File Conventions

```
app/
  layout.tsx              ← root layout: pure HTML shell (no providers)
  (app)/
    layout.tsx            ← authenticated shell: StoreProvider · QueryProvider · Header
    page.tsx              ← delegates to src/views/home
    loading.tsx           ← Suspense fallback UI
    error.tsx             ← error boundary (must be "use client")
  (auth)/
    login/
      page.tsx            ← delegates to src/views/login
  403/
    page.tsx              ← forbidden page
  not-found.tsx           ← 404 UI
  api/[...route]/
    route.ts              ← API Route Handler (when REST endpoints are needed)
```

## Architecture: FSD Layers

Follows **Feature-Sliced Design (FSD)**. Atomic Design lives inside `@org/ui-kit`; this codebase builds from Organisms upward.

> **Note:** The FSD `pages` layer is renamed to `views` here to avoid a naming conflict with Next.js, which reserves the `pages/` directory name for its Pages Router.

### Layer hierarchy (imports flow downward only)

```
app        ← Next.js app/ directory: layouts, global providers, routing
views      ← full route screens composed from widgets + features (≡ FSD "pages")
widgets    ← self-contained UI blocks (Header, Sidebar, DashboardCard)
features   ← single user interactions (LoginForm, AddToCartButton)
entities   ← business domain models + their UI, API calls, and types
shared     ← ui adapters, providers, model, utils, types, constants
```

A layer may only import from layers below it. Cross-slice imports at the same layer are forbidden.

### What each layer owns

| Layer | Builds | Consumes |
|---|---|---|
| `shared/ui` | Adapters wrapping `@org/ui-kit` Atoms/Molecules | `@org/ui-kit` only |
| `shared/providers` | `QueryProvider`, `StoreProvider` | `shared/model` |
| `shared/model` | Zustand store factories | — |
| `shared/utils` | `cn()`, `formatDate()`, etc. | — |
| `entities/*/api` | Data fetching functions with Zod validation | `entities/*/model` |
| `entities/*/ui` | Domain Organisms (UserCard, UserList) | `shared/ui` adapters |
| `features/*/ui` | Interaction Organisms (LoginForm) | `shared/ui`, `entities` |
| `widgets/*/ui` | Page sections (Header, Sidebar) | `features`, `entities`, `shared` |
| `views/` | Full screens with `<Suspense>` boundaries | `widgets`, `features` |

### RSC boundaries within FSD

- `shared/ui` adapters — `"use client"` only for interactive primitives
- `entities/*/ui` — Server Components by default; async SCs own their own fetch for Suspense streaming
- `features/*/ui` — typically Client Components
- `widgets/*/ui` — Server Components passing data as props
- `views/` and `app/` — Server Components orchestrating layout and `<Suspense>` boundaries

### Public API (index.ts) rule

Every slice must have an `index.ts` that explicitly re-exports its public surface. Do not import internal files directly from outside a slice.

```
entities/user/
  api/get-users.ts
  model/types.ts
  ui/UserCard.tsx
  ui/UserList.tsx
  index.ts          ← export only what external layers need
```

Barrel exports are required at the slice boundary. Avoid deep barrel chains within a slice.

## Providers

Both providers live in `src/shared/providers/` and are mounted in `app/(app)/layout.tsx` (the authenticated route group shell, not the root layout).

- **`QueryProvider`** — wraps `QueryClientProvider`; uses `useRef` to create one `QueryClient` per tree
- **`StoreProvider`** — wraps the Zustand store context; uses `useRef` to prevent shared state across SSR requests

### Zustand SSR pattern

Always use a factory function to create stores:

```ts
// shared/model/ui-store.ts
export const createUIStore = () => createStore<UIState>()(...)
export type UIStore = ReturnType<typeof createUIStore>
```

Access state via `useUIStore` from `shared/providers`:

```ts
import { useUIStore } from '@/shared/providers'
const sidebarOpen = useUIStore((s) => s.sidebarOpen)
```

## `cn()` Utility

Use `cn()` from `@/shared/utils` for all className composition. It combines `clsx` and `tailwind-merge` to handle conditional classes and Tailwind conflicts correctly:

```ts
import { cn } from '@/shared/utils'
<div className={cn('base-class', isActive && 'active-class', className)} />
```

Never use template literals for className composition.

## State Management

| Concern | Tool | Notes |
|---|---|---|
| Initial page data | `async` Server Component | Direct fetch/DB, no client lib |
| Remote data (client) | TanStack Query | Use `HydrationBoundary` for SSR handoff |
| Mutations | Server Actions | Use TanStack Query mutation for optimistic UI |
| Global UI state | Zustand — `shared/model/ui-store.ts` | Cross-cutting state (sidebar, theme, session user) |
| Feature UI state | Zustand — `features/{name}/model/{name}-store.ts` | State owned by a single feature slice |
| Form state | React Hook Form or native `<form>` with Server Actions | |

Do not store server-fetched data in Zustand. Zustand is for UI state only.

### Global vs. per-slice Zustand store

**Use `shared/model/ui-store.ts`** for state that 2+ features need: sidebar open/closed, active locale, notification queue, session user fields.

**Create a slice store** (`features/{name}/model/{name}-store.ts`) for state owned by one feature. The slice mounts its own `<FeatureProvider>` wrapping only the subtree that needs it. Pattern:

```ts
// features/cart/model/cart-store.ts
import { createStore } from 'zustand'

export type CartStore = ReturnType<typeof createCartStore>

export const createCartStore = () =>
  createStore<{ isOpen: boolean; open: () => void; close: () => void }>()(
    (set) => ({ isOpen: false, open: () => set({ isOpen: true }), close: () => set({ isOpen: false }) }),
  )
```

The slice provider follows the same `useRef` SSR-safe pattern as `StoreProvider` in `shared/providers`.

## Code Conventions

- Components: `PascalCase`, functional only
- Hooks: `camelCase`, prefix `use`
- Server Actions: `camelCase`, suffix `Action` (e.g. `loginAction`)
- Files: `kebab-case` for non-component files, `PascalCase.tsx` for components
- Named exports everywhere except Next.js page/layout files (which require default exports)

## Security

- `dangerouslySetInnerHTML` requires DOMPurify sanitization — no exceptions
- Auth tokens (JWTs) stored in `HttpOnly; Secure; SameSite=Strict` cookies set server-side; never `localStorage`
- Environment secrets accessed only in Server Components or Server Actions — never exposed to the client bundle
- Client-safe env vars must be prefixed `NEXT_PUBLIC_`
- Validate all external input at system boundaries with Zod (API routes, Server Actions, form data)
- All data fetching functions in `entities/*/api/` must parse responses through a Zod schema before returning

## Testing

Tests are co-located with the code they test (`*.test.ts` / `*.test.tsx`). Use Vitest with React Testing Library.

- Do not test `@org/ui-kit` components — they are tested by the design system package
- Test adapters only for prop mapping and that the correct underlying component renders
- Server Components: test data logic in isolation; test rendered output via child Client Component tests
- For new features: write the test before implementing
- For bug fixes: write a failing test reproducing the bug first

## Known Gotchas

### `mounted` guard for DOM-dependent libraries

Libraries that read DOM dimensions at render time (`recharts` `ResponsiveContainer`, any chart or layout measurement library) cause hydration attribute mismatches in Next.js App Router — even inside `"use client"` components — because SSR still renders them server-side.

Use a `mounted` guard to defer rendering until after the first client paint:

```tsx
const [mounted, setMounted] = useState(false)
useEffect(() => { setMounted(true) }, [])

{mounted && <ResponsiveContainer>...</ResponsiveContainer>}
```

**Applies to:** any library using `ResizeObserver`, `window`, `document`, or DOM measurements at render time.

---

## Automation & Maintenance

### GitHub Actions (required - runs on every PR)

| Workflow | Purpose |
|---|---|
| `ci.yml` | Typecheck, lint, test, production build |
| `audit.yml` | Weekly vulnerability scan (`pnpm audit --audit-level=high`) |
| `codeql.yml` | CodeQL security analysis |
| `architecture-guard.yml` | FSD layer imports, adapter pattern, barrel exports, deep imports, UI kit connection (opt-in) |
| `dependabot-auto.yml` | Auto-merge patch/minor Dependabot PRs; labels major bumps `needs-review` |
| `stale.yml` | Auto-close inactive PRs (14 days stale + 7 days to close) |

### Claude Code Hooks (optional - active when Claude Code is installed)

Configured in `.claude/settings.json`. These fire during Claude Code sessions:

| Hook | Event | Purpose |
|---|---|---|
| `check-staged.sh` | Pre-commit (`git commit`) | Lint staged files, block debug/credential commits |
| `check-architecture.sh` | Pre-push (`git push`) | Local FSD + adapter checks before CI |
| `security-reminder.sh` | File edit (`Edit`/`Write`) | Context-aware reminders for proxy.ts, API files, .env |

### Claude Code Triggers (optional - requires Claude Max)

| Trigger | Schedule | Purpose |
|---|---|---|
| `weekly-health.md` | Every Monday 9:00 AM | Dep updates, audit diff, doc sync check |
| `dep-review.md` | On-demand | Migration impact analysis for major version bumps |
| `arch-review.md` | 1st and 15th monthly | Semantic architecture drift detection |

### Multi-AI Coordination

- `AGENTS.md` - instructions for all AI coding assistants
- `.github/copilot/instructions.md` - GitHub Copilot custom instructions
- Both derive from this `CLAUDE.md` as the source of truth

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **furio-kit** (797 symbols, 932 relationships, 6 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/furio-kit/context` | Codebase overview, check index freshness |
| `gitnexus://repo/furio-kit/clusters` | All functional areas |
| `gitnexus://repo/furio-kit/processes` | All execution flows |
| `gitnexus://repo/furio-kit/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
