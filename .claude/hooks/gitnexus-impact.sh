#!/bin/bash
# Fires before Edit/Write on critical paths. Reminds Claude Code to run
# gitnexus_impact before modifying high-blast-radius symbols.

TOOL_INPUT="${CLAUDE_TOOL_INPUT:-}"

# Extract file path from tool input (JSON field "file_path")
FILE_PATH=$(echo "$TOOL_INPUT" | grep -o '"file_path":"[^"]*"' | sed 's/"file_path":"//;s/"//')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Critical paths where blast radius matters most
CRITICAL_PATTERNS=(
  "proxy.ts"
  "shared/auth"
  "shared/env"
  "shared/model"
  "shared/providers"
  "instrumentation.ts"
  "next.config"
)

for pattern in "${CRITICAL_PATTERNS[@]}"; do
  if echo "$FILE_PATH" | grep -q "$pattern"; then
    echo ""
    echo "⚠  GitNexus impact check recommended"
    echo "   File: $FILE_PATH"
    echo "   This path is in a high-impact area. Before editing, run:"
    echo "   gitnexus_impact({ target: \"<symbolName>\", direction: \"upstream\" })"
    echo "   Then review callers and affected execution flows before proceeding."
    echo ""
    break
  fi
done

exit 0
