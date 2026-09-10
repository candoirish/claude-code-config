#!/usr/bin/env bash
# Lightweight pre-test verification — runs quick bash checks before the full tester agent.
# Called by the workflow command between implementation and testing phases.
# Exits 0 with results on stdout. Non-blocking (advisory).

set -uo pipefail

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"
cd "$REPO_ROOT"

PASS=0
FAIL=0
WARN=0

check() {
  local label="$1" result="$2"
  if [[ "$result" == "pass" ]]; then
    echo "  ✓ $label"
    ((PASS++))
  elif [[ "$result" == "fail" ]]; then
    echo "  ✗ $label"
    ((FAIL++))
  else
    echo "  ? $label"
    ((WARN++))
  fi
}

echo "── Pre-test verification ──"
echo ""

# 1. TypeScript compiles
if bunx tsc --noEmit 2>&1 | grep -q "error TS"; then
  TSC_ERRORS=$(bunx tsc --noEmit 2>&1 | grep "error TS" | wc -l | tr -d ' ')
  check "tsc --noEmit ($TSC_ERRORS errors)" "fail"
else
  check "tsc --noEmit" "pass"
fi

# 2. Build succeeds
if bun run build --no-lint > /dev/null 2>&1; then
  check "bun run build" "pass"
else
  check "bun run build" "fail"
fi

# 3. No console.log in changed files (common mistake)
CHANGED=$(git diff main...HEAD --name-only --diff-filter=ACMR 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
if [[ -n "$CHANGED" ]]; then
  CONSOLE_HITS=$(echo "$CHANGED" | xargs grep -l 'console\.log' 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$CONSOLE_HITS" -gt 0 ]]; then
    check "No console.log in changed files ($CONSOLE_HITS files)" "warn"
  else
    check "No console.log in changed files" "pass"
  fi
fi

# 4. No TODO/FIXME/HACK in new code
if [[ -n "$CHANGED" ]]; then
  TODO_HITS=$(echo "$CHANGED" | xargs grep -nE '(TODO|FIXME|HACK|XXX)' 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$TODO_HITS" -gt 0 ]]; then
    check "No TODO/FIXME in changed files ($TODO_HITS hits)" "warn"
  else
    check "No TODO/FIXME in changed files" "pass"
  fi
fi

# 5. Changed files exist and are non-empty
if [[ -n "$CHANGED" ]]; then
  EMPTY=0
  while IFS= read -r f; do
    [[ -f "$f" && ! -s "$f" ]] && ((EMPTY++))
  done <<< "$CHANGED"
  if [[ "$EMPTY" -gt 0 ]]; then
    check "No empty changed files ($EMPTY empty)" "fail"
  else
    check "All changed files non-empty" "pass"
  fi
fi

# 6. Spec file exists
SPEC_COUNT=$(find specs/ -maxdepth 1 -name "*.spec.md" 2>/dev/null | wc -l | tr -d ' ')
check "Spec file exists ($SPEC_COUNT found)" "$([ "$SPEC_COUNT" -gt 0 ] && echo pass || echo fail)"

echo ""
echo "── Results: $PASS passed, $FAIL failed, $WARN warnings ──"

if [[ "$FAIL" -gt 0 ]]; then
  echo "VERDICT: FAIL — fix issues before running full tester"
  exit 1
else
  echo "VERDICT: PASS — ready for full tester"
  exit 0
fi
