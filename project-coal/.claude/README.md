# coal's Claude Code setup (backup)

Backed up from `coal/.claude/` on 2026-09-10, updated 2026-09-11. `/workflow` and
its 11 subagents used to live here as coal's own, separate copy (an
independently-evolved sibling of tool-portal's — see `../../project/.claude/`).
On 2026-09-11 the two pipelines were unified into a single global copy at
`../../global/` (`~/.claude/commands/workflow.md` + `~/.claude/agents/`) instead,
to stop the drift between them and avoid re-copying into every new repo. What
remains here is coal-specific supporting material only — hooks, launch config,
and its third-party skill pack.

## What's here

- `hooks/` — `pre-test-verify.sh`, `secret-scan.sh`, `type-check-on-write.sh`,
  `workflow-guard.sh`.
- `launch.json` — dev-server launch configs (`preview_start` targets) for coal
  and its worktrees. Contains Supabase's well-known **public local-dev demo
  keys** (the standard `supabase start` anon/service_role JWTs, issuer
  `"supabase-demo"`) — these are not secrets; they only work against
  `127.0.0.1:54321` and are the same values Supabase publishes in its own docs.

- `skills/` — the third-party skill pack (`ask-matt`, `claude-handoff`,
  `code-review`, `tdd`, `teach`, `wayfinder`, `wizard`, and more). `grilling` was
  removed from this pack — it's installed globally now (`../../global/skills/`),
  since `/workflow`'s spec-grilling phase depends on it in every repo, not just
  coal's. In coal's own checkout the rest of this pack lives at
  `.agents/skills/*`, symlinked into `.claude/skills/` — and coal's own
  `.gitignore` excludes `.agents/skills/` from git (it's meant to be regenerated
  via coal's `setup-matt-pocock-skills` command, not tracked). Included here
  anyway, **dereferenced into real files** (not symlinks — a symlink to a path
  on this machine wouldn't resolve on a different one) so a fresh clone doesn't
  depend on re-running that setup.

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
