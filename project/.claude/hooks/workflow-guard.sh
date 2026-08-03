#!/usr/bin/env bash
# PreToolUse[Bash] — blocks `git commit` unless a .spec.md file exists in specs/
# Allows commits on main/master (hotfixes) and if the commit message starts with "chore:"
#
# Hook input arrives as JSON on stdin. Exit 2 blocks the tool call and returns
# stderr to Claude; exit 0 allows it.

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')

# Only interested in Bash calls that actually invoke `git commit`.
# Anchored to a command position (start of line, or after ; && || |) so that
# merely *mentioning* the phrase — e.g. grep "git commit" — does not match.
if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi
if ! printf '%s' "$COMMAND" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*git[[:space:]]+([-][^[:space:]]+[[:space:]]+)*commit([[:space:]]|$)'; then
  exit 0
fi

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
SPECS_DIR="$REPO_ROOT/specs"
BRANCH=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "unknown")

# Allow commits on main/master (hotfixes)
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  exit 0
fi

# Allow chore commits (dependency updates, config changes).
# Pull the message out of -m "..." or -m '...' in the command line.
COMMIT_MSG=$(printf '%s' "$COMMAND" | sed -n 's/.*-m[[:space:]]*"\([^"]*\)".*/\1/p')
if [[ -z "$COMMIT_MSG" ]]; then
  COMMIT_MSG=$(printf '%s' "$COMMAND" | sed -n "s/.*-m[[:space:]]*'\([^']*\)'.*/\1/p")
fi
if [[ "$COMMIT_MSG" == chore:* || "$COMMIT_MSG" == chore\(* ]]; then
  exit 0
fi

# Check for at least one spec file
if ! find "$SPECS_DIR" -maxdepth 1 -name "*.spec.md" -print -quit 2>/dev/null | grep -q .; then
  echo "BLOCKED: No spec file found in specs/" >&2
  echo "Create a spec first with: @spec-architect or /workflow" >&2
  echo "" >&2
  echo "To bypass for non-workflow commits, use a 'chore:' prefix." >&2
  exit 2
fi

exit 0
