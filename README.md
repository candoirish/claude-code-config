# claude-code-config

Personal backup of Claude Code custom commands/agents/hooks for the `tool-portal` and
`coal` repos, so they can be restored on a different machine (they're gitignored in
each repo itself via `.claude/`).

## What's here

- `global/commands/` — self-contained slash commands with no project dependencies.
  Safe to install user-wide.
- `project/.claude/` — **tool-portal's** `/workflow` command plus its subagents, hooks,
  QA-evidence harness (`qa/`), and `settings.json`. Project-scoped, not global.
- `project-coal/.claude/` — **coal's own, separate** `/workflow` command plus its
  subagents, hooks, and `launch.json`. Deliberately not merged with tool-portal's copy —
  the two pipelines evolved independently and are kept that way; see
  [`project-coal/.claude/README.md`](project-coal/.claude/README.md) for what's excluded
  (a gitignored third-party skill pack coal's own repo doesn't track either).
- `automation/` — machine-independent Atoll→Telegram→/workflow watcher (new-issue
  pings, `pickup <ID>` claiming, auto-launch) for **both** tool-portal and coal. Pure
  Node ESM, no deps. Runs as a local Windows Scheduled Task today; see
  [`automation/README.md`](automation/README.md).

## Restore on a new machine

**Global commands** (work in any repo):

```bash
cp global/commands/*.md ~/.claude/commands/
```

**Project-scoped workflow pipelines** (only inside the matching checkout):

```bash
cp -r project/.claude/* /path/to/tool-portal/.claude/
cp -r project-coal/.claude/* /path/to/coal/.claude/
```

`.claude/` is gitignored in both repos, so this copy step is needed after every fresh clone.

On **macOS/Linux** the same commands work as written. On **Windows (PowerShell)** use:

```powershell
Copy-Item global\commands\*.md $HOME\.claude\commands\
Copy-Item -Recurse -Force project\.claude\* C:\path\to\tool-portal\.claude\
Copy-Item -Recurse -Force project-coal\.claude\* C:\path\to\coal\.claude\
```

`project-coal/.claude/skills/` also includes coal's third-party skill pack (`ask-matt`,
`grilling`, `tdd`, etc.), copied in as real files even though coal's own repo gitignores it —
so a fresh restore doesn't depend on re-running coal's `setup-matt-pocock-skills` command.

## Automation (cross-machine)

The `automation/` watcher needs no per-machine install beyond Node 18+ and the Atoll CLI.
Local testing uses the `blitz` Atoll profile; the always-on watcher runs as a local Windows
Scheduled Task (every 1 minute) that auto-launches a terminal running `/workflow pickup <ID>`
for either project. Full setup — env secrets, Telegram chat ID, task creation, and macOS
notes — is in [`automation/README.md`](automation/README.md).
