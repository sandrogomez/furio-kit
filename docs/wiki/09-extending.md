# Extending the Template

furio-kit is designed to be forked and customized. This guide covers how to extend generators, automation, and tooling without undermining the architectural guarantees that make the template worth using in the first place.

---

## 1. Adding a New Plop Generator

Plop generators live in `plopfile.mjs` at the project root. A generator has three parts: a description, a list of prompts, and a list of actions that produce files from Handlebars templates.

The existing generators — `entity`, `feature`, and `widget` — follow the same structure. Use them as a reference.

### Generator structure

```js
plop.setGenerator('generator-name', {
  description: 'One-line description shown in the picker',
  prompts: [
    {
      type: 'input',
      name: 'name',
      message: 'Prompt shown to the developer:',
      validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || 'Use kebab-case',
    },
  ],
  actions: [
    {
      type: 'add',
      path: 'path/to/output/{{name}}.ts',
      templateFile: 'plop-templates/your-template/file.ts.hbs',
    },
  ],
})
```

Plop provides built-in case helpers: `{{pascalCase name}}`, `{{camelCase name}}`, `{{kebabCase name}}`. The `plopfile.mjs` also registers `{{upperFirst name}}` as a custom helper.

### Example: a "page" generator

The built-in generators operate at a single FSD layer. A page generator is more useful because it spans two layers at once: it creates a `views/` screen and wires it to a Next.js `app/` route.

Add this generator to `plopfile.mjs` after the existing ones:

```js
plop.setGenerator('page', {
  description: 'Create a view + app route together',
  prompts: [
    {
      type: 'input',
      name: 'name',
      message: 'Page name (kebab-case, e.g. user-profile):',
      validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || 'Use kebab-case (e.g. user-profile)',
    },
  ],
  actions: [
    // The view component
    {
      type: 'add',
      path: 'src/views/{{name}}/ui/{{pascalCase name}}View.tsx',
      templateFile: 'plop-templates/page/ui/View.tsx.hbs',
    },
    // The view barrel
    {
      type: 'add',
      path: 'src/views/{{name}}/index.ts',
      templateFile: 'plop-templates/page/index.ts.hbs',
    },
    // The Next.js route
    {
      type: 'add',
      path: 'app/{{name}}/page.tsx',
      templateFile: 'plop-templates/page/app/page.tsx.hbs',
    },
  ],
})
```

Then create the Handlebars templates under `plop-templates/page/`. Study the existing templates in `plop-templates/entity/`, `plop-templates/feature/`, and `plop-templates/widget/` to understand the conventions — they follow the same RSC-by-default pattern documented in the architecture guide.

Run the generator with:

```bash
pnpm plop page
```

---

## 2. Adding a New GitHub Actions Workflow

Create a YAML file in `.github/workflows/`. The three existing workflows (`ci.yml`, `audit.yml`, `codeql.yml`) all follow the same setup block — copy it exactly so Node and pnpm are configured consistently across the repo.

### Standard setup block

```yaml
- uses: actions/checkout@v4

- uses: pnpm/action-setup@v4

- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: pnpm

- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

Always pin actions to `@v4`. Do not use `@latest` — it makes builds non-deterministic.

### Env vars in run blocks

GitHub Actions evaluates `${{ }}` expressions before the shell sees the command. This can expose secrets in logs when the expression appears inside a `run:` block. Always assign `${{ }}` values to an `env:` key and reference them as shell variables instead:

```yaml
# Correct
- name: Notify on failure
  if: failure()
  run: curl -s -X POST "$WEBHOOK_URL" -d "Build failed"
  env:
    WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

# Incorrect — secrets can appear in runner logs
- name: Notify on failure
  if: failure()
  run: curl -s -X POST "${{ secrets.SLACK_WEBHOOK }}" -d "Build failed"
```

### Example: a performance budget workflow

```yaml
name: Performance

on:
  pull_request:
    branches: [main]

jobs:
  perf:
    name: Bundle size check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Check bundle size
        run: node scripts/check-bundle-size.mjs
        env:
          SIZE_LIMIT_KB: ${{ vars.BUNDLE_SIZE_LIMIT_KB }}
```

---

## 3. Adding a New Claude Code Hook

Hooks let you run scripts when Claude Code uses certain tools. The project uses them to enforce security reminders, block bad commits, and catch architecture violations before a push.

### How hooks work

When a hook fires, Claude Code passes a JSON object on stdin describing the tool call:

```json
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/abs/path/to/file.ts",
    "old_string": "...",
    "new_string": "..."
  },
  "cwd": "/Users/you/project"
}
```

Your script reads this from stdin, does its checks, and exits:

- **Exit 0** — allow the tool call to proceed. Anything written to stdout is added to Claude's context as a reminder.
- **Exit 2** — block the tool call. Anything written to stderr is shown to Claude as the reason.

### Creating a hook

1. Create the script in `.claude/hooks/`:

```bash
touch .claude/hooks/my-hook.sh
chmod +x .claude/hooks/my-hook.sh
```

2. Write the script. Always start with `set -euo pipefail` and parse stdin before doing anything else:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" \
  2>/dev/null || true)

# Exit early if there's nothing to check
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Example: warn when editing files in the shared/ui adapter layer
if [[ "$FILE_PATH" == */shared/ui/* ]]; then
  echo "REMINDER: Adapter files should wrap @org/ui-kit components only."
  echo "Do not implement business logic here."
  exit 0
fi

exit 0
```

3. Register the hook in `.claude/settings.json` under the appropriate event and matcher:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/my-hook.sh"
          }
        ]
      }
    ]
  }
}
```

The `matcher` field is a regex matched against the tool name (`Bash`, `Edit`, `Write`, `Read`, etc.). Use `"if"` to narrow further by the tool's arguments — see the existing `check-staged.sh` registration for an example of matching `git commit *`.

The existing hooks are in `.claude/hooks/` and cover three cases: security reminders on file edits (`security-reminder.sh`), pre-commit checks for lint errors and debug statements (`check-staged.sh`), and FSD layer validation before a push (`check-architecture.sh`). Read those scripts before writing a new one — they show the full pattern including how to produce structured error output.

---

## 4. Customizing Biome Rules

`biome.json` is the single config file for linting and formatting. It replaces both ESLint and Prettier.

### Adding domain-specific rules

Rules live under `linter.rules`. The current config enables the full recommended ruleset. To add rules on top:

```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noConsoleLog": "error"
      }
    }
  }
}
```

Rule groups map to Biome's rule categories: `suspicious`, `correctness`, `style`, `performance`, `complexity`, `security`, `nursery`.

### Using Biome 2.0 domains

Biome 2.0 introduced domains, which activate rules relevant to a specific framework or context. Enable them under `linter.domains`:

```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    },
    "domains": {
      "react": "recommended",
      "next": "recommended",
      "test": "recommended"
    }
  }
}
```

The `react` domain enables React-specific rules (e.g. hooks order, JSX key props). The `test` domain enables rules appropriate for test files while relaxing others that would produce false positives in test code. The `next` domain adds checks relevant to Next.js App Router patterns.

After changing `biome.json`, run `pnpm lint` to verify no existing code is newly flagged. If the rule count is large, consider adding a dedicated `biome.json` override for `src/**/*.test.tsx` files to apply different severity levels in tests.

---

## 5. Upgrading Major Dependencies

### Using the dep-review trigger

The project includes a Claude Code trigger at `.claude/triggers/dep-review.md`. It runs an on-demand dependency migration impact analysis: it searches the changelog for breaking changes, scans the codebase for affected APIs, and produces a report under `docs/dep-reviews/`.

To use it, open Claude Code and describe what you want to upgrade:

```
I want to upgrade TanStack Query from v5 to v6. Run the dep-review analysis.
```

Claude Code will follow the trigger's steps and save the report before you touch `package.json`.

### Manual upgrade process

If you prefer a manual approach:

1. Read the package's changelog or GitHub releases for all versions between your current and target version. Focus on "Breaking changes" sections.
2. Search the codebase for the package's imports: `grep -r "from 'package-name'" src/`
3. Cross-reference which APIs you use against the breaking changes list.
4. Upgrade the package in a separate branch. Run `pnpm tsc --noEmit`, `pnpm lint`, and `pnpm test` in sequence.
5. Fix errors before moving to the next step — TypeScript errors often surface the breaking changes that grep missed.

### When to wait

Not every major version is worth chasing immediately. Examples of when to hold:

- **TypeScript 6.0** — stricter type inference can require widespread changes across `entities/*/api/` Zod schemas and Server Action return types. Wait for ecosystem tooling (Biome, Next.js type definitions) to catch up before upgrading.
- **@vitejs/plugin-react 6.0** — if it requires a Vite major bump, check that Vitest's peer dependency range includes the new version before upgrading either.

A dependency is a candidate to hold when: it requires changes to more than a handful of files, its ecosystem peers haven't released compatible versions yet, or it changes behavior in security-sensitive areas (auth libraries, HTTP clients, cookie handling).

---

## 6. Pulling Upstream Changes

If you bootstrapped from furio-kit using `degit`, there is no upstream remote by default. Add it when you want to pull in template updates:

```bash
git remote add upstream https://github.com/furiolabs/furio-kit.git
git fetch upstream
git merge upstream/main --allow-unrelated-histories
```

The `--allow-unrelated-histories` flag is needed the first time because `degit` strips the git history.

### What will conflict

Expect conflicts in these files every time you merge from upstream:

| File | Why it conflicts | Resolution |
|---|---|---|
| `package.json` | Your app has different dependencies and name | Keep your `name`, `dependencies`, and `scripts`. Adopt upstream `devDependencies` and `engines` changes. |
| `CLAUDE.md` | Your team may have added project-specific instructions | Keep your additions. Adopt new upstream sections. |
| `.claude/settings.json` | Your team may have added or removed hooks | Keep your hooks. Adopt new upstream hooks unless they conflict with your workflow. |
| `biome.json` | You may have customized rules | Keep your rules. Adopt upstream formatter changes. |

Files that should not conflict if you have followed the architecture: `src/` (your app code lives here, not in the template), `app/` (your routes), `.env.local`.

### Staying current without merging

If a full merge is too risky, cherry-pick specific commits from upstream:

```bash
git fetch upstream
git log upstream/main --oneline   # find the commit you want
git cherry-pick <commit-hash>
```

This works well for pulling in a single security workflow update or a Plop template improvement without absorbing unrelated changes.

---

## 7. When to Diverge

Forking the template creates a trade-off: customization now versus ease of pulling upstream changes later. Here is a practical guide to which customizations are safe and which carry long-term cost.

### Safe to diverge — low maintenance cost

These files are expected to differ between teams and rarely receive upstream changes that conflict:

- **Biome rules** (`biome.json`) — your team's style preferences are yours to own
- **Plop generators** (`plopfile.mjs`, `plop-templates/`) — add generators specific to your domain freely
- **Environment variables** (`.env.example`) — your app has different secrets than the template
- **`CLAUDE.md` additions** — project-specific guidance for AI tooling is expected to grow
- **Copilot / AI instructions** — team-specific AI configuration does not conflict with template updates

### Risky to diverge — high maintenance cost

Changing these files means you must manually audit upstream changes each time you want to pull:

- **CI workflows** (`.github/workflows/`) — security-related workflows (audit, CodeQL) receive updates when vulnerabilities are disclosed. If you diverge here, you own the responsibility of tracking those updates yourself. Prefer adding new workflow files rather than modifying existing ones.
- **FSD layer rules and hook scripts** (`.claude/hooks/check-architecture.sh`) — these encode the architectural guarantees the template provides. Relaxing them is almost always a mistake. Tightening them (adding more checks) is fine.
- **Dependabot configuration** (`.github/dependabot.yml`) — automated dependency updates are a security control. Disabling or narrowing them creates risk.

### Keep syncing — do not diverge

These should remain as close to upstream as possible regardless of other customizations:

- `audit.yml` — the vulnerability audit runs on a schedule. If upstream tightens the `--audit-level` threshold or adds a new package ecosystem scan, you want that.
- `codeql.yml` — static security analysis configuration. Pull upstream changes promptly.
- `dependabot.yml` — the ecosystem coverage and update schedule. Upstream may add new package ecosystems (e.g. GitHub Actions pinning) that improve your security posture.
- `architecture-guard.yml` — if the CI architecture guard is updated to check new FSD rules, staying current ensures the guard reflects the architecture you are actually supposed to maintain.

The rule of thumb: diverge on productivity tooling, stay current on security tooling.
