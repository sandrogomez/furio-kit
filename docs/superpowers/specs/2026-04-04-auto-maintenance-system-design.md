# Auto-Maintenance System Design

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Repository automation for furio-kit template and 1000+ downstream apps

## Overview

A 4-layer automation system that keeps furio-kit secure, architecturally consistent, and easy to maintain at scale. Each layer is independent. Layers 1-2 are required (ship with every fork). Layers 3-4 are optional enrichments for teams with Claude Code or GitHub Copilot.

### Design Principles

- **Opinionated defaults:** Everything enabled out of the box. Teams can opt out of specific checks but the structure is locked.
- **Split by context:** Claude Code owns local dev automation + deep semantic reviews. Copilot owns inline suggestions + quick fixes aligned with CLAUDE.md rules.
- **GitHub Actions is the backbone:** All critical enforcement runs in CI. Claude Code triggers are optional enrichments on top.
- **No single-tool dependency:** Any downstream app works with just Actions + Dependabot, even without Claude Code or Copilot.

## File Layout

```
.github/
  workflows/
    ci.yml                      # existing - typecheck, lint, test
    audit.yml                   # existing - weekly vulnerability scan
    codeql.yml                  # existing - CodeQL analysis
    dependabot-auto.yml         # NEW - auto-merge safe Dependabot PRs
    architecture-guard.yml      # NEW - FSD layer + adapter rule enforcement
    stale.yml                   # NEW - auto-close stale PRs/issues
  dependabot.yml                # existing
  copilot/
    instructions.md             # NEW - Copilot custom instructions
  pull_request_template.md      # existing

.claude/
  settings.json                 # NEW - project hooks config (committed)
  settings.local.json           # existing - local permissions (not committed)
  hooks/
    check-staged.sh             # NEW - pre-commit quality gate
    check-architecture.sh       # NEW - pre-push FSD enforcement
    security-reminder.sh        # NEW - context-aware edit reminders
  triggers/
    weekly-health.md            # NEW - scheduled architecture + dep review
    dep-review.md               # NEW - on-demand migration impact analysis
    arch-review.md              # NEW - biweekly semantic architecture scan

AGENTS.md                       # NEW - multi-AI coordination doc
CLAUDE.md                       # existing - enhanced with hook/skill refs
```

---

## Layer 1: GitHub Actions (Required Foundation)

### 1.1 dependabot-auto.yml - Auto-merge safe Dependabot PRs

**Trigger:** `pull_request` event from Dependabot bot.

**Logic:**
- **Patch updates:** Auto-merge with `--squash` if all CI checks pass. No human review.
- **Minor updates:** Auto-merge if CI passes and no breaking-change keywords (`BREAKING`, `breaking change`, `deprecated`) found in the PR body/changelog.
- **Major updates:** Label `needs-review`. Do not auto-merge. Post a comment requesting human assessment.

**Implementation:** Uses `dependabot/fetch-metadata` action to determine update type, then `gh pr merge --auto --squash` for safe updates. Runs after CI completes via `workflow_run` trigger.

### 1.2 architecture-guard.yml - FSD + Adapter enforcement

**Trigger:** Every PR to `main`.

**Implementation:** A single bash step (no external dependencies) that:

1. **FSD layer violations** - Parses `import` / `from` statements in changed files. Enforces the layer hierarchy:
   - `shared` cannot import from any layer above
   - `entities` can only import from `shared`
   - `features` can import from `entities` and `shared`
   - `widgets` can import from `features`, `entities`, and `shared`
   - `views` can import from `widgets`, `features`, `entities`, and `shared`
   - Cross-slice imports at the same layer are forbidden

2. **Adapter pattern** - Greps for `from '@org/ui-kit'` or `from "@org/ui-kit"` in any file outside `src/shared/ui/`. Fails if found.

3. **Public API barrels** - Checks that every directory under `src/entities/*/`, `src/features/*/`, `src/widgets/*/` contains an `index.ts`.

4. **No deep imports** - Checks that imports from `entities/`, `features/`, `widgets/` never reference internal paths (e.g., `entities/user/api/get-users` instead of `entities/user`).

**Output:** Posts a PR comment with pass/fail per rule, with specific file:line references for failures. Blocks merge on any failure via required status check.

### 1.3 stale.yml - Stale PR/issue cleanup

**Trigger:** Daily schedule.

**Configuration:**
- PRs with no activity for 14 days: labeled `stale`
- Stale PRs with no activity for 7 more days: auto-closed
- Exempt labels: `keep-open`, `work-in-progress`, `needs-review`
- Stale message explains why and how to reopen

---

## Layer 2: Git Quality Gates (Required - runs via CI)

The existing `ci.yml` already runs typecheck, lint, and test. No changes needed. The new `architecture-guard.yml` adds the architectural checks.

Together, these block merge on:
- TypeScript errors
- Biome lint failures
- Test failures
- FSD layer violations
- Adapter pattern violations
- Missing barrel exports
- High-severity audit findings (from `audit.yml`)
- CodeQL security findings (from `codeql.yml`)

---

## Layer 3: Claude Code Hooks + Triggers (Optional - Local Dev)

### 3.1 Pre-commit hook - check-staged.sh

**Event:** `PreToolUse` with `matcher: "Bash"` and `if: "Bash(git commit *)"`.

Fires before Claude executes any `git commit` command. Exit code 2 blocks the commit.

**Checks:**
- Runs `biome lint` on staged files only (fast path)
- Greps staged files for `console.log`, `debugger`, `TODO(hack)`
- Checks that no `.env`, `.env.local`, or credential files (`*credential*`, `*secret*`) are staged
- Blocks the commit (exit 2 with reason on stderr) if any check fails

**Hook receives on stdin:**
```json
{
  "tool_name": "Bash",
  "tool_input": { "command": "git commit -m '...'" },
  "cwd": "/path/to/project"
}
```

### 3.2 Pre-push hook - check-architecture.sh

**Event:** `PreToolUse` with `matcher: "Bash"` and `if: "Bash(git push *)"`.

Fires before Claude executes any `git push` command. Exit code 2 blocks the push.

**Checks:** Runs the same FSD layer + adapter checks from `architecture-guard.yml` locally against all changed files vs `main`. Gives instant feedback instead of waiting for CI.

### 3.3 Security reminder hook

**Event:** `PreToolUse` with `matcher: "Edit|Write"`.

The hook script inspects the `tool_input.file_path` from stdin and prints context-specific reminders to stdout (exit 0). These reminders are added to Claude's context.

**Fires when Claude edits:**
- `proxy.ts` - reminds about auth bypass risks
- Files matching `src/entities/*/api/*` - reminds about Zod validation requirement
- `.env*` files - reminds about secret exposure
- `.github/workflows/*.yml` - reminds about Actions injection risks (already exists via plugin hook)

### 3.4 Hook configuration in settings.json

All hooks are configured in `.claude/settings.json` (project-level, committed to git):

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

**Exit code behavior:**
- Exit 0: allow the action (stdout added as context to Claude)
- Exit 2: block the action (stderr message explains why to Claude)

**Key environment variables available in hook scripts:**
- `$CLAUDE_PROJECT_DIR` - project root directory

### 3.4 Weekly Health Check trigger - weekly-health.md

**Schedule:** Every Monday at 9:00 AM local time.

**Agent instructions:**
1. Run `pnpm outdated` and summarize available updates
2. List open Dependabot PRs that were not auto-merged (major bumps) with risk assessment
3. Run `pnpm audit` and flag new vulnerabilities since last run
4. Check if CLAUDE.md, AGENTS.md, and CONTRIBUTING.md are in sync with project state:
   - Are all `package.json` scripts documented?
   - Do documented file paths still exist?
   - Are technology versions accurate?
5. Create a GitHub issue titled `Weekly Health Report - YYYY-MM-DD` with findings, or close with "all clear"

### 3.5 Dependency Review trigger - dep-review.md

**Schedule:** On-demand (invoked by developer).

**Agent instructions:**
1. Accept a package name and target version as input
2. Search for changelog/release notes via web
3. Scan codebase for usage of changed/removed APIs
4. Produce a migration impact report:
   - Files that need changes (with line references)
   - Estimated risk (low/medium/high)
   - Recommended migration approach
   - Breaking changes that affect this project
5. Save report as a PR comment or local markdown file

### 3.6 Architecture Drift Review trigger - arch-review.md

**Schedule:** 1st and 15th of each month.

**Agent instructions (semantic checks beyond regex):**
1. Verify Zustand stores only hold UI state - no server-fetched data stored in Zustand
2. Verify all `entities/*/api/` functions parse responses through a Zod schema before returning
3. Check that `"use client"` boundaries are pushed as deep as possible - flag widgets or views marked `"use client"`
4. Verify Server Components do not use hooks, event handlers, or browser APIs
5. Check that Server Actions are in `actions/` files with `"use server"` directive
6. Produce a report with specific file:line references

---

## Layer 4: GitHub Copilot + AGENTS.md (Optional - Multi-AI Coordination)

### 4.1 .github/copilot/instructions.md

A concise (~2KB) directive file optimized for Copilot inline suggestion context. Derived from CLAUDE.md but formatted as short rules:

**Architecture rules:**
- Default to Server Components; only add `"use client"` when hooks/events are needed
- Import from `@/shared/ui`, never `@org/ui-kit` directly
- Use `cn()` from `@/shared/utils` for className composition
- FSD layers import downward only: `app > views > widgets > features > entities > shared`

**Code style:**
- Components: PascalCase functional components
- Server Actions: camelCase with `Action` suffix
- Files: kebab-case for non-components, PascalCase.tsx for components
- Named exports everywhere except Next.js page/layout (default exports)

**Security:**
- Validate external input with Zod at system boundaries
- Never use raw HTML injection without DOMPurify sanitization
- Secrets only in Server Components or Server Actions
- Client-safe env vars must use `NEXT_PUBLIC_` prefix

**State management:**
- Initial data: async Server Components (direct fetch)
- Mutations: Server Actions
- Client cache: TanStack Query with `HydrationBoundary`
- UI state only: Zustand (never store fetched data)

### 4.2 AGENTS.md

Multi-AI coordination document following Next.js 16.2 convention:

**Contents:**
- Project overview (one paragraph)
- Pointer to CLAUDE.md for full architectural context
- Pointer to `node_modules/next/dist/docs/` for Next.js API reference
- Quick-reference FSD layer rules (parseable by any AI)
- List of automated checks (so agents do not duplicate CI work):
  - CI: typecheck, lint, test
  - Architecture: FSD layers, adapter pattern, barrel exports
  - Security: CodeQL, pnpm audit, secret detection
  - Maintenance: Dependabot auto-merge, stale cleanup
- Instruction: "Do not bypass or disable these checks. If a check fails, fix the underlying issue."

---

## Downstream App Experience

### Zero-config inheritance

Forking furio-kit gives every downstream app:
- All GitHub Actions workflows
- Dependabot configuration
- PR template with architecture checklist
- CLAUDE.md, AGENTS.md, CONTRIBUTING.md
- Copilot instructions
- Claude Code hooks configuration
- Plop generators

### Customizable (opt-out)

Teams can override without breaking the system:
- `.claude/settings.local.json` - adjust hooks, permissions
- `biome.json` - add project-specific lint rules
- `.github/copilot/instructions.md` - append domain-specific rules
- `dependabot.yml` - change schedule, adjust PR limit
- Workflow files - add custom steps

### Non-negotiable (enforced at CI)

These block merge and require conscious deletion to bypass:
- FSD layer import violations
- Direct `@org/ui-kit` imports outside adapters
- Missing barrel exports
- TypeScript errors, lint failures, test failures
- High-severity audit findings

### Upgrade path

When furio-kit updates automation, downstream teams pull from upstream. Automation files are isolated from app code to minimize merge conflicts.

---

## Implementation Phases

**Phase 1 - GitHub Actions foundation:**
- `dependabot-auto.yml`
- `architecture-guard.yml`
- `stale.yml`

**Phase 2 - Multi-AI coordination:**
- `AGENTS.md`
- `.github/copilot/instructions.md`
- Update CLAUDE.md with hook/trigger references

**Phase 3 - Claude Code hooks:**
- `check-staged.sh` + PreCommit hook config
- `check-architecture.sh` + PrePush hook config
- Security reminder hooks
- Update `settings.local.json`

**Phase 4 - Claude Code triggers:**
- `weekly-health.md` trigger
- `dep-review.md` trigger
- `arch-review.md` trigger

Each phase is independently valuable. Phase 1 alone covers 80% of the maintenance burden.
