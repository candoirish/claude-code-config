---
description: "Spec-driven development pipeline. Routes work through: spec-architect → agent-router → implementer/ui-specialist → reviewer → pr-manager. Pass a request description as the argument."
---

# Workflow Pipeline

Orchestrate the full spec-driven development pipeline for the VMG Tools Portal.

## Input

Four entry modes. All support an optional `@worktree` target for multi-feature work.

**1. Direct request:**
```
/workflow add team-scoped payroll export
/workflow @timekeeping-multiteam add team-scoped payroll export
```

**2. PRD file:**
```
/workflow PRD: specs/prd-timekeeping-v2.md
/workflow @timekeeping-multiteam PRD: specs/prd-timekeeping-v2.md
```

**3. Multiple requests (parallel):**
```
/workflow parallel:
  1. fix absent shift label formatting
  2. add team-scoped payroll export
  3. fix brand checker upload error
```

**4. No argument** — asks what to build and which worktree to target.

### Worktree Targeting (`@worktree`)

When `@worktree` is provided, the pipeline runs in that worktree instead of the current directory.

The `@worktree` value can be:
- **An existing worktree name:** `@timekeeping-multiteam` → resolves to the worktree path for that branch/directory
- **A branch name:** `@feature/new-dashboard` → finds or creates a worktree for that branch
- **A new feature slug:** `@new-reporting-tool` → creates a new worktree + branch

To find existing worktrees:
```bash
git worktree list
```

To create a new worktree for a feature:
```bash
git worktree add ../tool-portal-{slug} -b {type}/{slug}
```

All agents in the pipeline operate within the targeted worktree. The `specs/_queue.json` in the main repo tracks which worktree each spec is running in.

When no `@worktree` is specified, the pipeline runs in the current working directory.

When a PRD is provided, spawn `prd-reader` first to decompose it into atomic specs, then run the pipeline for each spec in dependency order.

If no argument is provided, ask what they'd like to build or fix.

## Phase 0: Context Loading (ALWAYS runs first)

Before ANY specialist agent is spawned, the main workflow agent MUST:

1. **Read the registry:** `specs/_registry.md` — understand all completed and in-progress work
2. **Read the queue:** `specs/_queue.json` — check current pipeline state
3. **Distill context:** Extract ONLY the entries relevant to this task (same scope, same tool, related files)
4. **Package context:** Include the distilled context in every specialist agent's prompt

**Context packaging rule:** Specialist agents (implementer, ui-specialist, tester, reviewer, pr-manager) NEVER read `_registry.md` or `_queue.json` directly. They receive everything they need in their task prompt from the main agent. This prevents context bloat from loading 2000+ lines of historical notes.

**Example context package for a specialist prompt:**
```
## Prior Work Context (from registry)
- PR #382 modified CreativeStudioTimekeepingTool.tsx (team-switch fix + board-aggregate consolidation)
- The board store uses isBoardOutOfSync derived state and synchronous currentTeamRef
- Known pre-existing: unused refreshMe warning at :137, exhaustive-deps at :202
- StaleShiftsPanel writable-stale-rows issue was fixed via inert attribute in board-aggregate spec

## Current Spec
{spec contents}
```

## Pipeline

```
User Request
    ↓
[MAIN AGENT] → reads _registry.md + _queue.json (context loading)
    ↓
[spec-architect] → creates spec + Atoll issue (receives distilled context)
    ↓
User Approval (required)
    ↓
[agent-router] → reads spec, assigns agent (receives distilled context)
    ↓
[implementer / ui-specialist] → writes code in worktrees (receives distilled context)
    ↓
[pre-test-verify.sh] → lightweight bash checks (tsc, build, console.log, empty files)
    ↓ (if FAIL → fix before spawning tester)
[tester] → full acceptance testing (receives distilled context)
    ↓
[preview-reviewer] → latest changes only → fix → commit → push (loop)
    ↓
[reviewer] → ALL branch changes → fix → commit → push (loop)
    ↓
[pr-manager] → commit → create PR → post-PR review loop → Atoll
    ↓
User merges PR
    ↓
[pr-manager] → git pull main → vercel --prod → Atoll done
    ↓
[MAIN AGENT] → updates _registry.md with completion summary
    ↓
Done → PR URL + Deploy URL + Atoll status
```

## Parallel Execution

When multiple independent specs exist (no dependency between them), run them **simultaneously** across separate worktrees. Each spec gets its own worktree, branch, and full pipeline.

### How parallel works

```
/workflow parallel:
  1. fix absent shift label formatting
  2. add team-scoped payroll export

     ┌─ Worktree A ──────────────────┐   ┌─ Worktree B ──────────────────┐
     │ fix/timekeeping-shift-labels   │   │ feat/timekeeping-payroll      │
     │                                │   │                                │
     │ spec-architect                 │   │ spec-architect                 │
     │     ↓                          │   │     ↓                          │
     │ agent-router                   │   │ agent-router                   │
     │     ↓                          │   │     ↓                          │
     │ implementer                    │   │ ui-specialist                  │
     │     ↓                          │   │     ↓                          │
     │ tester                         │   │ tester                         │
     │     ↓                          │   │     ↓                          │
     │ reviewer                       │   │ reviewer                       │
     │     ↓                          │   │     ↓                          │
     │ pr-manager → PR #384           │   │ pr-manager → PR #385           │
     └────────────────────────────────┘   └────────────────────────────────┘
```

### Execution rules for parallel mode

1. **Phase 1 — Spec creation:** Run ALL `spec-architect` agents in parallel (one per request). Each creates its own spec + Atoll issue.
2. **User approval:** Present ALL specs together for batch approval. User can approve all, approve some, or modify individual specs.
3. **Phase 2+ — Independent pipelines:** After approval, launch each spec's full pipeline simultaneously using `Agent()` calls with `isolation: worktree`. Each pipeline runs independently:
   - Its own worktree + branch
   - Its own agent-router → implementer → tester → reviewer → pr-manager chain
   - Its own PR
4. **Queue tracking:** Each spec gets its own entry in `specs/_queue.json` with a distinct `worktree` and `branch`.
5. **No cross-contamination:** Specs in parallel mode must NOT touch overlapping files. If two specs need to modify the same file, they must run sequentially (use `depends_on`).

### When to parallelize automatically

If a PRD decomposition produces multiple specs with NO dependencies between them, the workflow SHOULD run them in parallel by default. Only serialize specs that have explicit `depends_on` entries.

```
PRD Decomposition:
  Spec A (types + store)       ← no deps → run immediately
  Spec B (API route)           ← depends on A → wait for A
  Spec C (shared component)    ← depends on A → wait for A
  Spec D (UI page)             ← depends on B + C → wait for B and C

Execution:
  Round 1: [A]                  ← single spec, one worktree
  Round 2: [B, C] in parallel   ← two worktrees, simultaneous
  Round 3: [D]                  ← single spec, after B+C merge
```

### Implementation

For parallel execution, use multiple `Agent()` calls in a single message so they run concurrently:

```
# Launch all independent specs simultaneously
Agent(agent-router): "Route spec at specs/fix-shift-labels.spec.md" (worktree A)
Agent(agent-router): "Route spec at specs/feat-payroll-export.spec.md" (worktree B)
```

Each agent-router then spawns its own downstream pipeline (implementer → tester → reviewer → pr-manager) within its worktree.

For PRD-based work with dependencies, use rounds:

```
# Round 1: independent specs
await Agent(full-pipeline for spec A)

# Round 2: specs that depend on A
Agent(full-pipeline for spec B)  ← parallel
Agent(full-pipeline for spec C)  ← parallel

# Round 3: specs that depend on B+C
await Agent(full-pipeline for spec D)
```

## Execution Steps (Single Spec)

### Phase 0: PRD Decomposition (only if PRD provided)

If the input starts with `PRD:`, spawn the `prd-reader` agent:

```
Agent(prd-reader): "Decompose PRD at {file-path} into atomic specs"
```

The prd-reader will:
1. Read and analyze the PRD
2. Research the codebase for existing code
3. Decompose into atomic specs (≤30 min each)
4. Define dependency order
5. Write all spec files
6. Create Atoll issues for each
7. Register all in `specs/_queue.json`
8. Present the full plan for approval

After approval, the pipeline runs for each spec — parallelizing independent specs across worktrees, serializing dependent ones.

### Phase 1: Spec Creation (only if direct request, not PRD)

Spawn the `spec-architect` agent with the user's request:

```
Agent(spec-architect): "Create a spec for: {user's request}"
```

Wait for the spec to be created. Present it to the user for approval.

### Phase 2: Routing (after user approves)

Spawn the `agent-router` agent with the spec path:

```
Agent(agent-router): "Route spec at specs/{spec-name}.spec.md"
```

### Phase 3: Implementation (worktree-isolated)

Based on the router's decision, spawn the appropriate agent(s). Both `implementer` and `ui-specialist` run in isolated git worktrees — they can work in parallel without conflicts.

**Single agent (backend or frontend only):**
```
Agent(implementer): "Implement spec at specs/{spec-name}.spec.md"
```

**Parallel agents (split specs with both backend + frontend):**
```
Agent(implementer): "Implement backend spec at specs/{spec-name}--backend-api.spec.md"
Agent(ui-specialist): "Implement UI spec at specs/{spec-name}--ui-components.spec.md"
```

Both run simultaneously in separate worktrees. Changes from each worktree are merged back after completion.

### Phase 3.5: Lightweight Pre-Test Verification

Before spawning the full tester agent (which is expensive), run the lightweight bash check:

```bash
bash .claude/hooks/pre-test-verify.sh
```

This checks in seconds: tsc compiles, build succeeds, no console.log in changed files, no empty files, spec exists. If it FAILs, fix the issues before spawning the tester — saves an entire agent invocation.

### Phase 4: Testing

After pre-test passes, spawn the tester with distilled context:

```
Agent(tester): "Test implementation for specs/{spec-name}.spec.md

## Prior Work Context
{distilled from registry — only entries that touch the same files or scope}

## Spec
{spec contents}

## Pre-test Results
{output from pre-test-verify.sh}"
```

The tester will:
1. Run `bunx tsc --noEmit`, `bun lint`, `bun run build`
2. Verify each acceptance criterion from the spec
3. Start dev server and verify UI changes in the browser
4. Test edge cases (empty inputs, missing data, unauthorized access)
5. Check for regressions in shared code
6. Fix and `/commit-code` any failures, re-test until all pass

### Phase 4.5: Inline Backend Validation (when browser auth is unavailable)

When the dev server requires authentication (e.g. Google OAuth) and the browser can't sign in, run inline backend tests directly instead of relying on browser verification. Extract the core validation/display logic from the changed code and test it exhaustively with Node.js scripts.

**What to test:**
1. **API validation logic** — reproduce the server-side validation checks (type guards, range checks, null handling) and run every edge case: valid inputs, boundary values, type mismatches (string, boolean, NaN, Infinity, arrays, objects), negative values, fractional values, and overflow values.
2. **Client-side input parsing** — reproduce the input → API-payload transformation (e.g. `parseInt`, empty-string-to-null, trim, same-value-noop) and test all user input scenarios.
3. **Display/rendering logic** — reproduce the conditional rendering decisions (which status shows what, null vs set vs zero) and verify every combination of state.
4. **Invariant enforcement** — verify that server-side invariants (e.g. probationary always clears a field) are applied in all code paths (PATCH, POST/reactivation, rollback).

**How to run:**
```bash
node -e "
function validate(input) { /* extract logic from route handler */ }
const tests = [
  { input: 0, expected: 'ok', desc: 'Zero' },
  { input: -1, expected: 'error', desc: 'Negative' },
  // ... all edge cases
]
let passed = 0, failed = 0
for (const t of tests) {
  const result = validate(t.input)
  const pass = result === t.expected
  if (!pass) { console.log('FAIL:', t.desc); failed++ }
  else { console.log('PASS:', t.desc); passed++ }
}
console.log(passed + '/' + (passed+failed) + ' passed')
"
```

Run this after the tester agent and before the E2E phase. Fix any failures before proceeding. This ensures backend correctness is verified even when browser-based E2E testing isn't possible.

### Phase 4.75: E2E Testing with Playwright + Local Supabase

Run end-to-end tests against a local Supabase instance using Docker and the project's E2E auth system. This phase exercises the full stack — API routes, database triggers, UI rendering — through real HTTP requests and headless Chromium.

**Prerequisites:**
- Docker must be running (the user should confirm this)
- Supabase CLI installed (`supabase --version`)

**Setup steps:**

1. **Start local Supabase:**
   ```bash
   # Stop any conflicting instance first
   supabase stop 2>/dev/null
   supabase start
   ```
   Note the output keys: Project URL (`http://127.0.0.1:54321`), Publishable key, Secret key.

   If `supabase start` fails with a `schema "analytics" does not exist` error, temporarily edit `supabase/config.toml` to remove `"analytics"` from the `schemas` array, start Supabase, then revert the edit (don't commit the change).

2. **Run relevant migrations** — copy each migration file into the container and execute it:
   ```bash
   docker cp supabase/migrations/{migration}.sql supabase_db_tool-portal:/tmp/migration.sql
   docker exec supabase_db_tool-portal psql -U postgres -d postgres -f /tmp/migration.sql
   ```
   Run all migrations relevant to the feature being tested, in chronological order. Piping via `stdin` to `docker exec` may silently fail — always use `docker cp` + `-f`.

3. **Seed E2E data** — write a temporary seed script (in `scripts/`) that uses `@supabase/supabase-js` with the local service role key to:
   - Create auth users via `supabase.auth.admin.createUser()` with `@vmgdigital.com` emails (required by the timekeeping auth domain allowlist)
   - Insert profiles and roster data needed for the test scenarios
   - Write the seed artifact to `tests/e2e/.seed/app-e2e-seed.json`
   
   Delete the seed script after running it — it's not committed.

4. **Install Playwright browsers** (if not already present):
   ```bash
   bunx playwright install chromium
   ```

5. **Start dev server with E2E env vars** — add a temporary entry in `.claude/launch.json`:
   ```json
   {
     "name": "tool-portal-e2e",
     "runtimeExecutable": "bash",
     "runtimeArgs": ["-lc", "APP_E2E_AUTH=1 APP_E2E_AUTH_TOKEN=local-dev-token NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY={publishable_key} SUPABASE_SERVICE_ROLE_KEY={secret_key} bun dev --port 50551"],
     "port": 50551
   }
   ```
   Start via `preview_start({ name: "tool-portal-e2e" })`. Remove the entry after testing.

6. **Write the Playwright test** at `tests/e2e/{feature-name}.pw.ts`:
   - Import `e2eApiHeaders`, `isE2EAuthEnabled`, `login` from `./e2e-auth`
   - Gate all tests with `test.skip(!isE2EAuthEnabled(), '...')`
   - **API tests:** use `request.get/patch/post` with `e2eApiHeaders()` — test happy paths, validation rejections, invariant enforcement, boundary values
   - **UI tests:** use `login(page)` then navigate and assert DOM state — column headers, input visibility, display values, conditional rendering

7. **Run the tests:**
   ```bash
   APP_E2E_AUTH=1 \
   APP_E2E_AUTH_TOKEN=local-dev-token \
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
   NEXT_PUBLIC_SUPABASE_ANON_KEY={publishable_key} \
   SUPABASE_SERVICE_ROLE_KEY={secret_key} \
   PLAYWRIGHT_BASE_URL=http://localhost:50551 \
   bunx playwright test tests/e2e/{feature-name}.pw.ts --project=chromium --reporter=list
   ```

8. **Fix failures and re-run** until all tests pass.

9. **Cleanup:**
   - Stop the E2E dev server
   - Remove the temporary `launch.json` entry
   - Delete temporary seed scripts
   - Delete `test-results/` directory
   - Keep the `.pw.ts` test file (it's committed with the feature)
   - Optionally stop Supabase: `supabase stop`

**E2E auth flow recap:** When `APP_E2E_AUTH=1` and the `x-app-e2e-auth` header matches `APP_E2E_AUTH_TOKEN`, `createServerAuthClient()` bypasses Google OAuth and signs in the seeded user via `signInWithPassword`. This only works when `NEXT_PUBLIC_SUPABASE_URL` points to localhost.

### Phase 5: Preview Review (latest changes only)

Spawn the preview-reviewer for a quick pass on the latest changes:

```
Agent(preview-reviewer): "Preview review latest changes for specs/{spec-name}.spec.md"
```

The preview-reviewer will:
1. Run `/codex:adversarial-review` on only the latest commit (`git diff HEAD~1...HEAD`)
2. Fix any obvious issues (correctness, types, conventions)
3. Run `/commit-code` and push
4. Repeat until clean
5. Output PREVIEW APPROVED

### Phase 6: Main Review (all branch changes vs main)

After preview passes, spawn the main reviewer for full-scope analysis:

```
Agent(reviewer): "Main review all branch changes for specs/{spec-name}.spec.md"
```

The main reviewer will:
1. Run `/codex:adversarial-review` on ALL branch changes (`git diff main...HEAD`)
2. Fix any issues found
3. Run `/commit-code` and push
4. Repeat until no issues found
5. Run spec compliance + convention checks
6. Output APPROVED verdict

### Phase 7: PR Creation + Post-PR Review Loop

After the main reviewer gives APPROVED:

```
Agent(pr-manager): "Create PR for specs/{spec-name}.spec.md"
```

The pr-manager will:
1. Check branch name against existing conventions (rename if not descriptive enough)
2. Run `/commit-code` to stage and commit
3. Run `/create-pr` to push and create the PR
4. Run a post-PR review loop:
   - `/codex:adversarial-review` on all PR changes
   - Fix any issues, `/commit-code`, push
   - Repeat until clean
5. Comment the PR link on the Atoll issue
6. Wait for user to merge the PR
7. After merge: `git checkout main && git pull origin main && vercel --prod --yes`
8. Report the production deployment URL
9. Mark the Atoll issue as "done"

### Phase 8: Update Registry

After pr-manager completes, the MAIN AGENT (not a specialist) updates `specs/_registry.md`:

1. Add a new entry under `## Completed Work` with:
   - Spec name, status, PR number, branch, Atoll issue ID
   - 1-2 sentence summary of what was done
   - Any non-obvious decisions made during implementation
   - Key files modified
2. Remove the entry from `## In Progress` if it was listed there
3. Add any newly discovered issues to `## Known Issues`

**This is what solves context amnesia.** The next `/workflow` session reads the registry and immediately knows what was done, what decisions were made, and what files were touched — without loading the full queue notes.

**Registry update rules:**
- Keep summaries to 1-2 sentences — this is a quick-reference index, not a changelog
- Include decisions that would surprise a future agent (non-obvious architectural choices)
- List only the key files, not every file touched
- Never remove completed entries — they're permanent history

## Progress Tracking

After each phase, output a status line:

```
Pipeline: {spec-name}
  [x] Spec created
  [x] Spec approved
  [x] Routed to: {agent}
  [ ] Implementation (worktree)
  [ ] Testing (tsc, build, acceptance criteria, edge cases)
  [ ] Preview review — latest changes (iteration {n})
  [ ] Main review — all branch changes (iteration {n})
  [ ] PR created
  [ ] Post-PR review loop (iteration {n}) — comments findings on PR
  [ ] Atoll updated + PR commented
```

For parallel runs, show all pipelines:

```
Parallel Pipelines:

Pipeline A: fix-timekeeping-shift-labels     @worktree-a
  [x] Spec created
  [x] Implementing...
  [ ] Testing
  ...

Pipeline B: feat-timekeeping-payroll-export  @worktree-b
  [x] Spec created
  [x] Spec approved
  [x] Routed to: ui-specialist
  [x] Implementing...
  [ ] Testing
  ...
```

## Git Identity

All agents must use `irish@vmgdigital.com` as the git author email. The `/commit-code` skill handles this automatically, but worktree-isolated agents (implementer, ui-specialist) must also verify it in their worktree before any git operations.

## Atoll Sync

The spec-architect creates the Atoll issue. Subsequent agents update its status:
- spec created → `todo`
- implementation started → `in_progress`
- review started → `in_review`
- PR created → `done` + PR link commented on issue

**Rule:** Never touch Atoll issues assigned to Reymond.
