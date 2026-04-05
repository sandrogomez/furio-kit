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
