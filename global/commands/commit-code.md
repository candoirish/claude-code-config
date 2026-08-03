---
allowed-tools: Bash(git config:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*)
description: Stage and commit code changes (excludes .md, .csv, .xlsx files and .claude/ directories) using conventional commit format.
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

1. **Verify git author email** is set to `irish@vmgdigital.com`:
   ```bash
   git config user.email
   ```
   If it differs, set it:
   ```bash
   git config user.email "irish@vmgdigital.com"
   ```

2. **Stage all changed files**, explicitly excluding `.md`, `.csv`, `.xlsx` files and anything inside `.claude/` directories:
   ```bash
   git add $(git diff --name-only HEAD | grep -Ev '\.(md|csv|xlsx)$' | grep -Ev '^\.claude/') 2>/dev/null || true
   git add $(git ls-files --others --exclude-standard | grep -Ev '\.(md|csv|xlsx)$' | grep -Ev '^\.claude/') 2>/dev/null || true
   ```

3. **Derive the commit message** using this repo's conventional commit format:
   ```
   type(scope): short imperative description
   ```
   - **type** — one of: `feat`, `fix`, `refactor`, `chore`, `test`, `perf`
   - **scope** — the tool or feature directory name, e.g. `brand-checker-v2`, `schema-markup`, `population-radius`
   - **description** — lowercase, imperative, ≤ 60 chars after the prefix

   Examples from this repo:
   - `feat(brand-checker-v2): add CTA & Buttons section to brand library`
   - `fix(brand-checker-v2): sanitize user-supplied strings in PDF HTML export`
   - `fix(schema-markup): abort status polling on unmount`
   - `refactor(schema-markup): streamline result persistence and storage cleanup`

4. **Create the commit** with the derived message. Do not add any co-author or generated-by footers.

Do not send any other text or messages besides the tool calls required to complete these steps.
