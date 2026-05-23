# AGENTS.md

This file provides instructions to AI coding assistants (Claude Code, GitHub Copilot, Cursor, etc.) working in this repository.

## Project

furio-kit is a React boilerplate by FurioLabs for enterprise frontends. It uses Next.js 16+ App Router with React Server Components and follows Feature-Sliced Design (FSD).

## Before Writing Code

1. Read `CLAUDE.md` for full architectural context and conventions.
2. Read `node_modules/next/dist/docs/` for Next.js API reference (bundled with Next.js 16.2+).
3. Check `CONTRIBUTING.md` for development workflow.

## Architecture Quick Reference

### FSD Layer Hierarchy (imports flow downward only)

```
app        -> views, widgets, features, entities, shared
views      -> widgets, features, entities, shared
widgets    -> features, entities, shared
features   -> entities, shared
entities   -> shared
shared     -> (nothing above)
```

Cross-slice imports at the same layer are **forbidden**.

### Key Rules

- **Server Components by default.** Only add `"use client"` when hooks or event handlers are needed.
- **Adapter pattern.** Import UI from `@/shared/ui`, never from `@org/ui-kit` directly.
- **Barrel exports.** Every slice (`entities/*`, `features/*`, `widgets/*`) must have an `index.ts`.
- **Zod validation.** All `entities/*/api/` functions must parse responses through a Zod schema.
- **State separation.** Zustand is for UI state only. Never store server-fetched data in Zustand.
- **className composition.** Use `cn()` from `@/shared/utils`. Never use template literals for classNames.

## Automated Checks (do not duplicate)

The following checks run automatically in CI. Do not bypass or disable them. If a check fails, fix the underlying issue.

| Check | Where | What it enforces |
|---|---|---|
| TypeScript | `ci.yml` | `pnpm tsc --noEmit` - no type errors |
| Biome | `ci.yml` | `pnpm lint` - lint rules + import organization |
| Vitest | `ci.yml` | `pnpm test` - all tests pass |
| Build | `ci.yml` | `pnpm build` - production build succeeds |
| Architecture Guard | `architecture-guard.yml` | FSD layers, adapter pattern, barrel exports, no deep imports, UI kit connection (opt-in) |
| Vulnerability Audit | `audit.yml` | `pnpm audit --audit-level=high` |
| CodeQL | `codeql.yml` | Security analysis for JS/TS |
| Dependabot | `dependabot.yml` | Weekly dependency updates |
| Stale | `stale.yml` | Auto-close inactive PRs/issues |

## Code Style

- Components: `PascalCase` functional components
- Server Actions: `camelCase` with `Action` suffix (e.g., `loginAction`)
- Files: `kebab-case` for non-components, `PascalCase.tsx` for components
- Named exports everywhere except Next.js `page.tsx` / `layout.tsx` (default exports)

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
| Understand architecture / "How does X work?" | `gitnexus-exploring` |
| Blast radius / "What breaks if I change X?" | `gitnexus-impact-analysis` |
| Trace bugs / "Why is X failing?" | `gitnexus-debugging` |
| Rename / extract / split / refactor | `gitnexus-refactoring` |
| Tools, resources, schema reference | `gitnexus-guide` |
| Index, status, clean, wiki CLI commands | `gitnexus-cli` |

<!-- gitnexus:end -->
