# Getting Started

Get a new app running from furio-kit in under five minutes: clone or degit the template, configure two environment variables, and hit `pnpm dev`.

---

## Prerequisites

| Requirement | Minimum version | Install |
|---|---|---|
| Node.js | 22 | [nodejs.org](https://nodejs.org) |
| pnpm | 10 | `npm install -g pnpm` |

Verify before proceeding:

```bash
node --version   # v22.x.x or higher
pnpm --version   # 10.x.x or higher
```

---

## Bootstrap

Pick one of three paths.

### Option A — degit (recommended)

Copies the template without the git history, so you start with a clean slate.

```bash
npx degit furiolabs/furio-kit my-app
cd my-app
git init && git add -A && git commit -m "chore: init from furio-kit"
```

### Option B — GitHub template

1. Open [furiolabs/furio-kit](https://github.com/furiolabs/furio-kit) on GitHub.
2. Click **Use this template** > **Create a new repository**.
3. Clone your new repository locally.

```bash
git clone https://github.com/<your-org>/my-app.git
cd my-app
```

### Option C — Manual clone

Clone and strip the upstream history yourself.

```bash
git clone https://github.com/furiolabs/furio-kit.git my-app
cd my-app
rm -rf .git
git init && git add -A && git commit -m "chore: init from furio-kit"
```

---

## Environment Setup

The repository ships with a `.env.example` file. Copy it to `.env.local` — Next.js loads this file automatically and never commits it.

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the two required variables:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_NAME` | App display name shown in the UI and browser tab |
| `NEXT_PUBLIC_API_URL` | Base URL for your backend REST API (e.g. `http://localhost:4000`) |

The auth variables (`AUTH_SECRET`, `AUTH0_*`, `PING_*`) are commented out. Leave them commented until you wire up an authentication provider. See [05-auth.md](./05-auth.md) for setup instructions.

> Never use the `NEXT_PUBLIC_` prefix for secrets. Variables without that prefix are server-only and are never included in the client bundle.

---

## First Run

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

The app opens at [http://localhost:3000](http://localhost:3000) with Turbopack for fast hot reloads.

**What you see out of the box:**

- A **home page** (`/`) with a user list rendered from the `entities/user` starter content.
- A **login page** (`/login`) wired to the `features/auth` stub.

Both are starter content — they demonstrate the FSD layer conventions and are meant to be replaced.

---

## Remove Starter Content

Once you understand the structure, delete the placeholder slices and replace them with your own domain.

```bash
# Remove the user entity (UI, API, types)
rm -rf src/entities/user

# Remove the auth feature stub (only if you are wiring real auth yourself)
rm -rf src/features/auth
```

Then update the screens that referenced them:

- `src/views/home/ui/HomePage.tsx` — remove the `UserList` import and replace with your own content.
- `app/page.tsx` — update if the top-level route delegate needs to change.

> Tip: `pnpm lint` will surface any broken imports after the deletion.

---

## Project Structure

```
app/                  Next.js App Router — layouts, route pages, error/loading boundaries
src/
  shared/             UI adapters, providers, Zustand store, utils, types, constants
  entities/           Business domain models — types, API calls, domain UI (Organisms)
  features/           User interactions — forms, Server Actions, client mutations
  widgets/            Self-contained page sections — Header, Sidebar, Dashboard panels
  views/              Full route screens composed from widgets and features
.github/              CI workflows, Dependabot config, Copilot instructions
.claude/              Claude Code hooks, triggers, and settings
docs/wiki/            This wiki
```

Imports flow **downward only**: `app` → `views` → `widgets` → `features` → `entities` → `shared`. Cross-slice imports at the same layer are forbidden.

---

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start the development server on port 3000 (Turbopack) |
| `pnpm build` | Compile a production build |
| `pnpm start` | Run the compiled production build |
| `pnpm lint` | Run Biome linter across the codebase |
| `pnpm format` | Run Biome formatter and write changes |
| `pnpm test` | Run the Vitest test suite once |
| `pnpm test:watch` | Run Vitest in interactive watch mode |
| `pnpm generate` | Run the Plop code generator to scaffold new slices |
| `pnpm audit` | Check npm dependencies for known vulnerabilities |

---

**Next:** [02-architecture.md](./02-architecture.md) — a deeper look at the FSD layer conventions and RSC rendering model.
