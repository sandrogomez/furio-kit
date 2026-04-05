#!/usr/bin/env bash
set -euo pipefail

# Pre-push hook for Claude Code
# Fires on PreToolUse when Claude runs "git push"
# Runs FSD layer + adapter checks on changed files vs main
# Exit 0 = allow, Exit 2 = block

CHANGED_FILES=$(git diff --name-only main...HEAD -- 'src/' 2>/dev/null || true)

if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

ERRORS=""

# Define FSD layer hierarchy (index = priority, lower = deeper)
declare -A LAYER_LEVEL
LAYER_LEVEL[shared]=0
LAYER_LEVEL[entities]=1
LAYER_LEVEL[features]=2
LAYER_LEVEL[widgets]=3
LAYER_LEVEL[views]=4

# Check 1: FSD layer violations
for file in $CHANGED_FILES; do
  [[ "$file" =~ \.(ts|tsx)$ ]] || continue
  [ -f "$file" ] || continue

  # Determine which layer this file belongs to
  FILE_LAYER=""
  for layer in shared entities features widgets views; do
    if [[ "$file" == src/${layer}/* ]]; then
      FILE_LAYER="$layer"
      break
    fi
  done
  [ -z "$FILE_LAYER" ] && continue

  FILE_LEVEL=${LAYER_LEVEL[$FILE_LAYER]}

  # Check each import in the file
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    for target_layer in shared entities features widgets views; do
      if echo "$line" | grep -qE "@/${target_layer}/"; then
        TARGET_LEVEL=${LAYER_LEVEL[$target_layer]}
        if [ "$TARGET_LEVEL" -ge "$FILE_LEVEL" ] && [ "$target_layer" != "$FILE_LAYER" ]; then
          ERRORS="${ERRORS}LAYER VIOLATION: ${file} (${FILE_LAYER}) imports from '${target_layer}'\n"
        fi
      fi
    done
  done < <(grep -E "from ['\"]@/" "$file" 2>/dev/null || true)
done

# Check 2: Adapter pattern - no @org/ui-kit outside shared/ui
for file in $CHANGED_FILES; do
  [[ "$file" =~ \.(ts|tsx)$ ]] || continue
  [[ "$file" == src/shared/ui/* ]] && continue
  [ -f "$file" ] || continue

  if grep -qE "from ['\"]@org/ui-kit['\"]" "$file" 2>/dev/null; then
    ERRORS="${ERRORS}ADAPTER VIOLATION: ${file} imports directly from @org/ui-kit\n"
  fi
done

# Check 3: Barrel exports
for layer in entities features widgets; do
  for slice_dir in src/${layer}/*/; do
    [ -d "$slice_dir" ] || continue
    if [ ! -f "${slice_dir}index.ts" ]; then
      ERRORS="${ERRORS}MISSING BARREL: ${slice_dir} has no index.ts\n"
    fi
  done
done

if [ -n "$ERRORS" ]; then
  printf "Architecture violations found. Fix before pushing:\n\n%b" "$ERRORS" >&2
  exit 2
fi

exit 0
