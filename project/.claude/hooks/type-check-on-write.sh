#!/usr/bin/env bash
# PostToolUse[Write|Edit] — runs a tsc type check after .ts/.tsx file writes
#
# Hook input arrives as JSON on stdin; the edited path is tool_input.file_path.
# Advisory only — always exits 0 so it never blocks.

set -uo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""')

# Only check TypeScript files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Quick type check (first 10 errors only to keep it fast)
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
bunx tsc --noEmit 2>&1 | head -10

# Exit 0 even on type errors — this is advisory, not blocking
# The tester agent will catch and fix type errors
exit 0
