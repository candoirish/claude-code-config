# claude-code-config

Personal backup of Claude Code custom commands/agents/hooks for the `tool-portal` repo,
so they can be restored on a different machine (they're gitignored in `tool-portal` itself
via `.claude/`).

## What's here

- `global/commands/` — self-contained slash commands with no project dependencies.
  Safe to install user-wide.
- `project/.claude/` — the `/workflow` command plus the 9 subagents, 4 hooks, and
  `settings.json` it depends on. These are specific to the `tool-portal` repo's pipeline
  and should stay project-scoped, not global (the hooks assume this repo's tooling/structure).

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
