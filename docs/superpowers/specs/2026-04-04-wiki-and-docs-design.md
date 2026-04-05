# Wiki & Documentation Update Design

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Fix stale docs, create comprehensive wiki for furio-kit template users

## Overview

Update existing documentation to fix version mismatches, then create a 10-page wiki in `docs/wiki/` that guides mid-level developers through implementing a new application based on furio-kit and extending the template.

### Design Principles

- **Lives in the repo** — wiki travels with every fork. No external wiki dependency.
- **Mid-level audience** — assumes Next.js and React knowledge. Focuses on furio-kit-specific patterns and decisions.
- **Quick-start summaries** — each page opens with a 2-3 sentence summary for devs who just need the steps.
- **No duplication** — wiki references CLAUDE.md, CONTRIBUTING.md, and AGENTS.md rather than repeating their content. Each doc has a clear purpose.

### Document Roles

| Document | Purpose | Audience |
|---|---|---|
| `README.md` | First impression, bootstrap, quick commands | Everyone |
| `CONTRIBUTING.md` | PR workflow, worktrees, generator usage | Contributors |
| `CLAUDE.md` | Full technical context for Claude Code | AI assistants |
| `AGENTS.md` | Quick rules for all AI assistants | AI assistants |
| `docs/wiki/` | Learning guides, architecture explanations, how-tos | Developers building on the template |

## Part 1: Documentation Fixes

### README.md fixes

1. Update version requirements: Node.js 20+ -> 22+, pnpm 9+ -> 10+
2. Add `pnpm tsc --noEmit` to commands table

No other docs need fixes. CONTRIBUTING.md, CLAUDE.md, AGENTS.md, and .env.example are all accurate.

## Part 2: Wiki Structure

```
docs/wiki/
  home.md
  01-getting-started.md
  02-architecture.md
  03-adding-features.md
  04-design-system.md
  05-auth.md
  06-state-management.md
  07-testing.md
  08-ci-automation.md
  09-extending.md
```

## Part 3: Page Specifications

### home.md

- Project identity: what furio-kit is (one paragraph)
- Tech stack table with current versions
- Quick links to all 9 guides with one-line descriptions
- "Where to find what" matrix mapping questions to the right document

### 01-getting-started.md

Sections:
- Prerequisites (Node 22+, pnpm 10+)
- Bootstrap paths: degit, GitHub template button, manual clone
- Environment setup: copy .env.example to .env.local, explain key vars
- First run: `pnpm install && pnpm dev`, what you see at localhost:3000
- Remove starter content: delete `src/entities/user` and `src/features/auth`, update HomePage
- Project structure: what each top-level directory does (app/, src/, .github/, .claude/)
- Commands reference table

### 02-architecture.md

Sections:
- FSD layer hierarchy with ASCII diagram
- Layer import rules: what each layer can import from
- Cross-slice import prohibition and why
- RSC rendering model: Server Components are the default, Client Components are opt-in
- `"use client"` boundary strategy: push boundaries as deep as possible
- Data flow: Server Component fetches -> props down -> Client Components for interactivity
- File naming conventions: PascalCase components, kebab-case files, barrel exports
- Public API rule: every slice has index.ts, external consumers import from the barrel only

### 03-adding-features.md

Walkthrough: "Build a product listing page from scratch"

Steps:
1. Create the entity: `pnpm generate entity` -> product
2. Define the Zod schema in `model/types.ts`
3. Implement the API function in `api/get-products.ts` with Zod parse
4. Build the entity UI component (ProductCard as Server Component)
5. Create a feature if user interaction is needed (e.g., add-to-cart with Server Action)
6. Compose entity + feature into a widget (ProductSection)
7. Create the view that orchestrates widgets with Suspense boundaries
8. Wire the view to an app route in `app/products/page.tsx`

Each step shows exact file paths and complete code blocks.

### 04-design-system.md

Sections:
- How the adapter pattern works: `@org/ui-kit` -> `src/shared/ui/` adapter -> consumers
- Why: decouples the app from any specific design system
- Installing your org's package: `pnpm add @your-org/ui-kit`
- Writing a new adapter: interactive (needs `"use client"`) vs presentational (Server Component)
- RSC compatibility: assume `@org/ui-kit` components are Client Components unless documented otherwise
- Extending adapters with project-specific props
- Token/theme integration: CSS variables or tokens export from the design system

### 05-auth.md

Sections:
- Auth adapter architecture: `src/shared/auth/` with pluggable adapters
- How `proxy.ts` protects routes: middleware checks session, redirects to login
- Switching providers: change one import in `src/shared/auth/index.ts`
- Available adapters: mock (dev), Auth0, PingFederate
- Required env vars per provider (reference .env.example)
- Adding a new provider: implement the AuthAdapter interface, create adapter file, export it
- Testing auth locally: use mock adapter with `MOCK_AUTH_USER=1`

### 06-state-management.md

Sections:
- Decision matrix table: scenario -> tool -> example
- Server Components: direct fetch in async components, no useEffect, no client libs
- Server Actions: `"use server"` functions for mutations, called from forms or Client Components
- TanStack Query: client-side cache, `useQuery` / `useMutation`, `HydrationBoundary` + `dehydrate()` for SSR handoff
- Zustand: UI-only state (sidebar, theme, modal), factory pattern via `createStore`, SSR-safe with `useRef`
- Anti-patterns with explanations:
  - Fetching in Client Components for initial render
  - Storing server-fetched data in Zustand
  - Using useEffect for data fetching
  - Putting `"use client"` at the top of a widget or view

### 07-testing.md

Sections:
- Test file placement: co-located `ComponentName.test.tsx` next to source
- What to test per layer:
  - `shared/ui` adapters: prop mapping, correct underlying component renders
  - `entities/*/api`: data logic in isolation, Zod parse behavior
  - `entities/*/ui`: rendered output via React Testing Library
  - `features`: user interactions, Server Action calls
- Server Components: test data transformation logic as pure functions
- Client Components: render with React Testing Library, simulate interactions
- Don't test `@org/ui-kit` components (tested by the design system team)
- Running tests: `pnpm test` (single run), `pnpm test:watch` (watch mode)
- Test configuration: vitest.config.ts, vitest.setup.ts explained

### 08-ci-automation.md

Sections:
- GitHub Actions overview: table of all 6 workflows with trigger, purpose, what blocks merge
- CI pipeline: typecheck -> lint -> test (runs on every PR)
- Architecture guard: the 4 checks it performs, how to read the PR comment
- Dependabot auto-merge: patch (auto), minor (auto if no breaking keywords), major (needs-review label)
- Stale cleanup: 14 days -> stale label, 7 more -> auto-close, exempt labels
- Claude Code hooks: what each hook does, how hooks work (PreToolUse events), how to customize in settings.json
- Claude Code triggers: weekly health, dep review, arch review. Schedules, how to run on-demand
- Copilot instructions: what `.github/copilot/instructions.md` enforces

### 09-extending.md

Sections:
- Adding a new Plop generator: edit `plopfile.mjs`, add generator config and templates
- Adding a new GitHub Action workflow: create YAML in `.github/workflows/`, follow existing patterns
- Adding a new Claude Code hook: create script in `.claude/hooks/`, register in `.claude/settings.json`
- Customizing Biome rules: edit `biome.json`, add domain-specific rules
- Upgrading major dependencies: use the `dep-review.md` trigger or manual process
- When to diverge from the template: local customization vs upstream sync trade-offs
- Pulling upstream changes: how to merge furio-kit updates into a forked app

## Implementation Phases

**Phase 1 - Doc fixes:**
- Fix README.md (version requirements, commands table)

**Phase 2 - Wiki core (pages 1-5):**
- home.md, getting-started, architecture, adding-features, design-system

**Phase 3 - Wiki specialized (pages 6-9):**
- auth, state-management, testing, ci-automation, extending
