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
