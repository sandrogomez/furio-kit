# furio-kit

Enterprise React boilerplate by FurioLabs. Built on Next.js 16 App Router with React Server Components, Feature-Sliced Design, and a pluggable `@org/ui-kit` design system adapter.

## Bootstrap a new project

```bash
npx degit sandrogomez/furio-kit my-app
cd my-app
cp .env.example .env.local
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Tip:** Enable "Template repository" in GitHub settings to allow one-click forks from the GitHub UI.

## Requirements

- Node.js 22+
- pnpm 10+

## Starter content (delete when you begin)

furio-kit ships with a working `user` entity as a reference implementation. It demonstrates the complete FSD pattern — Zod schema, fetch function, Server Component, tests, and Suspense streaming.

**Before building your app, remove it:**

```bash
rm -rf src/entities/user
rm -rf src/features/auth    # if you're wiring a real auth provider instead
```

Then update `src/views/home/ui/HomePage.tsx` and `app/page.tsx` to point to your own content.

Everything else (providers, adapters, auth scaffolding, generators) stays.

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm start` | Start production server (requires `pnpm build` first) |
| `pnpm lint` | Lint with Biome |
| `pnpm format` | Format with Biome |
| `pnpm test` | Run tests with Vitest |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm tsc --noEmit` | TypeScript typecheck |
| `pnpm generate` | Scaffold a new entity, feature, or widget slice |
| `pnpm audit` | Check for vulnerable dependencies |

## Connecting your design system

This boilerplate expects a `@org/ui-kit` package from your organization. Until it is installed, adapter components in `src/shared/ui/` use Tailwind-based placeholders.

To connect your design system:

1. Install your package:
   ```bash
   pnpm add @your-org/ui-kit
   ```

2. Update each adapter in `src/shared/ui/` to import from your package instead of the placeholder implementation. Each adapter file contains a comment showing the exact replacement.

## Auth

Auth scaffolding lives in `src/shared/auth/`. The default adapter returns `null` (unauthenticated). To activate a real provider:

1. Open `src/shared/auth/index.ts`
2. Swap the one import line to `auth0Adapter` or `pingAdapter`
3. Set the required env vars (see `.env.example` and the adapter file)

## Security

Vulnerability scanning runs automatically on every push and PR via GitHub Actions (`.github/workflows/ci.yml`). Dependabot opens weekly PRs to keep dependencies current (`.github/dependabot.yml`).

To audit locally:

```bash
pnpm audit
pnpm audit --fix   # auto-fix where possible
```

## Documentation

- **[Wiki](./docs/wiki/home.md)** — step-by-step guides for building on furio-kit
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — PR workflow and development setup
- **[CLAUDE.md](./CLAUDE.md)** — full technical reference for AI assistants

## Maintainer setup (one-time)

If you are setting up furio-kit as the canonical template:

1. **GitHub → Settings → check "Template repository"** — enables the "Use this template" button
2. **Branch protection on `main`** — require PR, require CI (`ci.yml`) to pass, no direct push
3. Contributors use worktrees — see [CONTRIBUTING.md](./CONTRIBUTING.md)
