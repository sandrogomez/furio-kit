# ADR-004: Per-Slice Zustand State Pattern

**Date:** 2026-05-22
**Status:** Proposed
**Priority:** Medium
**Deciders:** FurioLabs engineering team

---

## Context

`src/shared/model/ui-store.ts` defines a single global Zustand store with one state slice:
`sidebarOpen` + `toggleSidebar`. The pattern is SSR-safe (factory function + `useRef`
in `StoreProvider`), but it creates an implicit rule: all UI state goes into one global store.

As the application grows, this centralisation causes three problems:

1. **Merge conflicts** — teams working on different features all modify one file.
2. **Unclear ownership** — it becomes ambiguous which slice of state belongs to which feature.
3. **Testing friction** — feature tests must mock the global store even when they only care
   about their own state slice.

FSD's slice model suggests that each feature should own its own concerns. State is a feature
concern. The boilerplate needs to demonstrate the per-slice pattern alongside the global one,
and document when to use each.

---

## Decision

Establish two coexisting patterns:

### Pattern A — Global store (keep as-is): cross-cutting UI state

Use `shared/model/ui-store.ts` only for state that is genuinely global:
- Sidebar open/closed
- Theme (light/dark)
- Active locale
- Notification queue

Rule: **If more than one feature needs the state, it goes in the global store.**

### Pattern B — Slice store: feature-owned UI state

Each feature slice that has non-trivial local UI state creates its own store factory
inside its `model/` directory. The slice store is created and consumed entirely within
the feature — it never leaks to other slices.

```
src/features/cart/
  model/
    cart-store.ts       ← createCartStore() factory
    types.ts
  ui/
    CartDrawer.tsx      ← consumes useCartStore()
    CartButton.tsx
  index.ts
```

```ts
// src/features/cart/model/cart-store.ts
import { createStore } from 'zustand'

interface CartState {
  isOpen: boolean
  itemCount: number
  open: () => void
  close: () => void
}

export type CartStore = ReturnType<typeof createCartStore>

export const createCartStore = () =>
  createStore<CartState>()((set) => ({
    isOpen: false,
    itemCount: 0,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
  }))
```

The slice mounts its own provider scoped to the subtree that needs it:

```tsx
// src/features/cart/ui/CartProvider.tsx
'use client'
import { createContext, useContext, useRef } from 'react'
import { useStore } from 'zustand'
import { createCartStore, type CartStore } from '../model/cart-store'

const CartContext = createContext<CartStore | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<CartStore | null>(null)
  if (!storeRef.current) storeRef.current = createCartStore()
  return <CartContext.Provider value={storeRef.current}>{children}</CartContext.Provider>
}

export function useCartStore<T>(selector: (state: ReturnType<CartStore['getState']>) => T) {
  const store = useContext(CartContext)
  if (!store) throw new Error('useCartStore must be used within CartProvider')
  return useStore(store, selector)
}
```

### Decision rule — documented in CLAUDE.md

| State type | Where it lives |
|---|---|
| Shared across 2+ features | `shared/model/ui-store.ts` |
| Owned by one feature | `features/{name}/model/{name}-store.ts` |
| Derived from server data | TanStack Query — not Zustand |
| Form state | React Hook Form or native form |

---

## Consequences

**Positive:**
- Features are fully self-contained — their state, UI, and API calls live together.
- Tests for a feature only need to mount that feature's provider, not the global store.
- Merge conflicts on `ui-store.ts` disappear because features don't touch it.
- The slice store pattern mirrors the `StoreProvider` pattern already in the codebase —
  no new concepts, just applied at a different scope.

**Negative / trade-offs:**
- The decision rule (shared vs slice) requires judgment. Ambiguous cases will occur.
- Teams must learn to recognise when state has grown beyond a single feature and migrate it
  to the global store. That migration is a non-trivial refactor.
- More provider components in the tree means slightly more React overhead, though this is
  negligible compared to the bundle size gains from ADR-003.

---

## Implementation notes

- The `CartProvider` pattern shown above is the template — replicate it for any feature
  with non-trivial local state.
- The global `StoreProvider` in `shared/providers` is not removed; it continues to serve
  cross-cutting state.
- A code generator (`plop`) template should be added for the per-slice store pattern so
  teams scaffold it correctly. See `docs/wiki/09-extending.md` for the existing generator setup.
- The CLAUDE.md state management table must be updated with the decision rule.

---

## Acceptance criteria

- [ ] `src/features/` contains at least one example slice with its own store (e.g. a sample
      `notifications` feature with `model/notifications-store.ts` and a scoped provider)
- [ ] `CLAUDE.md` state management section updated with the shared vs. slice decision rule
- [ ] `plop` template added for per-slice store scaffolding
- [ ] Unit tests for the example slice store use only the slice's own provider (no global store mock)
- [ ] `pnpm test` passes
