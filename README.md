# claude-code-config

Personal backup of Claude Code custom commands/agents/hooks for the `tool-portal` repo,
so they can be restored on a different machine (they're gitignored in `tool-portal` itself
via `.claude/`).

## What's here

- `global/commands/` — self-contained slash commands with no project dependencies.
  Safe to install user-wide.
- `project/.claude/` — the `/workflow` command plus the subagents, hooks, QA-evidence
  harness (`qa/`), and `settings.json` it depends on. Specific to the `tool-portal`
  repo's pipeline; stays project-scoped, not global.
- `automation/` — machine-independent Atoll→Telegram→/workflow watcher (new-issue
  pings, `pickup <ID>` claiming) run hourly by a cloud routine. Pure Node ESM, no deps,
  runs identically on Windows/macOS/cloud. See [`automation/README.md`](automation/README.md).

## Restore on a new machine

**Global commands** (work in any repo):

```bash
cp global/commands/*.md ~/.claude/commands/
```

**Project-scoped workflow pipeline** (only inside your `tool-portal` checkout):

```bash
cp -r project/.claude/* /path/to/tool-portal/.claude/
```

`tool-portal/.claude/` is gitignored there, so this copy step is needed after every fresh
clone of that repo.

On **macOS/Linux** the same commands work as written. On **Windows (PowerShell)** use:

```powershell
Copy-Item global\commands\*.md $HOME\.claude\commands\
Copy-Item -Recurse -Force project\.claude\* C:\path\to\tool-portal\.claude\
```

## Automation (cross-machine)

The `automation/` watcher needs no per-machine install beyond Node 18+ and the Atoll CLI.
Local testing uses the `blitz` Atoll profile; the always-on hourly watcher runs as a cloud
routine (machine-independent). Full setup — env secrets, Telegram chat ID, routine creation,
and macOS notes — is in [`automation/README.md`](automation/README.md).
