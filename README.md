# claude-code-config

Personal backup of Claude Code custom commands/agents/skills/hooks used across
repos (`tool-portal`, `coal`, and any future repo), so they can be restored on a
different machine (`.claude/` is gitignored in each project repo, and user-level
`~/.claude/` isn't synced anywhere on its own).

## What's here

- `global/commands/` — self-contained slash commands with no project dependencies.
  Installed at `~/.claude/commands/`, so they work in **any** repo.
  - `workflow.md` — the spec-driven pipeline (`spec-architect` → `agent-router` →
    `implementer`/`ui-specialist` → `tester` → `intent-verifier` →
    `preview-reviewer` → `reviewer` → `pr-manager` → `closer`). As of
    2026-09-11 this replaced separate per-project copies that used to live under
    `project/.claude/` (tool-portal) and `project-coal/.claude/` (coal) — those
    two pipelines had evolved independently, but were unified into one global
    version to avoid drift and re-copying on every new repo. The global version
    is written to adapt to whatever project it runs in (checks for a linked
    Vercel/Supabase setup, an issue tracker, a local E2E stack, etc. rather than
    assuming any one project's specifics) and includes the visual-proof PR
    requirement (screenshot + walkthrough video/GIF on every PR) that coal's
    copy had and tool-portal's had fallen behind on.
  - `commit-code.md`, `create-pr.md` — existing generic commands.
- `global/agents/` — the 11 subagents `/workflow` spawns: `agent-router`,
  `closer`, `implementer`, `intent-verifier`, `pr-manager`, `prd-reader`,
  `preview-reviewer`, `reviewer`, `spec-architect`, `tester`, `ui-specialist`.
  Installed at `~/.claude/agents/`.
- `global/skills/grilling/` — the spec stress-test skill `/workflow` invokes
  before presenting a spec for approval. Installed at `~/.claude/skills/`.
- `project/.claude/` — **tool-portal-specific** remainder: hooks
  (`pre-test-verify.sh` etc.), the QA-evidence harness (`qa/`), and
  `settings.json`. No longer includes `commands/` or `agents/` — those are
  global now.
- `project-coal/.claude/` — **coal-specific** remainder: hooks, `launch.json`,
  and its third-party skill pack (`ask-matt`, `tdd`, etc. — see
  [`project-coal/.claude/README.md`](project-coal/.claude/README.md)). Also no
  longer includes `commands/` or `agents/`.
- `automation/` — machine-independent Atoll→Telegram→/workflow watcher (new-issue
  pings, `pickup <ID>` claiming, auto-launch) for **both** tool-portal and coal. Pure
  Node ESM, no deps. Runs as a local Windows Scheduled Task today; see
  [`automation/README.md`](automation/README.md).

## Restore on a new machine

**Global commands, agents, and skills** (work in any repo — do this first).
Run from anywhere; it clones to a temp dir and cleans up:

```bash
git clone https://github.com/candoirish/claude-code-config.git /tmp/ccc-restore && \
mkdir -p ~/.claude/commands ~/.claude/agents ~/.claude/skills && \
cp /tmp/ccc-restore/global/commands/*.md ~/.claude/commands/ && \
cp /tmp/ccc-restore/global/agents/*.md ~/.claude/agents/ && \
cp -r /tmp/ccc-restore/global/skills/grilling ~/.claude/skills/ && \
rm -rf /tmp/ccc-restore && \
echo "✅ Restored commands, agents, and grilling skill to ~/.claude/"
```

> **Note:** all three target dirs must exist before copying — `mkdir -p` above
> creates `commands`, `agents`, and `skills` in one go. (The earlier version of
> this snippet skipped `~/.claude/commands`, so the first `cp` failed.) If you'd
> rather copy from an existing local checkout, `cd` into it first and drop the
> `git clone`/`rm -rf` lines.

**Project-scoped remainder** (hooks, QA harness, coal's skill pack — only inside
the matching checkout):

```bash
cp -r project/.claude/* /path/to/tool-portal/.claude/
cp -r project-coal/.claude/* /path/to/coal/.claude/
```

`.claude/` is gitignored in both project repos, so this copy step is needed after
every fresh clone.

On **macOS/Linux** the same commands work as written. On **Windows (PowerShell)** use:

```powershell
New-Item -ItemType Directory -Force $HOME\.claude\commands | Out-Null
Copy-Item global\commands\*.md $HOME\.claude\commands\
New-Item -ItemType Directory -Force $HOME\.claude\agents | Out-Null
Copy-Item global\agents\*.md $HOME\.claude\agents\
New-Item -ItemType Directory -Force $HOME\.claude\skills\grilling | Out-Null
Copy-Item -Recurse -Force global\skills\grilling\* $HOME\.claude\skills\grilling\
Copy-Item -Recurse -Force project\.claude\* C:\path\to\tool-portal\.claude\
Copy-Item -Recurse -Force project-coal\.claude\* C:\path\to\coal\.claude\
```

`project-coal/.claude/skills/` also includes coal's third-party skill pack (`ask-matt`,
`tdd`, etc.), copied in as real files even though coal's own repo gitignores it —
so a fresh restore doesn't depend on re-running coal's `setup-matt-pocock-skills` command.
(`grilling` was removed from that pack here since it's now installed globally instead.)

## Automation (cross-machine)

The `automation/` watcher needs no per-machine install beyond Node 18+ and the Atoll CLI.
Local testing uses the `blitz` Atoll profile; the always-on watcher runs as a local Windows
Scheduled Task (every 1 minute) that auto-launches a terminal running `/workflow pickup <ID>`
for either project. Full setup — env secrets, Telegram chat ID, task creation, and macOS
notes — is in [`automation/README.md`](automation/README.md).
