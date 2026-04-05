# Copilot Instructions for furio-kit

## Architecture

- All components are Server Components by default. Only add `"use client"` when the component uses hooks, event handlers, or browser APIs.
- Import UI primitives from `@/shared/ui`, never from `@org/ui-kit` directly.
- Use `cn()` from `@/shared/utils` for className composition. Never use template literals for classNames.
- Follow Feature-Sliced Design. Imports flow downward only: `app > views > widgets > features > entities > shared`.
- No cross-slice imports at the same layer.
- Every slice under `entities/`, `features/`, `widgets/` must have an `index.ts` barrel export.

## Data & State

- Fetch initial data in async Server Components. Never fetch in Client Components for initial render.
- Use Server Actions (`"use server"`) for mutations.
- Use TanStack Query for client-side cache and optimistic UI within Client Components.
- Zustand is for UI state only (sidebar open, theme, etc.). Never store server-fetched data in Zustand.
- All API response data must be parsed through a Zod schema before use.

## Code Style

- Components: PascalCase, functional only.
- Server Actions: camelCase with `Action` suffix (e.g., `loginAction`).
- Files: kebab-case for non-components, PascalCase.tsx for components.
- Named exports everywhere except Next.js page/layout files.

## Security

- Validate all external input with Zod at system boundaries (API routes, Server Actions, form data).
- Never use raw HTML injection without DOMPurify sanitization.
- Environment secrets only in Server Components or Server Actions.
- Client-safe env vars must use `NEXT_PUBLIC_` prefix.
- Auth tokens in HttpOnly cookies only, never localStorage.

## Testing

- Tests co-located with source: `*.test.ts` / `*.test.tsx`.
- Use Vitest + React Testing Library.
- Write tests before implementing new features (TDD).
- For bug fixes, write a failing test first.
