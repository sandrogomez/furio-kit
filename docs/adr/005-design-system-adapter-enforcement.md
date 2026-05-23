# ADR-005: Design System Adapter — Fail-Loud Stubs and CI Verification

**Date:** 2026-05-22
**Status:** Proposed
**Priority:** Medium
**Deciders:** FurioLabs engineering team

---

## Context

The adapter pattern (`shared/ui/`) is the boilerplate's strongest standardisation mechanism.
It guarantees that every frontend uses the same import path (`@/shared/ui`) for UI primitives,
making a design system swap a one-layer change.

However, the current adapter implementations are **silent stubs**: `Button.tsx` renders its own
`<button>` with Tailwind classes and a comment saying "replace with `@org/ui-kit`". This creates
two risks:

1. **Silent production shipping of stub UI**: teams under deadline pressure ship the Tailwind stub
   rather than connecting the real design system. The app works but is not using `@org/ui-kit`.
   There is no build-time or runtime signal that this has happened.

2. **Two sources of UI truth**: the stub components implement their own visual design
   (blue button, gray card). If the real design system is eventually connected, the visual delta
   becomes a manual audit across every screen.

The adapter pattern's value is zero if teams don't connect it. The boilerplate must make
"not connected" observable.

---

## Decision

Replace silent stubs with fail-loud stubs that throw at runtime, and add a CI check that
detects unconnected adapters in production builds.

### 1. Replace stub implementations with thrown errors

The adapter files ship with real structure (interface, export name) but throw if the design
system is not connected:

```tsx
// src/shared/ui/Button/Button.tsx
'use client'
import type { ReactNode } from 'react'

export interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

export function Button(_props: ButtonProps): never {
  throw new Error(
    '[furio-kit] Button adapter is not connected. ' +
    'Import { Button } from "@org/ui-kit" and wrap it here. ' +
    'See docs/wiki/04-design-system.md for setup instructions.',
  )
}
```

Teams connect the adapter by replacing the throw with the real import:

```tsx
// After connecting @org/ui-kit:
'use client'
import { Button as OrgButton } from '@org/ui-kit'
// ... wrap OrgButton
```

### 2. Keep a fallback for local development without `@org/ui-kit`

The fail-loud approach blocks development when the design system package is not yet available
(scaffolding a new project before the org provides `@org/ui-kit`).

Gate the error behind an env var flag, and ship a minimal fallback for that case only:

```tsx
if (process.env.NEXT_PUBLIC_UI_KIT_CONNECTED !== 'true') {
  // Minimal fallback — only for local dev without @org/ui-kit
  return <button type={type} onClick={onClick} disabled={disabled}>{children}</button>
}
// Otherwise: throw — forces connection in all other environments
throw new Error('[furio-kit] Button adapter is not connected...')
```

Teams set `NEXT_PUBLIC_UI_KIT_CONNECTED=true` in `.env.local` once they connect the real package.
CI does not set this variable — so CI builds always exercise the throw path if not connected.

### 3. Add a CI check to `architecture-guard.yml`

Add a new check step that fails if any adapter file still contains the stub throw:

```yaml
- name: Check design system adapters connected
  run: |
    STUBS=$(grep -rn "furio-kit.*adapter is not connected" src/shared/ui/ \
      --include='*.ts' --include='*.tsx' 2>/dev/null || true)
    if [ -n "$STUBS" ]; then
      echo "Unconnected design system adapters found:"
      echo "$STUBS"
      exit 1
    fi
```

This check should be **opt-in** — disabled by default until the team has had time to connect
the design system. A repo-level env var (`ENFORCE_UI_KIT_CONNECTED=true`) gates the check.

---

## Consequences

**Positive:**
- Teams cannot accidentally ship stub UI to production without a visible, explicit bypass.
- The connection step is self-documenting — the error message links to setup instructions.
- The CI check makes the "connected" state verifiable in every PR once the org is ready.

**Negative / trade-offs:**
- The fail-loud stub requires teams to set `NEXT_PUBLIC_UI_KIT_CONNECTED=true` in `.env.local`
  immediately when scaffolding — it's a setup step that must be documented prominently.
- The dev experience degrades if the env var is forgotten — the entire UI throws on first render.
  Clear onboarding documentation and a `.env.example` file mitigate this.

---

## Implementation notes

- `.env.example` must be added to the boilerplate with `NEXT_PUBLIC_UI_KIT_CONNECTED=false`
  (not committed) and a comment explaining the flag.
- `docs/wiki/04-design-system.md` must be updated with step-by-step connection instructions
  that include setting the env var.
- The CI step should post its findings in the PR comment alongside the existing Architecture
  Guard output.

---

## Acceptance criteria

- [ ] `shared/ui/Button/Button.tsx` throws with a descriptive error when not connected
- [ ] `shared/ui/Card/Card.tsx` throws with a descriptive error when not connected
- [ ] All other adapters (if any) follow the same pattern
- [ ] `NEXT_PUBLIC_UI_KIT_CONNECTED` env var gates the fallback vs. throw behaviour
- [ ] `.env.example` documents the flag
- [ ] `architecture-guard.yml` contains the adapter connection check (opt-in via `ENFORCE_UI_KIT_CONNECTED`)
- [ ] `docs/wiki/04-design-system.md` updated with connection setup instructions
- [ ] `pnpm test` passes (adapter tests must mock the connected state)
