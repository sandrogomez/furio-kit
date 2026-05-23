# Architecture Decision Records

This directory captures architectural decisions for `furio-kit` that are **proposed but not yet implemented**.
Each ADR was derived from a full architectural review conducted on 2026-05-22.

## Status legend

| Status | Meaning |
|---|---|
| **Done** | Decision identified, not yet implemented |
| **Accepted** | Agreed upon, implementation in progress |
| **Done** | Fully implemented and verified |
| **Rejected** | Consciously ruled out — reason documented |
| **Superseded** | Replaced by a later ADR |

## Index

| ADR | Title | Status | Priority |
|---|---|---|---|
| [001](001-security-baseline.md) | Security Baseline: Middleware, Headers, Env Validation, Mock Guard | Done | Critical |
| [002](002-rbac-enforcement.md) | RBAC Enforcement Pattern | Done | High |
| [003](003-provider-scoping.md) | Provider Scoping: Move Providers Out of Root Layout | Done | High |
| [004](004-per-slice-state.md) | Per-Slice Zustand State Pattern | Done | Medium |
| [005](005-design-system-adapter-enforcement.md) | Design System Adapter: Fail-Loud Stubs and CI Verification | Done | Medium |
| [006](006-observability-foundation.md) | Observability Foundation: Request IDs, Structured Logging, Error Tracking | Done | Medium |
| [007](007-ci-completeness.md) | CI Completeness: Production Build and Dependabot Guards | Done | High |
| [008](008-internationalisation.md) | Internationalisation Foundation | Done | Low |

## Review context

These ADRs address gaps identified in a deep architectural review of furio-kit against three
enterprise requirements: standardisation across all frontends, reduction of browser-side
dependency and JavaScript fragmentation, and scalability and security at the corporate level.

The existing architecture (FSD + RSC-first + Zod at boundaries + CI-enforced layer rules) was
assessed as sound. All ADRs below are additions or corrections, not replacements.
