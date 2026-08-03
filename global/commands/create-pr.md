---
description: "Create a pull request with a title and description that match this repo's PR conventions — conventional-commit title, structured Summary / sections / Test plan body."
---

# Create PR

Use this command when the user asks to open, create, or submit a PR for the current branch.

---

## Base branch argument

The user may pass a base branch as an argument, e.g. `/create-pr beta` or `/create-pr staging`.

- If an argument is provided, use it as the base branch throughout (replace every `main` reference below).
- If no argument is provided, default to `main`.

Store the resolved base branch as `BASE` for the steps below.

---

## Step 1 — Read context

```bash
git status
git log $BASE...HEAD --oneline
git diff $BASE...HEAD --stat
git diff $BASE...HEAD
```

Also read `CLAUDE.md` for project-specific context.

---

## Step 2 — Derive the PR title

Follow the **conventional commit** format used throughout this repo:

```
type(scope): short imperative description
```

- **type** — one of: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`
- **scope** — the tool or feature directory name, e.g. `schema-markup`, `brief-dashboard`, `brand-checker-v2`
- **description** — lowercase, imperative, ≤ 60 chars after the prefix
- Append a ticket reference if one appears in the branch name or commits, e.g. `[ATOLL-216]`

Examples from this repo:
- `feat(brand-checker-v2): add 'Minor Issue' verdict + REVIEW state`
- `fix(brief-dashboard): server-side search to fix RLS failure [ATOLL-216]`
- `fix(schema-markup): abort status polling on unmount`
- `refactor(schema-markup): streamline result persistence and storage cleanup`

---

## Step 3 — Draft the PR body

Use only the sections that are relevant to the diff. Do **not** fabricate sections or add placeholder text.

```markdown
## Summary
<1-4 bullet points or a short paragraph. Lead with the root cause for fixes, or the capability added for features. Be specific — name the component, file, or behaviour that changed.>

### <Optional subsection> (e.g. Rollup logic / Root cause / Architecture)
<Only include if the change has non-obvious internal logic worth explaining. Use bullet points.>

### What this enables (optional)
<Only for features. One short paragraph on the user-visible benefit.>

## Migration required (omit if none)
`path/to/migration.sql` — apply via Supabase dashboard SQL editor before merging:
- <bullet per schema change>

## Files changed (omit for small PRs ≤ 3 files)
| File | Change |
|------|--------|
| `path/to/file.ts` | short description |

## UI changes (omit if no UI diff)
- <bullet per visible change>

## Test plan
- [ ] <step 1>
- [ ] <step 2>
<Cover the happy path, the fixed bug scenario, and any auth/RLS edge cases relevant to this repo.>
```

**Style rules:**
- Do NOT add the `🤖 Generated with Claude Code` footer — it is stripped by the repo convention
- Use backticks for file paths, column names, and identifiers
- Keep bullet points to one line each; wrap only when a sentence genuinely needs it
- Omit any section that would be empty or trivially obvious from the title

---

## Step 4 — Check the remote and push if needed

```bash
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "no upstream"
```

If there is no upstream, push the branch:

```bash
git push -u origin HEAD
```

---

## Step 5 — Create the PR

```bash
gh pr create \
  --base $BASE \
  --title "<title from Step 2>" \
  --body "$(cat <<'EOF'
<body from Step 3>
EOF
)"
```

`$BASE` is the branch resolved in the Base branch argument section above.

After the PR is created, output the PR URL so the user can click through to review it.
