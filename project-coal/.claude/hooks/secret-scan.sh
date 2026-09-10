#!/usr/bin/env bash
# PreToolUse[Bash] — scans committed changes for potential secrets before push
# Blocks the push if secrets are found
#
# Hook input arrives as JSON on stdin. Exit 2 blocks the tool call and returns
# stderr to Claude; exit 0 allows it.

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')

# Only interested in Bash calls that actually invoke `git push`.
# Anchored to a command position (start of line, or after ; && || |) so that
# merely *mentioning* the phrase — e.g. grep "git push" — does not match.
if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi
if ! printf '%s' "$COMMAND" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*git[[:space:]]+([-][^[:space:]]+[[:space:]]+)*push([[:space:]]|$)'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# Get list of files that differ from main
CHANGED_FILES=$(git diff main...HEAD --name-only 2>/dev/null || git diff HEAD --name-only)

if [[ -z "$CHANGED_FILES" ]]; then
  exit 0
fi

FOUND=0

while IFS= read -r file; do
  [[ ! -f "$file" ]] && continue
  # Skip binary files, images, fonts
  [[ "$file" =~ \.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$ ]] && continue
  # Skip lock files
  [[ "$file" =~ (package-lock|bun\.lock|yarn\.lock) ]] && continue

  # Check for common secret patterns
  # Matches go to stderr so Claude sees them when the hook blocks.
  if MATCHES=$(grep -nEi '(sk_atoll_|sk_live_|sk_test_|PRIVATE_KEY|-----BEGIN|secret_key|api_key\s*=\s*["\x27][a-zA-Z0-9]|password\s*=\s*["\x27][a-zA-Z0-9])' "$file" 2>/dev/null); then
    printf '%s\n' "$MATCHES" >&2
    echo "WARNING: Potential secret in $file" >&2
    FOUND=1
  fi
done <<< "$CHANGED_FILES"

if [[ "$FOUND" -eq 1 ]]; then
  echo "" >&2
  echo "BLOCKED: Potential secrets detected in the changes being pushed." >&2
  echo "Review the files above and remove secrets before pushing." >&2
  exit 2
fi

exit 0
