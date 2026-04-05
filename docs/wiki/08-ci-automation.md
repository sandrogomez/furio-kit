# CI and Automation

This page documents every automated check, hook, and scheduled agent in furio-kit. Come here when a workflow fails or you need to understand what runs and why.

---

## 1. GitHub Actions overview

Six workflows run in `.github/workflows/`.

| Workflow | File | Trigger | What it does | Blocks merge? |
|---|---|---|---|---|
| CI | `ci.yml` | push/PR to `main` | TypeScript typecheck (`tsc --noEmit`), Biome lint, Vitest test suite | Yes |
| Audit | `audit.yml` | push/PR to `main`, weekly Monday 08:00 UTC | `pnpm audit --audit-level=high` | Yes |
| CodeQL | `codeql.yml` | push/PR to `main`, weekly Monday 08:00 UTC | GitHub CodeQL security analysis (JavaScript/TypeScript) | Yes |
| Architecture Guard | `architecture-guard.yml` | PR to `main` (any `src/` change) | FSD layer violations, adapter pattern, barrel exports, deep imports | Yes |
| Dependabot Auto-Merge | `dependabot-auto.yml` | Any Dependabot PR | Auto-merges patch/minor, labels major for review | No (enables auto-merge) |
| Stale | `stale.yml` | Daily 06:00 UTC | Labels PRs/issues inactive for 14 days, closes after 7 more | N/A |

---

## 2. What blocks merge

A merge to `main` is blocked if any of the following fail:

- **TypeScript errors** — `tsc --noEmit` exits non-zero (`ci.yml`)
- **Lint failures** — Biome reports errors (`ci.yml`)
- **Test failures** — any Vitest test fails or a test suite errors out (`ci.yml`)
- **High or critical vulnerabilities** — `pnpm audit --audit-level=high` finds a matching advisory (`audit.yml`)
- **CodeQL findings** — GitHub's semantic analysis flags a security issue (`codeql.yml`)
- **FSD violations** — a layer imports from above itself, or a slice imports from a peer slice (`architecture-guard.yml`)
- **Adapter pattern violations** — `@org/ui-kit` is imported outside `src/shared/ui/` (`architecture-guard.yml`)
- **Missing barrel exports** — a slice under `entities/`, `features/`, or `widgets/` has no `index.ts` (`architecture-guard.yml`)
- **Deep imports** — an import uses three or more path segments after `@/` into a sliced layer (`architecture-guard.yml`)

Stale and Dependabot Auto-Merge do not block merge.

---

## 3. Architecture Guard details

`architecture-guard.yml` runs four independent checks on every PR that touches `src/`. The job posts a comment to the PR after each run and updates it on subsequent pushes, so you always see the current state.

### The four checks

**Check 1: FSD layer imports**

Imports must flow strictly downward through the layer hierarchy:

```
app > views > widgets > features > entities > shared
```

The check catches two violation types:

- A layer importing from a layer above it (e.g., `shared/` importing from `entities/`)
- A cross-slice import at the same layer (e.g., `entities/user/` importing from `entities/product/`)

**Check 2: Adapter pattern**

`@org/ui-kit` may only be imported inside `src/shared/ui/`. Any import of `@org/ui-kit` found elsewhere in `src/` fails this check.

**Check 3: Barrel exports**

Every slice directory under `entities/`, `features/`, and `widgets/` must contain an `index.ts`. The check lists every slice directory that is missing one.

**Check 4: Deep imports**

External code must import from the slice root, not from internal files:

```ts
// correct
import { UserCard } from '@/entities/user'

// blocked — three segments after @/
import { getUsers } from '@/entities/user/api/get-users'
```

The check flags any import matching `@/(entities|features|widgets|views)/<slice>/<anything>`.

### Reading the PR comment

The Architecture Guard comment uses this format:

```
## Architecture Guard

One or more architecture checks failed. Please review the violations below.

### ❌ FSD layer violations (imports must flow downward; no cross-slice imports)

src/features/login/ui/LoginForm.tsx:3:import { getUsers } from '@/entities/user/api/get-users'
```

Each failing check includes the exact file, line number, and import that triggered it. A passing check shows a checkmark and no body.

### What to do when it fails

1. Read the violation lines in the PR comment — each line shows the file and import to fix.
2. For FSD violations: move the import to a lower layer, or restructure so the dependency flows downward.
3. For adapter violations: add an adapter in `src/shared/ui/<Component>/` and import from `@/shared/ui` instead.
4. For missing barrels: create `src/<layer>/<slice>/index.ts` and export the public surface.
5. For deep imports: change the import path to the slice root (`@/entities/user`, not `@/entities/user/api/get-users`).
6. Push the fix — the guard re-runs automatically and updates the comment.

---

## 4. Dependabot auto-merge

`dependabot-auto.yml` runs on every Dependabot PR. Behavior depends on the semver update type:

| Update type | Behavior |
|---|---|
| Patch | Auto-merge via `gh pr merge --auto --squash` immediately |
| Minor | Auto-merge if the PR body contains no `BREAKING`, `breaking change`, or `deprecated` keywords |
| Major | Adds `needs-review` label and posts a comment noting the version range and asking for manual review |

Auto-merge uses `--auto`, which means the merge happens after all required status checks pass — the CI, Audit, and CodeQL workflows must green first.

### Manually reviewing a major bump

1. Open the PR. It will have the `needs-review` label and a bot comment showing the old and new version numbers.
2. Check the package changelog for breaking changes.
3. Run `pnpm install` locally and verify the build: `pnpm build`.
4. If safe to merge, remove the `needs-review` label and approve the PR. GitHub will merge it once checks pass.
5. If you need to defer it, add the `keep-open` label — this also exempts it from the stale workflow.

---

## 5. Claude Code hooks

Hooks are scripts that Claude Code runs at specific points in its tool lifecycle. They fire as `PreToolUse` events — before Claude executes a tool — and can either allow the action (exit `0`) or block it (exit `2`, with the error printed to stderr and fed back to Claude as context).

Hooks are registered in `.claude/settings.json` and live as shell scripts in `.claude/hooks/`.

### The three hooks

**`check-staged.sh`** — fires before every `git commit`

Inspects staged files (`.ts`, `.tsx`, `.js`, `.jsx`) and blocks the commit if:

- Biome reports lint errors in staged TypeScript/JavaScript files
- Any staged file contains `console.log`, `debugger`, or `TODO(hack)`
- A staged file is a `.env` file or matches a credential/secret filename pattern (`.pem`, `.key`, `*secret*`, `*credential*`)

**`check-architecture.sh`** — fires before every `git push`

Compares changed files against `main` and checks only the files in the diff, so it is fast on incremental pushes. Blocks the push if:

- Any changed file imports from a layer above itself (FSD layer violation)
- Any changed file outside `src/shared/ui/` imports from `@org/ui-kit` (adapter violation)
- Any slice under `entities/`, `features/`, or `widgets/` is missing `index.ts` (barrel check)

**`security-reminder.sh`** — fires before every `Edit` or `Write` tool call

Reads the target file path and injects context-aware reminders into Claude's response (exit `0`, never blocks):

| File pattern | Reminder |
|---|---|
| `*/middleware.ts`, `*/proxy.ts` | Auth bypass risks, session validation, token exposure |
| `*/entities/*/api/*` | Zod parse requirement for all API responses |
| `*.env*` | `NEXT_PUBLIC_` exposure risk, gitignore reminder |

### Customizing hooks

The hook registry is `.claude/settings.json`. The relevant section:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(git commit *)",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check-staged.sh"
          },
          {
            "type": "command",
            "if": "Bash(git push *)",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check-architecture.sh"
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/security-reminder.sh"
          }
        ]
      }
    ]
  }
}
```

To add a hook: add an entry to the appropriate `hooks` array. To disable a hook without deleting it: remove its entry from `settings.json`. To change what a hook checks: edit the shell script directly — the hook contract is `exit 0` to allow, `exit 2` to block (stderr text is shown to Claude).

---

## 6. Claude Code triggers

Triggers are scheduled or on-demand agents defined as markdown files in `.claude/triggers/`. They require a Claude Max subscription. Each file has a YAML front matter block with a `schedule` (cron expression or `null`) and a `description`, followed by a prompt that Claude executes as an autonomous agent.

### The three triggers

**`weekly-health.md`** — Monday 09:00

Runs `pnpm outdated`, lists open Dependabot PRs that were not auto-merged, runs `pnpm audit`, and checks that `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, and `package.json` version ranges are consistent with installed packages. Creates a GitHub issue titled `Weekly Health Report - YYYY-MM-DD` with label `maintenance`.

**`dep-review.md`** — on-demand (`schedule: null`)

Given a package name and target version, searches the web for the changelog, scans the codebase for all usages of the package, maps each breaking change to the files affected, and produces a migration report saved to `docs/dep-reviews/YYYY-MM-DD-<package-name>.md`. Use this before upgrading a major dependency.

**`arch-review.md`** — 1st and 15th of the month at 09:00

Performs semantic architecture checks that regex-based CI cannot catch:

- Zustand stores containing server-fetched data (should be UI state only)
- `entities/*/api/` functions that return data without a Zod `.parse()` or `.safeParse()` call
- `"use client"` directives in `widgets/` or `views/` files (boundary should be pushed down)
- Server Components using hooks, event handlers, or browser APIs
- Server Actions not following the `camelCaseAction` naming convention

Creates a GitHub issue titled `Architecture Review - YYYY-MM-DD` with label `architecture`.

### Running a trigger on-demand

To invoke `dep-review.md` manually, use the Claude Code CLI from the project root:

```bash
claude run .claude/triggers/dep-review.md
```

Pass context in the prompt or as arguments as needed. The agent will follow the steps in the trigger file and write its output to the specified location.

---

## 7. Copilot instructions

`.github/copilot/instructions.md` provides project-specific context that GitHub Copilot uses when generating suggestions in this repository. It covers:

- Default Server Component rendering and when to add `"use client"`
- The `@/shared/ui` adapter rule (never import `@org/ui-kit` directly)
- `cn()` for className composition
- FSD layer import order and cross-slice restrictions
- Data fetching in Server Components vs. TanStack Query vs. Server Actions
- Zustand for UI state only
- Zod parsing at all system boundaries
- Naming conventions (PascalCase components, `camelCaseAction` Server Actions, kebab-case files)
- Security rules (DOMPurify, HttpOnly cookies, `NEXT_PUBLIC_` prefix policy)
- TDD testing approach

### Customizing Copilot suggestions

Append domain-specific rules to `.github/copilot/instructions.md`. Rules are applied in order, so append rather than insert to avoid unintended precedence changes. Keep rules concise — Copilot uses this file as context in every request, so large files degrade suggestion quality.

Examples of rules to add:

```markdown
## Domain: Payments

- Never log payment card data (PAN, CVV, expiry) to the console or include it in error messages.
- Use `formatCurrency(amount, currency)` from `@/shared/utils` for all monetary display values.
```
