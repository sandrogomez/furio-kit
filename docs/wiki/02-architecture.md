# Architecture Guide

**TL;DR** — furio-kit is organized with Feature-Sliced Design (FSD). Imports flow in one direction: from the outermost layer (app) down to the innermost (shared). All components are React Server Components by default. Mark something `"use client"` only when it genuinely needs hooks, event handlers, or browser APIs.

---

## 1. FSD Layer Hierarchy

Feature-Sliced Design organizes code into layers. Each layer has a defined responsibility, and imports only flow **downward** — a layer may use code from layers below it, never from layers above or beside it.

```
app          Next.js routing, root layouts, global providers
  views      Full route screens; own Suspense boundaries
    widgets  Self-contained page sections (Header, Sidebar, DashboardCard)
      features  Single user interactions (LoginForm, AddToCartButton)
        entities  Business domain: models, data fetching, domain UI
          shared  Adapters, utils, providers, constants, types
```

What this means in practice:

- A **widget** can import from `features`, `entities`, and `shared` — but never from `views` or `app`.
- A **feature** can import from `entities` and `shared` — but never from `widgets` or above.
- `shared` is the foundation. It imports from nothing inside this codebase.

Within each layer, code is organized into **slices** (e.g., `entities/user`, `entities/product`, `features/login`). Slices at the same layer are isolated — they cannot import from each other.

---

## 2. Import Rules

| Layer | Can import from |
|---|---|
| `app` | `views`, `widgets`, `features`, `entities`, `shared` |
| `views` | `widgets`, `features`, `entities`, `shared` |
| `widgets` | `features`, `entities`, `shared` |
| `features` | `entities`, `shared` |
| `entities` | `shared` |
| `shared` | Nothing inside this repo (only external packages) |

**Cross-slice imports at the same layer are forbidden.** This is the most commonly broken rule. Examples:

```ts
// WRONG — entity importing from another entity
import { ProductModel } from '@/entities/product'  // inside entities/user

// WRONG — feature importing from another feature
import { useLoginState } from '@/features/login'   // inside features/cart

// CORRECT — use shared or entities for truly shared domain logic
import { formatCurrency } from '@/shared/utils'
```

If two slices at the same layer need to share something, that thing belongs in a lower layer — either `shared` (for generic utilities) or a common `entities` slice (for domain logic).

---

## 3. Barrel Exports

Every slice exposes a public API through an `index.ts` file at its root. External consumers always import from this barrel — never from internal file paths.

```ts
// CORRECT
import { UserCard, getUserById } from '@/entities/user'

// WRONG — reaching into internals
import { getUserById } from '@/entities/user/api/get-user-by-id'
import { UserCard } from '@/entities/user/ui/UserCard'
```

A typical slice structure:

```
entities/user/
  api/
    get-user-by-id.ts
    get-users.ts
  model/
    types.ts
  ui/
    UserCard.tsx
    UserList.tsx
  index.ts        <- only export what external layers need
```

The `index.ts` controls the public surface of the slice. Internal files can be refactored, moved, or renamed without breaking callers. This contract is enforced by CI — builds fail on deep imports.

---

## 4. React Server Components

Server Components are the default rendering model in this codebase. A file with no `"use client"` directive is a Server Component.

Server Components:

- Fetch data directly with `async/await` — no `useEffect`, no TanStack Query
- Have access to backend services, databases, and environment secrets
- Cannot use React hooks, event handlers, or any browser API
- Produce static HTML on the server and are **never hydrated** on the client

```ts
// entities/user/ui/UserList.tsx — Server Component (no directive needed)
export async function UserList() {
  const users = await getUsers()  // direct async call, no useEffect
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}
```

Because Server Components never reach the client, they can safely read env secrets, connect to databases, and keep large dependencies out of the JS bundle.

---

## 5. Client Components

Add `"use client"` at the top of a file when the component needs any of:

- React hooks (`useState`, `useEffect`, `useRef`, `useContext`, etc.)
- Event handlers (`onClick`, `onChange`, `onSubmit`, etc.)
- Browser APIs (`window`, `document`, `localStorage`, etc.)
- Zustand store access
- TanStack Query hooks

`"use client"` is a **boundary directive**, not a per-component flag. Every component in the same file and every child imported by that file becomes part of the client bundle. This is why the boundary should be pushed as deep into the tree as possible.

```ts
// BAD — marking a layout wrapper "use client" drags everything into the bundle
'use client'
export function DashboardLayout({ children }) { ... }

// GOOD — only the interactive leaf needs the boundary
// DashboardLayout stays a Server Component; the button opts in separately
'use client'
export function FavoriteButton({ itemId }) {
  const [saved, setSaved] = useState(false)
  ...
}
```

A Server Component can render a Client Component as a child. A Client Component cannot render a Server Component — once you cross the boundary, everything below is client-side.

---

## 6. Data Flow

Data moves through the application in one direction: from server to client.

**Initial page data**

An async Server Component fetches data and passes it as props to its children. Client Components receive that data as props — they do not re-fetch it.

```
async Server Component
  └── fetches data (await db.query / await fetch)
       └── passes as props
            └── Client Component (receives props, no initial fetch)
```

**Client-side caching**

If a Client Component needs to refetch, paginate, or keep a local cache, use TanStack Query. For SSR handoff (initial data available server-side, cache populated client-side), use `HydrationBoundary` with `dehydrate()` in the Server Component.

**Mutations**

Write Server Actions in files marked `"use server"`. Call them directly from Client Components or `<form action={...}>`. For optimistic UI, wrap mutations with a TanStack Query mutation hook.

```ts
// entities/user/actions/update-user-action.ts
'use server'
export async function updateUserAction(data: FormData) {
  const parsed = UpdateUserSchema.parse(Object.fromEntries(data))
  await db.user.update({ where: { id: parsed.id }, data: parsed })
  revalidatePath('/users')
}
```

**What not to do**

- Do not fetch data inside Client Components for the initial render — pass it as props from a Server Component instead.
- Do not store server-fetched data in Zustand — Zustand is for UI state only (sidebar open/closed, active tab, modal visibility).

---

## 7. File Conventions

| Thing | Convention | Example |
|---|---|---|
| React components | `PascalCase.tsx` | `UserCard.tsx` |
| Non-component files | `kebab-case.ts` | `get-users.ts`, `format-date.ts` |
| Server Actions | `camelCase` with `Action` suffix | `loginAction`, `updateUserAction` |
| Hooks | `camelCase` with `use` prefix | `useUserStore`, `useDebounce` |
| Exports | Named exports everywhere | `export function UserCard` |
| Next.js page/layout files | Default export (required by Next.js) | `export default function Page` |

Avoid default exports except where Next.js requires them. Named exports make refactoring and tree-shaking more reliable.

---

## 8. RSC Boundaries Within FSD

Each FSD layer has a typical rendering posture. These are defaults, not rigid rules — a specific component in a layer can differ if its requirements demand it.

| Layer | Default rendering | Rationale |
|---|---|---|
| `shared/ui` adapters | `"use client"` for interactive primitives; Server Component for presentational ones | Wraps `@org/ui-kit` components which are assumed to be Client Components unless stated otherwise |
| `entities/*/ui` | Server Components | Domain UI typically reads and displays data; async Server Components own their own fetch and participate in Suspense streaming |
| `features/*/ui` | Client Components | User interactions (form state, click handlers) nearly always require hooks |
| `widgets/*/ui` | Server Components | Page sections orchestrate layout and pass data as props to inner Client Components |
| `views/` | Server Components | Full screens compose widgets; own `<Suspense>` boundaries for streaming |
| `app/` | Server Components | Root layouts, providers wiring, routing — orchestration only |

The `<Suspense>` boundary is the streaming seam. Place it in `views/` or `widgets/` around async Server Components. Each async Server Component inside a Suspense boundary can stream independently as its data resolves.

```ts
// views/dashboard/DashboardView.tsx — Server Component
export function DashboardView() {
  return (
    <main>
      <Header />                          {/* widget, Server Component */}
      <Suspense fallback={<Skeleton />}>
        <ActivityFeed />                  {/* entity UI, async Server Component */}
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <RecentOrders />                  {/* entity UI, async Server Component */}
      </Suspense>
    </main>
  )
}
```

Each suspended section streams independently. The page is interactive as soon as its own section resolves — users do not wait for the slowest fetch.
