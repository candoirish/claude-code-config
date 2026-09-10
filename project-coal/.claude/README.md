# coal's Claude Code setup (backup)

Backed up from `coal/.claude/` on 2026-09-10. This is **coal's own, separate**
`/workflow` pipeline — an earlier, independently-evolved sibling of tool-portal's
(see `../../project/.claude/`). The two are deliberately kept apart rather than
merged: coal's pipeline predates several of tool-portal's later additions (the
`pickup <ID>` entry mode, board-sync phases, QA-evidence harness) and has its
own trajectory. Don't port changes between them without checking first.

## What's here

- `commands/workflow.md` — coal's `/workflow` command (spec-driven pipeline:
  spec-architect → agent-router → implementer/ui-specialist → tester →
  intent-verifier → preview-reviewer → reviewer → pr-manager → closer).
- `agents/` — the 11 subagents `/workflow` spawns (same roster as tool-portal's:
  agent-router, closer, implementer, intent-verifier, pr-manager, prd-reader,
  preview-reviewer, reviewer, spec-architect, tester, ui-specialist).
- `hooks/` — `pre-test-verify.sh`, `secret-scan.sh`, `type-check-on-write.sh`,
  `workflow-guard.sh`.
- `launch.json` — dev-server launch configs (`preview_start` targets) for coal
  and its worktrees. Contains Supabase's well-known **public local-dev demo
  keys** (the standard `supabase start` anon/service_role JWTs, issuer
  `"supabase-demo"`) — these are not secrets; they only work against
  `127.0.0.1:54321` and are the same values Supabase publishes in its own docs.

- `skills/` — the third-party skill pack (`ask-matt`, `claude-handoff`,
  `code-review`, `grilling`, `tdd`, `teach`, `wayfinder`, `wizard`, and more).
  In coal's own checkout these live at `.agents/skills/*`, symlinked into
  `.claude/skills/` — and coal's own `.gitignore` excludes `.agents/skills/`
  from git (it's meant to be regenerated via coal's `setup-matt-pocock-skills`
  command, not tracked). Included here anyway, **dereferenced into real files**
  (not symlinks — a symlink to a path on this machine wouldn't resolve on a
  different one) so a fresh clone doesn't depend on re-running that setup.

## What's deliberately NOT here

- `.claude/settings.local.json` — machine-local permission overrides, not
  portable.
- `.claude/scheduled_tasks.lock`, `.claude/.surprises.log` — ephemeral runtime
  files.
- `.claude/worktrees/` — active git worktrees for in-flight specs; not backup
  material (they're regular git state, already pushed to their own branches).

## Restore

```bash
cp -r project-coal/.claude/* /path/to/coal/.claude/
```

(Windows: `Copy-Item -Recurse -Force project-coal\.claude\* C:\path\to\coal\.claude\`)
