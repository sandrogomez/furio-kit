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
