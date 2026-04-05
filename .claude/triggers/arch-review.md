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
