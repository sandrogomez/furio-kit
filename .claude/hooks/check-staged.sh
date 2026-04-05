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
