# ADR-007: CI Completeness — Production Build Step and Dependabot Guards

**Date:** 2026-05-22
**Status:** Proposed
**Priority:** High
**Deciders:** FurioLabs engineering team

---

## Context

Two gaps in the CI/CD pipeline can allow broken or insecure code to reach `main`:

### Gap 1: No production build in CI

`ci.yml` runs `tsc --noEmit`, `pnpm lint`, and `pnpm test`. It does not run `pnpm build`.

TypeScript passes `--noEmit` cleanly while the Next.js production build fails on:
- RSC boundary violations (importing a Server Component into a Client Component tree)
- Missing or circular barrel exports that Webpack/Turbopack can't resolve at build time
- Dynamic import errors
- `next/headers` called outside a Server Context

A passing CI does not guarantee a deployable artifact. This has been a recurring source of
"it worked in dev but broke in production" incidents in Next.js App Router projects.

### Gap 2: Dependabot auto-merge without branch protection

`dependabot-auto.yml` calls `gh pr merge --auto` for patch and minor version bumps.
The `--auto` flag triggers merge when required status checks pass. However, if the repository
has no branch protection rules enforced (required status checks not configured on `main`),
`--auto` merges immediately without waiting for CI.

This means a minor version bump can be merged before `ci.yml` completes, potentially
introducing a regression that bypasses the test suite.

---

## Decision

### Fix 1: Add `pnpm build` as a CI step

Add a `build` step to `ci.yml` after the existing steps:

```yaml
# .github/workflows/ci.yml  (addition)
      - name: Build
        run: pnpm build
        env:
          # Provide stub values so the build doesn't fail on missing env vars.
          # Real values are validated at runtime via instrumentation.ts (ADR-001).
          NEXT_PUBLIC_APP_NAME: furio-kit
          AUTH_PROVIDER: mock
          NEXT_PUBLIC_UI_KIT_CONNECTED: 'false'
```

The build step catches RSC boundary errors, missing exports, and bundling failures
that typecheck does not catch.

### Fix 2: Add branch protection documentation and a CI dependency in the auto-merge workflow

Add a branch protection prerequisite to the project's setup documentation and enforce
it programmatically in the auto-merge workflow:

```yaml
# .github/workflows/dependabot-auto.yml  (modification)
      - name: Wait for CI to pass before auto-merge
        if: >-
          steps.metadata.outputs.update-type == 'version-update:semver-patch' ||
          (steps.metadata.outputs.update-type == 'version-update:semver-minor'
           && !contains(github.event.pull_request.body, 'BREAKING'))
        run: |
          # gh pr merge --auto only merges when required checks pass.
          # This is only safe if branch protection requires the 'CI' and 'Build' checks.
          # See docs/wiki/08-ci-automation.md for branch protection setup.
          gh pr merge "$PR_URL" --auto --squash
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Add to `docs/wiki/08-ci-automation.md` a mandatory setup section:

```
## Required: Branch protection rules for `main`

Before the auto-merge workflow is safe, configure branch protection:

Settings → Branches → Branch protection rules → `main`:
  ✅ Require status checks to pass before merging
    ✅ Require branches to be up to date before merging
    Required checks:
      - Typecheck · Lint · Test (from ci.yml)
      - Build (from ci.yml)
      - FSD Architecture Checks (from architecture-guard.yml)
  ✅ Require a pull request before merging
  ✅ Do not allow bypassing the above settings
```

### Fix 3: Add a build cache to CI for performance

Production builds are slow. Cache `.next/cache` between runs:

```yaml
      - name: Cache Next.js build
        uses: actions/cache@v4
        with:
          path: .next/cache
          key: ${{ runner.os }}-nextjs-${{ hashFiles('pnpm-lock.yaml') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
          restore-keys: |
            ${{ runner.os }}-nextjs-${{ hashFiles('pnpm-lock.yaml') }}-
            ${{ runner.os }}-nextjs-
```

---

## Consequences

**Positive:**
- RSC boundary violations and bundling errors are caught before merging, not after deploying.
- The auto-merge path is safe only when all required CI checks pass.
- The build cache keeps CI time acceptable despite adding a full production build.

**Negative / trade-offs:**
- CI time increases. With the build cache, expect ~60–90s added on cache hits and
  ~3–5min on cache misses (cold build). This is an acceptable trade-off for correctness.
- Branch protection rules must be configured manually in GitHub Settings. This is a
  repository-level action that cannot be automated in the workflow files themselves
  (without admin API tokens). It must be documented as a required setup step.
- CI requires environment variable stubs for the build step. These must be kept in sync
  with the env schema defined in ADR-001. If a new required var is added to the schema
  without adding a stub to CI, the build step will fail — which is the desired behaviour.

---

## Implementation notes

- The build step should use `SKIP_ENV_VALIDATION=true` if the env validation added in
  ADR-001 uses `instrumentation.ts`, since `instrumentation.ts` runs at server start, not
  at build time. Build-time validation is a separate concern.
- Consider adding `pnpm build` to the pre-push hook (`.claude/hooks/check-architecture.sh`)
  for local safety. Note this adds ~30–60s to every push.
- If the org uses a monorepo (multiple apps in one repo), the build step should scope to
  the changed app rather than building all apps on every PR.

---

## Acceptance criteria

- [ ] `ci.yml` contains a `Build` step that runs `pnpm build`
- [ ] The Build step provides stub env vars so it doesn't fail on missing configuration
- [ ] `.next/cache` is cached between CI runs using `actions/cache`
- [ ] `docs/wiki/08-ci-automation.md` documents required branch protection rules for `main`
- [ ] `dependabot-auto.yml` comment references the branch protection requirement
- [ ] CI passes end-to-end (typecheck + lint + test + build) on a clean branch
