# Design System Integration

Connect your organization's design system to furio-kit in three steps: install `@your-org/ui-kit`, update the import in each adapter, and add any new adapters you need. Everything else in the app continues to import from `@/shared/ui` — nothing else changes.

---

## How the adapter pattern works

`@org/ui-kit` is never imported directly from features, entities, widgets, or views. Every component goes through a thin adapter in `src/shared/ui/` first.

```
@org/ui-kit
    |
    v
src/shared/ui/Button/Button.tsx   (adapter)
src/shared/ui/Card/Card.tsx       (adapter)
    |
    v
features / entities / widgets / views
```

Adapters serve two purposes:

1. **Decoupling** — If the org switches design systems (Material UI to a custom library, for example), only the adapters change. The rest of the codebase is untouched.
2. **API normalization** — Each adapter defines its own `Props` interface. The rest of the app depends on that interface, not on whatever shape `@org/ui-kit` happens to export.

---

## Installing your design system

```bash
pnpm add @your-org/ui-kit
```

Then open each adapter file and replace the placeholder implementation with a real import:

```ts
// Before (placeholder)
// src/shared/ui/Button/Button.tsx
// ... manual button implementation

// After (connected)
import { Button as OrgButton } from '@your-org/ui-kit'
```

Map your adapter's `Props` interface to whatever `OrgButton` expects. The consumers of `@/shared/ui` never see the difference.

---

## Writing a new adapter

There are two adapter types. Pick the right one based on whether the component uses event handlers or hooks.

### Interactive adapter ("use client")

Use this for any component that has event handlers, refs, or consumes hooks: `Button`, `Input`, `Select`, `Checkbox`, `Modal`, etc.

```tsx
// src/shared/ui/Input/Input.tsx
'use client'

import { Input as OrgInput } from '@your-org/ui-kit'
import type { ChangeEvent } from 'react'

export interface InputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
}

export function Input({ value, onChange, placeholder, disabled, id }: InputProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
  }

  return (
    <OrgInput
      id={id}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}
```

```ts
// src/shared/ui/Input/index.ts
export { Input } from './Input'
export type { InputProps } from './Input'
```

### Presentational adapter (Server Component)

Use this for components that only receive data and render it — no event handlers, no hooks: `Card`, `Badge`, `Avatar`, `Tag`, etc. Omit `"use client"` so the component remains a Server Component and its output is never hydrated.

```tsx
// src/shared/ui/Badge/Badge.tsx
import { Badge as OrgBadge } from '@your-org/ui-kit'
import { cn } from '@/shared/utils'

export interface BadgeProps {
  label: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
  className?: string
}

export function Badge({ label, variant = 'default', className }: BadgeProps) {
  return (
    <OrgBadge
      label={label}
      variant={variant}
      className={cn(className)}
    />
  )
}
```

```ts
// src/shared/ui/Badge/index.ts
export { Badge } from './Badge'
export type { BadgeProps } from './Badge'
```

### File layout

Every adapter follows the same directory shape:

```
src/shared/ui/
  ComponentName/
    ComponentName.tsx   <- adapter implementation
    index.ts            <- re-exports the component and its Props type
```

---

## RSC compatibility

Assume every component in `@org/ui-kit` is a Client Component unless the package's documentation explicitly states otherwise. This means:

- When wrapping an interactive primitive, mark the adapter `"use client"`.
- When wrapping a presentational primitive, you may leave the adapter as a Server Component — but only if you are confident the underlying component contains no hooks or browser APIs.

If you are unsure, default to `"use client"`. Adding it to a component that did not need it is a minor performance cost. Omitting it from a component that does need it is a runtime error.

---

## Extending adapters

Sometimes the app needs behavior that `@org/ui-kit` does not provide. Add the extra prop to the adapter's interface and handle it locally — do not leak it to the underlying component.

The following example adds a `loading` prop to `Button` that `@org/ui-kit` does not have:

```tsx
// src/shared/ui/Button/Button.tsx
'use client'

import { Button as OrgButton } from '@your-org/ui-kit'
import type { ReactNode } from 'react'
import { cn } from '@/shared/utils'

export interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  /** furio-kit extension: shows a spinner and disables the button */
  loading?: boolean
  className?: string
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled,
  onClick,
  loading = false,
  className,
}: ButtonProps) {
  return (
    <OrgButton
      variant={variant}
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(loading && 'opacity-75 cursor-wait', className)}
    >
      {loading ? <span aria-hidden>...</span> : children}
    </OrgButton>
  )
}
```

Guidelines for extensions:

- Document the extension with a JSDoc comment so the next developer knows it is not part of `@org/ui-kit`.
- Keep extensions minimal. If the behavior is complex, consider a dedicated feature component that wraps the adapter.
- Never pass unknown props through to `OrgButton` — it may warn or error at runtime.

---

## Token and theme integration

Design systems expose their visual tokens either as a `tokens` export or as CSS custom properties. Both approaches integrate with Tailwind v4 through `app/globals.css`.

### CSS custom properties (most common)

If `@org/ui-kit` ships a stylesheet that declares CSS variables, import it in `app/globals.css` and reference the variables directly in Tailwind utilities:

```css
/* app/globals.css */
@import "tailwindcss";
@import "@your-org/ui-kit/tokens.css";

@theme {
  --color-brand-primary: var(--org-color-primary);
  --color-brand-secondary: var(--org-color-secondary);
  --radius-card: var(--org-radius-md);
}
```

After mapping the tokens, use them as Tailwind classes anywhere in the app:

```tsx
<div className="bg-brand-primary text-white rounded-card" />
```

### JavaScript tokens export

If the package exports a `tokens` object instead of CSS variables, convert them to CSS custom properties in `app/globals.css`:

```ts
// Not usable directly in CSS — convert at build time or inline
import { tokens } from '@your-org/ui-kit'
```

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-brand-primary: #0055cc;   /* tokens.color.primary */
  --color-brand-secondary: #444;    /* tokens.color.secondary */
}
```

Keep the comment cross-referencing the token name so future updates are easy to track.

---

## Registering a new adapter

After creating an adapter, add it to the barrel file so the rest of the app can import it from `@/shared/ui`:

```ts
// src/shared/ui/index.ts
export { Button } from './Button'
export type { ButtonProps } from './Button'
export { Card } from './Card'
export type { CardProps } from './Card'
export { Badge } from './Badge'      // <- add new adapters here
export type { BadgeProps } from './Badge'
export { Input } from './Input'
export type { InputProps } from './Input'
```

Consumers import from the barrel, never from the adapter file directly:

```ts
import { Badge, Button, Input } from '@/shared/ui'   // correct
import { Badge } from '@/shared/ui/Badge/Badge'       // forbidden
```

---

## Rules summary

These rules are enforced in CI. Pull requests that violate them will fail the lint check.

| Rule | Rationale |
|---|---|
| Never import `@org/ui-kit` outside `src/shared/ui/` | Keeps the design system dependency contained; a single layer to update when the package changes |
| Mark adapters `"use client"` for interactive primitives | Prevents RSC hydration errors at runtime |
| Use `cn()` from `@/shared/utils` for all `className` composition | Handles Tailwind class conflicts correctly; never use template literals |
| Every adapter must be re-exported from `src/shared/ui/index.ts` | Enforces the single import path for consumers |
| Adapter `Props` interfaces use named exports | Allows consumers to type props without importing the component itself |
