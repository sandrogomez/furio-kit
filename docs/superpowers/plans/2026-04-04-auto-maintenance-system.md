# Auto-Maintenance System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-layer automation system that keeps furio-kit secure, architecturally consistent, and easy to maintain for 1000+ downstream apps.

**Architecture:** 4 independent layers implemented in phases. Layer 1 (GitHub Actions) is the required foundation. Layer 2 (AGENTS.md + Copilot) is multi-AI coordination. Layer 3 (Claude Code hooks) is local dev automation. Layer 4 (Claude Code triggers) is scheduled maintenance agents. Each phase produces a working, testable increment.

**Tech Stack:** GitHub Actions, bash scripting, Claude Code hooks API (`PreToolUse`), Claude Code triggers (cron), GitHub Copilot custom instructions.

**Spec:** `docs/superpowers/specs/2026-04-04-auto-maintenance-system-design.md`

---

## Phase 1: GitHub Actions Foundation

### Task 1: Dependabot Auto-Merge Workflow

**Files:**
- Create: `.github/workflows/dependabot-auto.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Dependabot Auto-Merge

on: pull_request

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - name: Fetch Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Auto-merge patch updates
        if: steps.metadata.outputs.update-type == 'version-update:semver-patch'
        run: gh pr merge "$PR_URL" --auto --squash
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Auto-merge minor updates (no breaking changes)
        if: >-
          steps.metadata.outputs.update-type == 'version-update:semver-minor'
          && !contains(github.event.pull_request.body, 'BREAKING')
          && !contains(github.event.pull_request.body, 'breaking change')
          && !contains(github.event.pull_request.body, 'deprecated')
        run: gh pr merge "$PR_URL" --auto --squash
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Label major updates for review
        if: steps.metadata.outputs.update-type == 'version-update:semver-major'
        run: |
          gh pr edit "$PR_URL" --add-label "needs-review"
          gh pr comment "$PR_URL" --body "This is a **major version bump** (${{ steps.metadata.outputs.previous-version }} -> ${{ steps.metadata.outputs.new-version }}). Manual review required before merging."
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Validate the workflow YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/dependabot-auto.yml'))"`
Expected: No output (valid YAML)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/dependabot-auto.yml
git commit -m "ci: add Dependabot auto-merge workflow for patch/minor updates"
```

---

### Task 2: Architecture Guard Workflow

**Files:**
- Create: `.github/workflows/architecture-guard.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Architecture Guard

on:
  pull_request:
    branches: [main]
    paths:
      - 'src/**'

jobs:
  guard:
    name: FSD Architecture Check
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check FSD layer imports
        id: fsd
        run: |
          ERRORS=""

          # Define allowed imports per layer
          # shared: no imports from layers above
          # entities: only shared
          # features: entities, shared
          # widgets: features, entities, shared
          # views: widgets, features, entities, shared

          check_layer() {
            local layer="$1"
            shift
            local forbidden=("$@")

            while IFS= read -r file; do
              [ -z "$file" ] && continue
              for forbidden_layer in "${forbidden[@]}"; do
                # Match: from '@/features/...' or from '../features/...' etc.
                if grep -nE "from ['\"]@/${forbidden_layer}/|from ['\"]\.\..*/${forbidden_layer}/" "$file" 2>/dev/null; then
                  ERRORS="${ERRORS}LAYER VIOLATION: ${file} imports from '${forbidden_layer}' (forbidden for '${layer}' layer)\n"
                fi
              done
            done < <(find "src/${layer}" -name '*.ts' -o -name '*.tsx' 2>/dev/null)
          }

          check_layer "shared" "entities" "features" "widgets" "views"
          check_layer "entities" "features" "widgets" "views"
          check_layer "features" "widgets" "views"
          check_layer "widgets" "views"

          # Check cross-slice imports at same layer
          for layer in entities features widgets; do
            for slice_dir in src/${layer}/*/; do
              [ -d "$slice_dir" ] || continue
              slice=$(basename "$slice_dir")
              while IFS= read -r file; do
                [ -z "$file" ] && continue
                # Find imports from same layer but different slice
                while IFS= read -r match; do
                  [ -z "$match" ] && continue
                  imported_slice=$(echo "$match" | grep -oE "@/${layer}/[^/'\"]+" | sed "s|@/${layer}/||" || true)
                  if [ -n "$imported_slice" ] && [ "$imported_slice" != "$slice" ]; then
                    ERRORS="${ERRORS}CROSS-SLICE: ${file} imports from '${layer}/${imported_slice}' (same-layer cross-slice import)\n"
                  fi
                done < <(grep -nE "from ['\"]@/${layer}/" "$file" 2>/dev/null || true)
              done < <(find "$slice_dir" -name '*.ts' -o -name '*.tsx' 2>/dev/null)
            done
          done

          if [ -n "$ERRORS" ]; then
            echo "status=failure" >> "$GITHUB_OUTPUT"
            # Save errors for PR comment
            printf "%b" "$ERRORS" > /tmp/fsd-errors.txt
          else
            echo "status=success" >> "$GITHUB_OUTPUT"
          fi

      - name: Check adapter pattern
        id: adapter
        run: |
          ERRORS=""
          # Find @org/ui-kit imports outside src/shared/ui/
          while IFS= read -r match; do
            [ -z "$match" ] && continue
            ERRORS="${ERRORS}ADAPTER VIOLATION: ${match}\n"
          done < <(grep -rnE "from ['\"]@org/ui-kit['\"]" src/ --include='*.ts' --include='*.tsx' | grep -v "src/shared/ui/" || true)

          if [ -n "$ERRORS" ]; then
            echo "status=failure" >> "$GITHUB_OUTPUT"
            printf "%b" "$ERRORS" > /tmp/adapter-errors.txt
          else
            echo "status=success" >> "$GITHUB_OUTPUT"
          fi

      - name: Check barrel exports
        id: barrel
        run: |
          ERRORS=""
          for layer in entities features widgets; do
            for slice_dir in src/${layer}/*/; do
              [ -d "$slice_dir" ] || continue
              if [ ! -f "${slice_dir}index.ts" ]; then
                ERRORS="${ERRORS}MISSING BARREL: ${slice_dir} has no index.ts\n"
              fi
            done
          done

          if [ -n "$ERRORS" ]; then
            echo "status=failure" >> "$GITHUB_OUTPUT"
            printf "%b" "$ERRORS" > /tmp/barrel-errors.txt
          else
            echo "status=success" >> "$GITHUB_OUTPUT"
          fi

      - name: Check deep imports
        id: deep
        run: |
          ERRORS=""
          for layer in entities features widgets; do
            # Find imports that go deeper than the slice root (e.g., entities/user/api/...)
            while IFS= read -r match; do
              [ -z "$match" ] && continue
              # Check if import path has more than 2 segments after @/layer/ (e.g., @/entities/user/api)
              import_path=$(echo "$match" | grep -oE "@/${layer}/[^'\"]*" || true)
              if [ -n "$import_path" ]; then
                segments=$(echo "$import_path" | tr '/' '\n' | wc -l)
                # @/entities/user = 3 segments (ok), @/entities/user/api = 4 segments (deep)
                if [ "$segments" -gt 3 ]; then
                  ERRORS="${ERRORS}DEEP IMPORT: ${match}\n"
                fi
              fi
            done < <(grep -rnE "from ['\"]@/${layer}/[^'\"]+/[^'\"]+['\"]" src/ --include='*.ts' --include='*.tsx' | grep -v "src/${layer}/" || true)
          done

          if [ -n "$ERRORS" ]; then
            echo "status=failure" >> "$GITHUB_OUTPUT"
            printf "%b" "$ERRORS" > /tmp/deep-errors.txt
          else
            echo "status=success" >> "$GITHUB_OUTPUT"
          fi

      - name: Post results comment
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const checks = [
              { name: 'FSD Layer Imports', id: 'fsd', file: '/tmp/fsd-errors.txt' },
              { name: 'Adapter Pattern', id: 'adapter', file: '/tmp/adapter-errors.txt' },
              { name: 'Barrel Exports', id: 'barrel', file: '/tmp/barrel-errors.txt' },
              { name: 'Deep Imports', id: 'deep', file: '/tmp/deep-errors.txt' },
            ];

            let body = '## Architecture Guard Results\n\n';
            let hasFailures = false;

            for (const check of checks) {
              const status = '${{ steps[check.id].outputs.status }}' === 'failure' ? 'failure' :
                             context.payload.pull_request ?
                             (fs.existsSync(check.file) ? 'failure' : 'success') : 'success';

              let errors = '';
              try { errors = fs.readFileSync(check.file, 'utf8'); } catch {}

              if (errors) {
                hasFailures = true;
                body += `### ${check.name}\n\n\`\`\`\n${errors}\`\`\`\n\n`;
              } else {
                body += `### ${check.name}\n\nPassed\n\n`;
              }
            }

            if (hasFailures) {
              body += '---\nPlease fix the violations above before merging.';
            }

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const botComment = comments.find(c => c.body.includes('Architecture Guard Results'));

            if (botComment) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: botComment.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }

      - name: Fail if violations found
        if: >-
          steps.fsd.outputs.status == 'failure' ||
          steps.adapter.outputs.status == 'failure' ||
          steps.barrel.outputs.status == 'failure' ||
          steps.deep.outputs.status == 'failure'
        run: |
          echo "Architecture violations found. See PR comment for details."
          exit 1
```

- [ ] **Step 2: Validate the workflow YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/architecture-guard.yml'))"`
Expected: No output (valid YAML)

- [ ] **Step 3: Test the checks locally against the current codebase**

Run the FSD layer check inline to verify it passes on the existing code:

```bash
# Verify no false positives on current codebase
grep -rnE "from ['\"]@org/ui-kit['\"]" src/ --include='*.ts' --include='*.tsx' | grep -v "src/shared/ui/" || echo "Adapter check: PASS"

for layer in entities features widgets; do
  for slice_dir in src/${layer}/*/; do
    [ -d "$slice_dir" ] || continue
    if [ ! -f "${slice_dir}index.ts" ]; then
      echo "MISSING BARREL: ${slice_dir}"
    fi
  done
done && echo "Barrel check: PASS"
```

Expected: Both checks PASS with no violations on current codebase.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/architecture-guard.yml
git commit -m "ci: add architecture guard workflow for FSD layer enforcement"
```

---

### Task 3: Stale PR/Issue Cleanup Workflow

**Files:**
- Create: `.github/workflows/stale.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Stale

on:
  schedule:
    - cron: '0 6 * * *' # daily at 06:00 UTC

permissions:
  issues: write
  pull-requests: write

jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/stale@v9
        with:
          days-before-stale: 14
          days-before-close: 7
          stale-pr-label: stale
          stale-issue-label: stale
          exempt-pr-labels: keep-open,work-in-progress,needs-review
          exempt-issue-labels: keep-open,work-in-progress
          stale-pr-message: >
            This PR has been inactive for 14 days and has been marked as stale.
            It will be closed in 7 days if there is no further activity.
            Remove the `stale` label or comment to keep it open.
          stale-issue-message: >
            This issue has been inactive for 14 days and has been marked as stale.
            It will be closed in 7 days if there is no further activity.
            Remove the `stale` label or comment to keep it open.
          close-pr-message: >
            This PR has been closed due to inactivity. Feel free to reopen it
            if you'd like to continue working on it.
          close-issue-message: >
            This issue has been closed due to inactivity. Feel free to reopen it
            if it's still relevant.
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/stale.yml'))"`
Expected: No output (valid YAML)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/stale.yml
git commit -m "ci: add stale workflow for automatic PR/issue cleanup"
```

---

## Phase 2: Multi-AI Coordination

### Task 4: AGENTS.md

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Create AGENTS.md**

```markdown
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
| Architecture Guard | `architecture-guard.yml` | FSD layers, adapter pattern, barrel exports, no deep imports |
| Vulnerability Audit | `audit.yml` | `pnpm audit --audit-level=high` |
| CodeQL | `codeql.yml` | Security analysis for JS/TS |
| Dependabot | `dependabot.yml` | Weekly dependency updates |
| Stale | `stale.yml` | Auto-close inactive PRs/issues |

## Code Style

- Components: `PascalCase` functional components
- Server Actions: `camelCase` with `Action` suffix (e.g., `loginAction`)
- Files: `kebab-case` for non-components, `PascalCase.tsx` for components
- Named exports everywhere except Next.js `page.tsx` / `layout.tsx` (default exports)
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add AGENTS.md for multi-AI assistant coordination"
```

---

### Task 5: GitHub Copilot Custom Instructions

**Files:**
- Create: `.github/copilot/instructions.md`

- [ ] **Step 1: Create the Copilot instructions directory and file**

```bash
mkdir -p .github/copilot
```

Write `.github/copilot/instructions.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add .github/copilot/instructions.md
git commit -m "docs: add GitHub Copilot custom instructions"
```

---

### Task 6: Update CLAUDE.md with Automation References

**Files:**
- Modify: `CLAUDE.md` (append section at the end)

- [ ] **Step 1: Append automation section to CLAUDE.md**

Add the following section at the end of `CLAUDE.md`:

```markdown

## Automation & Maintenance

### GitHub Actions (required — runs on every PR)

| Workflow | Purpose |
|---|---|
| `ci.yml` | Typecheck, lint, test |
| `audit.yml` | Weekly vulnerability scan (`pnpm audit --audit-level=high`) |
| `codeql.yml` | CodeQL security analysis |
| `architecture-guard.yml` | FSD layer imports, adapter pattern, barrel exports, deep imports |
| `dependabot-auto.yml` | Auto-merge patch/minor Dependabot PRs; labels major bumps `needs-review` |
| `stale.yml` | Auto-close inactive PRs (14 days stale + 7 days to close) |

### Claude Code Hooks (optional — active when Claude Code is installed)

Configured in `.claude/settings.json`. These fire during Claude Code sessions:

| Hook | Event | Purpose |
|---|---|---|
| `check-staged.sh` | Pre-commit (`git commit`) | Lint staged files, block debug/credential commits |
| `check-architecture.sh` | Pre-push (`git push`) | Local FSD + adapter checks before CI |
| `security-reminder.sh` | File edit (`Edit`/`Write`) | Context-aware reminders for proxy.ts, API files, .env |

### Claude Code Triggers (optional — requires Claude Max)

| Trigger | Schedule | Purpose |
|---|---|---|
| `weekly-health.md` | Every Monday 9:00 AM | Dep updates, audit diff, doc sync check |
| `dep-review.md` | On-demand | Migration impact analysis for major version bumps |
| `arch-review.md` | 1st and 15th monthly | Semantic architecture drift detection |

### Multi-AI Coordination

- `AGENTS.md` — instructions for all AI coding assistants
- `.github/copilot/instructions.md` — GitHub Copilot custom instructions
- Both derive from this `CLAUDE.md` as the source of truth
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add automation and maintenance references to CLAUDE.md"
```

---

## Phase 3: Claude Code Hooks

### Task 7: Pre-commit Hook Script

**Files:**
- Create: `.claude/hooks/check-staged.sh`

- [ ] **Step 1: Create the hooks directory**

```bash
mkdir -p .claude/hooks
```

- [ ] **Step 2: Create the pre-commit hook script**

Write `.claude/hooks/check-staged.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Pre-commit hook for Claude Code
# Fires on PreToolUse when Claude runs "git commit"
# Exit 0 = allow, Exit 2 = block (stderr shown to Claude)

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

ERRORS=""

# Check 1: Lint staged files with Biome
LINTABLE=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx|js|jsx)$' || true)
if [ -n "$LINTABLE" ]; then
  LINT_OUTPUT=$(echo "$LINTABLE" | xargs npx biome lint 2>&1) || {
    ERRORS="${ERRORS}Biome lint errors found in staged files:\n${LINT_OUTPUT}\n\n"
  }
fi

# Check 2: Debug statements
for file in $STAGED_FILES; do
  if [[ "$file" =~ \.(ts|tsx|js|jsx)$ ]]; then
    if git show ":${file}" 2>/dev/null | grep -nE '^\s*(console\.log|debugger|TODO\(hack\))' > /dev/null 2>&1; then
      MATCHES=$(git show ":${file}" | grep -nE '^\s*(console\.log|debugger|TODO\(hack\))')
      ERRORS="${ERRORS}Debug/hack statements in ${file}:\n${MATCHES}\n\n"
    fi
  fi
done

# Check 3: Credential/secret files
for file in $STAGED_FILES; do
  case "$file" in
    .env|.env.local|.env.production|.env.development)
      ERRORS="${ERRORS}Blocked: ${file} is an environment file and should not be committed.\n\n"
      ;;
    *credential*|*secret*|*.pem|*.key)
      ERRORS="${ERRORS}Blocked: ${file} appears to contain credentials or secrets.\n\n"
      ;;
  esac
done

if [ -n "$ERRORS" ]; then
  printf "%b" "$ERRORS" >&2
  exit 2
fi

exit 0
```

- [ ] **Step 3: Make the script executable**

```bash
chmod +x .claude/hooks/check-staged.sh
```

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/check-staged.sh
git commit -m "feat: add Claude Code pre-commit hook for staged file validation"
```

---

### Task 8: Pre-push Architecture Hook Script

**Files:**
- Create: `.claude/hooks/check-architecture.sh`

- [ ] **Step 1: Create the pre-push hook script**

Write `.claude/hooks/check-architecture.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Pre-push hook for Claude Code
# Fires on PreToolUse when Claude runs "git push"
# Runs FSD layer + adapter checks on changed files vs main
# Exit 0 = allow, Exit 2 = block

CHANGED_FILES=$(git diff --name-only main...HEAD -- 'src/' 2>/dev/null || true)

if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

ERRORS=""

# Define FSD layer hierarchy (index = priority, lower = deeper)
declare -A LAYER_LEVEL
LAYER_LEVEL[shared]=0
LAYER_LEVEL[entities]=1
LAYER_LEVEL[features]=2
LAYER_LEVEL[widgets]=3
LAYER_LEVEL[views]=4

# Check 1: FSD layer violations
for file in $CHANGED_FILES; do
  [[ "$file" =~ \.(ts|tsx)$ ]] || continue
  [ -f "$file" ] || continue

  # Determine which layer this file belongs to
  FILE_LAYER=""
  for layer in shared entities features widgets views; do
    if [[ "$file" == src/${layer}/* ]]; then
      FILE_LAYER="$layer"
      break
    fi
  done
  [ -z "$FILE_LAYER" ] && continue

  FILE_LEVEL=${LAYER_LEVEL[$FILE_LAYER]}

  # Check each import in the file
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    for target_layer in shared entities features widgets views; do
      if echo "$line" | grep -qE "@/${target_layer}/"; then
        TARGET_LEVEL=${LAYER_LEVEL[$target_layer]}
        if [ "$TARGET_LEVEL" -ge "$FILE_LEVEL" ] && [ "$target_layer" != "$FILE_LAYER" ]; then
          ERRORS="${ERRORS}LAYER VIOLATION: ${file} (${FILE_LAYER}) imports from '${target_layer}'\n"
        fi
      fi
    done
  done < <(grep -E "from ['\"]@/" "$file" 2>/dev/null || true)
done

# Check 2: Adapter pattern - no @org/ui-kit outside shared/ui
for file in $CHANGED_FILES; do
  [[ "$file" =~ \.(ts|tsx)$ ]] || continue
  [[ "$file" == src/shared/ui/* ]] && continue
  [ -f "$file" ] || continue

  if grep -qE "from ['\"]@org/ui-kit['\"]" "$file" 2>/dev/null; then
    ERRORS="${ERRORS}ADAPTER VIOLATION: ${file} imports directly from @org/ui-kit\n"
  fi
done

# Check 3: Barrel exports
for layer in entities features widgets; do
  for slice_dir in src/${layer}/*/; do
    [ -d "$slice_dir" ] || continue
    if [ ! -f "${slice_dir}index.ts" ]; then
      ERRORS="${ERRORS}MISSING BARREL: ${slice_dir} has no index.ts\n"
    fi
  done
done

if [ -n "$ERRORS" ]; then
  printf "Architecture violations found. Fix before pushing:\n\n%b" "$ERRORS" >&2
  exit 2
fi

exit 0
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x .claude/hooks/check-architecture.sh
```

- [ ] **Step 3: Test locally against the current codebase**

```bash
.claude/hooks/check-architecture.sh
echo "Exit code: $?"
```

Expected: Exit code 0 (no violations in current codebase).

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/check-architecture.sh
git commit -m "feat: add Claude Code pre-push hook for architecture validation"
```

---

### Task 9: Security Reminder Hook Script

**Files:**
- Create: `.claude/hooks/security-reminder.sh`

- [ ] **Step 1: Create the security reminder hook script**

Write `.claude/hooks/security-reminder.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Security reminder hook for Claude Code
# Fires on PreToolUse when Claude uses Edit or Write
# Reads tool_input from stdin, prints reminders to stdout (exit 0)
# Reminders are added to Claude's context

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null || true)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Check proxy.ts / middleware.ts - auth bypass risks
if [[ "$FILE_PATH" == */proxy.ts ]] || [[ "$FILE_PATH" == */middleware.ts ]]; then
  echo "SECURITY REMINDER: You are editing authentication middleware."
  echo "- Ensure no routes are accidentally unprotected"
  echo "- Validate that session checks cannot be bypassed"
  echo "- Do not expose auth tokens in responses"
  echo "- Test both authenticated and unauthenticated paths"
  exit 0
fi

# Check entities/*/api/* - Zod validation requirement
if [[ "$FILE_PATH" == */entities/*/api/* ]]; then
  echo "SECURITY REMINDER: You are editing a data-fetching function."
  echo "- All API responses MUST be parsed through a Zod schema before returning"
  echo "- Do not trust external data without validation"
  echo "- Example: const users = UserSchema.array().parse(response.data)"
  exit 0
fi

# Check .env files - secret exposure
if [[ "$FILE_PATH" == *.env* ]]; then
  echo "SECURITY REMINDER: You are editing an environment file."
  echo "- Never prefix secrets with NEXT_PUBLIC_ (exposes them to the client bundle)"
  echo "- Auth secrets should only be accessed in Server Components or Server Actions"
  echo "- This file should NOT be committed to git (check .gitignore)"
  exit 0
fi

exit 0
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x .claude/hooks/security-reminder.sh
```

- [ ] **Step 3: Test the script with sample inputs**

```bash
echo '{"tool_input":{"file_path":"src/entities/user/api/get-users.ts"}}' | .claude/hooks/security-reminder.sh
```

Expected: Prints Zod validation reminder.

```bash
echo '{"tool_input":{"file_path":"proxy.ts"}}' | .claude/hooks/security-reminder.sh
```

Expected: Prints auth middleware reminder.

```bash
echo '{"tool_input":{"file_path":"src/shared/ui/Button/Button.tsx"}}' | .claude/hooks/security-reminder.sh
```

Expected: No output (no reminder needed).

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/security-reminder.sh
git commit -m "feat: add Claude Code security reminder hook for sensitive file edits"
```

---

### Task 10: Claude Code Settings with Hook Configuration

**Files:**
- Create: `.claude/settings.json`

- [ ] **Step 1: Create the project-level settings.json with hooks**

Write `.claude/settings.json`:

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

- [ ] **Step 2: Verify JSON is valid**

```bash
python3 -c "import json; json.load(open('.claude/settings.json')); print('Valid JSON')"
```

Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "feat: add Claude Code project hooks configuration"
```

---

## Phase 4: Claude Code Triggers

### Task 11: Weekly Health Check Trigger

**Files:**
- Create: `.claude/triggers/weekly-health.md`

- [ ] **Step 1: Create the triggers directory**

```bash
mkdir -p .claude/triggers
```

- [ ] **Step 2: Create the weekly health trigger**

Write `.claude/triggers/weekly-health.md`:

```markdown
---
schedule: "0 9 * * 1"
description: "Weekly repository health check"
---

# Weekly Health Check

You are a maintenance agent for furio-kit. Run the following checks and produce a health report.

## Steps

1. **Dependency updates:** Run `pnpm outdated` and list packages with available updates. Group by severity (patch, minor, major).

2. **Open Dependabot PRs:** Run `gh pr list --author "dependabot[bot]" --state open` and list any PRs that weren't auto-merged. For each, explain why it might need manual review (likely a major bump).

3. **Security audit:** Run `pnpm audit` and report any new vulnerabilities. Compare against the most recent Weekly Health Report issue to identify what's new.

4. **Documentation sync:** Check that these files are accurate:
   - `CLAUDE.md`: Do all documented scripts in the Commands section match `package.json` scripts? Do documented file paths still exist?
   - `AGENTS.md`: Does the automated checks table match the actual workflow files in `.github/workflows/`?
   - `CONTRIBUTING.md`: Are generator commands still accurate?
   - `package.json` version ranges: Do they match what's actually installed in `pnpm-lock.yaml`?

5. **Report:** Create a GitHub issue with:
   - Title: `Weekly Health Report - YYYY-MM-DD`
   - Label: `maintenance`
   - Body: findings from steps 1-4, organized by section
   - If everything is clean, still create the issue but note "All clear - no action needed"

Use `gh issue create` to create the report.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/triggers/weekly-health.md
git commit -m "feat: add weekly health check Claude Code trigger"
```

---

### Task 12: Dependency Review Trigger

**Files:**
- Create: `.claude/triggers/dep-review.md`

- [ ] **Step 1: Create the dependency review trigger**

Write `.claude/triggers/dep-review.md`:

```markdown
---
schedule: null
description: "On-demand dependency migration impact analysis"
---

# Dependency Review

You are a migration analyst for furio-kit. The developer will provide a package name and target version.

## Steps

1. **Changelog research:** Search the web for the package's changelog or release notes for the target version. Identify:
   - Breaking changes
   - Deprecated APIs
   - New features relevant to this project
   - Migration guide (if published)

2. **Usage scan:** Search the codebase for all imports and usages of the package. For each file:
   - List the specific APIs/functions used
   - Check if any are deprecated or changed in the target version
   - Note the file path and line numbers

3. **Impact assessment:** For each breaking change found:
   - Which files need modification?
   - What's the specific code change needed?
   - Risk level: low (simple rename), medium (API change), high (architectural change)

4. **Report:** Produce a markdown report with:
   - Package: name@current -> name@target
   - Summary: one paragraph overview
   - Breaking changes affecting this project (with file:line references)
   - Migration steps in order
   - Estimated risk: low / medium / high
   - Recommendation: upgrade now, wait, or skip

Save the report to `docs/dep-reviews/YYYY-MM-DD-<package-name>.md`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/triggers/dep-review.md
git commit -m "feat: add on-demand dependency review Claude Code trigger"
```

---

### Task 13: Architecture Drift Review Trigger

**Files:**
- Create: `.claude/triggers/arch-review.md`

- [ ] **Step 1: Create the architecture drift review trigger**

Write `.claude/triggers/arch-review.md`:

```markdown
---
schedule: "0 9 1,15 * *"
description: "Biweekly semantic architecture drift detection"
---

# Architecture Drift Review

You are an architecture reviewer for furio-kit. Perform semantic checks that go beyond what regex-based CI can catch.

## Steps

1. **Zustand state audit:** Read all files in `src/shared/model/` and any file importing from `zustand`. Verify that Zustand stores only contain UI state (sidebar open, theme, modal visibility, etc.). Flag any store that holds server-fetched data (user profiles, API responses, entity lists).

2. **Zod validation audit:** Read all files in `src/entities/*/api/`. For each data-fetching function, verify it parses the response through a Zod schema before returning. Flag any function that returns raw API data without `.parse()` or `.safeParse()`.

3. **Client boundary audit:** Search for `"use client"` directives. Flag any file in `src/widgets/` or `src/views/` that is marked `"use client"` — these should be Server Components. The `"use client"` boundary should be pushed down to `src/features/` or `src/shared/ui/` level.

4. **Server Component audit:** For any file NOT marked `"use client"`, check that it does not use:
   - React hooks (`useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`, `useContext`)
   - Event handlers (`onClick`, `onChange`, `onSubmit`, etc.)
   - Browser APIs (`window`, `document`, `localStorage`)

5. **Server Action audit:** Search for `"use server"` directives. Verify they are in files under `actions/` directories and that the functions follow the `camelCaseAction` naming convention.

6. **Report:** Create a GitHub issue with:
   - Title: `Architecture Review - YYYY-MM-DD`
   - Label: `architecture`
   - Body: findings organized by check, with file:line references
   - If everything passes, note "Architecture is clean - no drift detected"

Use `gh issue create` to create the report.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/triggers/arch-review.md
git commit -m "feat: add biweekly architecture drift review Claude Code trigger"
```

---

## Phase 5: Final Validation

### Task 14: Validate All Files and Run Full CI Suite

**Files:**
- All files created in Tasks 1-13

- [ ] **Step 1: Validate all YAML workflows**

```bash
for f in .github/workflows/*.yml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "PASS: $f" || echo "FAIL: $f"
done
```

Expected: All files PASS.

- [ ] **Step 2: Validate JSON config**

```bash
python3 -c "import json; json.load(open('.claude/settings.json')); print('PASS: settings.json')"
```

Expected: `PASS: settings.json`

- [ ] **Step 3: Verify all hook scripts are executable**

```bash
ls -la .claude/hooks/*.sh
```

Expected: All three scripts have `x` permission.

- [ ] **Step 4: Test hook scripts don't break on current codebase**

```bash
.claude/hooks/check-architecture.sh && echo "architecture: PASS"
echo '{"tool_input":{"file_path":"src/shared/ui/Button.tsx"}}' | .claude/hooks/security-reminder.sh && echo "security-reminder: PASS"
```

Expected: Both PASS.

- [ ] **Step 5: Run full CI suite locally**

```bash
pnpm tsc --noEmit && echo "typecheck: PASS"
pnpm lint && echo "lint: PASS"
pnpm test && echo "test: PASS"
pnpm build && echo "build: PASS"
```

Expected: All four PASS.

- [ ] **Step 6: Verify file tree matches spec**

```bash
echo "=== New GitHub workflows ==="
ls .github/workflows/dependabot-auto.yml .github/workflows/architecture-guard.yml .github/workflows/stale.yml

echo "=== Copilot instructions ==="
ls .github/copilot/instructions.md

echo "=== Claude hooks ==="
ls .claude/hooks/check-staged.sh .claude/hooks/check-architecture.sh .claude/hooks/security-reminder.sh

echo "=== Claude settings ==="
ls .claude/settings.json

echo "=== Claude triggers ==="
ls .claude/triggers/weekly-health.md .claude/triggers/dep-review.md .claude/triggers/arch-review.md

echo "=== Root docs ==="
ls AGENTS.md
```

Expected: All files exist.

- [ ] **Step 7: Final commit if any uncommitted changes remain**

```bash
git status
# If clean: done
# If changes: git add -A && git commit -m "chore: final validation fixes"
```
