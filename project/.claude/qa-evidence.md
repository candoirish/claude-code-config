# QA Evidence — screenshots + video on the PR

Extends **Phase 4.75 (E2E with Playwright + local Supabase)**. After the E2E tests
pass, capture a Chromium **video** and a **screenshot per acceptance criterion**,
then post them on the PR as inline evidence — the same shape as
[tool-portal#699](https://github.com/VMG-Digital/tool-portal/pull/699), but produced
by this pipeline's own harness against your header-based E2E auth (no collie,
no Google Drive/rclone).

## Pipeline position

```
Phase 4.75 E2E (local Supabase, header auth)
        │  tests green
        ▼
QA evidence harness  ── records video + per-AC screenshots ──► tests/e2e/.qa/qa-results.json
        │
        ▼
qa-publish.mjs  ── ffmpeg webm→mp4, upload assets to GitHub release ──► tests/e2e/.qa/qa-comment.md
        │
        ▼
Phase 7 (pr-manager)  ── gh pr comment --body-file qa-comment.md ──► PR evidence comment
```

Screenshots are **mandatory**: a text-only QA result is rejected. If Playwright can't
launch or record, the harness fails the phase rather than posting evidence-free results.

## Files (copied into the worktree by the workflow)

- `.claude/qa/qa-harness.template.mjs` — copy to `qa-harness.mjs` in the worktree,
  then edit the `BEGIN CHECKS … END CHECKS` block to add one `qaCheck(name, status, detail)`
  per acceptance criterion. It authenticates via the project's `tests/e2e/e2e-auth`
  `login(page)` (same header auth as Phase 4.75), records a 1920×1080 video, and
  screenshots at every checkpoint.
- `.claude/qa/qa-publish.mjs` — converts the recording, uploads screenshots + video
  to the repo's `qa-assets` GitHub release (unique timestamped filenames, reused
  release), and writes `qa-comment.md`. Cross-platform (`gh` + `ffmpeg`).

## Run (inside the E2E env block from Phase 4.75)

```bash
# 1. record — same env vars as Phase 4.75, plus QA_* 
APP_E2E_AUTH=1 APP_E2E_AUTH_TOKEN=local-dev-token \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY={publishable_key} \
SUPABASE_SERVICE_ROLE_KEY={secret_key} \
PLAYWRIGHT_BASE_URL=http://localhost:50551 \
QA_SPEC_ID={SPEC-ID} QA_OUT_DIR=tests/e2e/.qa \
node qa-harness.mjs

# 2. publish — uploads assets, writes the comment (does NOT post yet)
node .claude/qa/qa-publish.mjs --repo VMG-Digital/tool-portal --pr {N} \
     --out tests/e2e/.qa --preview {vercel_preview_url}
```

The pr-manager posts `tests/e2e/.qa/qa-comment.md` in Phase 7 with
`gh pr comment {N} --body-file tests/e2e/.qa/qa-comment.md`. Pass `--post` to
qa-publish.mjs only if you want it to post directly (bypasses the pr-manager gate).

## PR comment format (produced automatically)

```markdown
## QA evidence — `SPEC-ID`

| | |
| --- | --- |
| **preview** | <vercel url> |
| **functional** | all requirements verified |
| **design** | approved |
| **verdict** | **passed** |

---

#### ✅ AC1 — <criterion>
![AC1](https://github.com/<repo>/releases/download/qa-assets/<timestamp>-01-....png)
<one-line evidence>

---

<details>
<summary>Full QA recording</summary>
[Watch / download recording](https://github.com/<repo>/releases/download/qa-assets/qa-....mp4)
</details>
```

## Prerequisites

- `ffmpeg` on PATH (webm→mp4). If missing, the raw `.webm` is linked instead.
- `gh` authenticated with `repo` scope (release create/upload, PR comment).
- The `qa-assets` prerelease is created automatically on first run — **do not delete it**;
  it is the inline-image host for every PR.

## Cleanup

`tests/e2e/.qa/` is scratch — add it to `.gitignore`. The committed artifact is the
PR comment; the assets live on the GitHub release, not in the repo.

## Wording rule

Neutral, product-facing language only — same as the Phase 7b review-summary rule.
No agent names, no tool names, no "collie". "All requirements verified", "verdict: passed".
