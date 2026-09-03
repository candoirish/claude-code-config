# Atoll → Telegram → /workflow automation

Always-on watcher that pings Telegram when a **new Atoll issue** appears in **coal**
or **tool-portal**, lets you **claim it by replying `pickup <ID>`**, and hands it to
the local `/workflow` pipeline (where you watch every subagent). Machine-independent
and portable between Windows and macOS — the detection runs in the cloud, the actual
build runs on whichever machine you're at.

```
┌─ CLOUD routine (hourly) ─ automation/atoll-watch.mjs ────────┐
│  new open issue in coal/tool-portal  ─►  Telegram ping        │
│  Telegram reply "pickup VTP-1234"    ─►  assign to you (Atoll) │
└───────────────────────────────────────────────────────────────┘
                          │  (claimed = assigned to you)
                          ▼
   Desktop: /workflow  ─►  automation/atoll-claimed.mjs finds it
                          ─►  full pipeline runs locally (you watch)
                          ─►  QA evidence (video+screenshots) on the PR
```

**Stateless by design.** New-issue detection uses a time window; pickup re-reads the
Telegram update window and assign-to-self is idempotent. Nothing is persisted to git,
so the same code runs identically in the cloud and on both laptops.

## Components

| File | Runs where | Does |
| --- | --- | --- |
| `watch-config.json` | everywhere | projects, lookback window, watched statuses, pickup keyword |
| `board-map.json` | everywhere | maps pipeline phases → each project's real Atoll columns |
| `lib/atoll.mjs` | everywhere | thin wrapper over the `atoll` CLI (profile locally, `--env-mode` in cloud) |
| `lib/telegram.mjs` | everywhere | Telegram Bot API via global `fetch` (no deps) |
| `atoll-watch.mjs` | **cloud** hourly | notify new issues + ingest `pickup` replies |
| `atoll-claimed.mjs` | **desktop** | list issues you've claimed; `--claim <ID>` to claim without Telegram |
| `atoll-move.mjs` | **desktop** | move a card to the column for a pipeline phase (blitz's automatic moves) |
| `next-card.mjs` | **desktop** | loop mode: next eligible card in the "ready to build" column |

## Kanban board sync (blitz moves cards automatically)

The `/workflow` pipeline is a Kanban system — each issue is a card that moves left-to-right
across the Atoll board as the pipeline runs, and the main agent moves it at every phase
boundary via `atoll-move.mjs`. The phase→column mapping lives in `board-map.json` (verified
against the real status keys on each board):

| Pipeline phase | coal column | tool-portal column |
| --- | --- | --- |
| `ready` (queued to build) | `todo` | `todo` |
| `in_progress` (implementing) | `in_progress` | `in_progress` |
| `testing` (tests + QA evidence) | `qa` | `testing` |
| `human_gate` (preview verification) | `decision_gate` | `testing` |
| `remediation` (a check failed) | `in_progress` | `in_progress` |
| `waiting` (blocked) | `waiting_on_hold` | `backlog` |
| `done` (merged + deployed) | `done` | `done` |

```bash
ATOLL_PROFILE=blitz node automation/atoll-move.mjs VTP-1234 in_progress "Pipeline started"
ATOLL_PROFILE=blitz node automation/atoll-move.mjs VTP-1234 testing --dry-run   # preview only
```

Edit `board-map.json` to re-map. If you want the diagram's exact columns (a dedicated
`remediation` or `human_testing` column), create them once with
`atoll board-column create --project <id> --key human_testing --label "Human Testing"`,
then point the map at the new key.

## Loop mode — the board as a queue

`/workflow loop` drains the "ready to build" column one card at a time:
`next-card.mjs` returns the highest-priority claimed card, the pipeline runs it end-to-end
(moving it across the board), then it repeats. Human gates (preview approval, collie
permission) still pause. The hourly watcher keeps feeding the `ready` column, so watcher +
loop together form the full IDEA → … → DONE → repeat cycle. See the **Loop Mode** section
in `project/.claude/commands/workflow.md`.

Requires **Node 18+** (global `fetch`). No npm dependencies.

## Secrets / environment

Never commit these. The scripts read them from the environment.

| Var | Cloud (routine) | Local (dev/desktop) |
| --- | --- | --- |
| `ATOLL_API_KEY` | ✅ required | not needed (use `ATOLL_PROFILE=blitz`) |
| `ATOLL_ORG_ID` | ✅ `0538a1dc-bba0-4d61-9afd-cf2e39031c2d` | via profile |
| `ATOLL_PROFILE` | — | `blitz` |
| `TELEGRAM_BOT_TOKEN` | ✅ required | required to test pickup |
| `TELEGRAM_CHAT_ID` | ✅ required | required to test pickup |
| `ATOLL_BIN` | optional (`npx -y @atollhq/cli@latest` if no global install) | optional |

### Get your Telegram chat ID (bot token already in hand)

Send any message to your bot in the target chat, then:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | grep -o '"chat":{"id":[-0-9]*'
```

The number after `"id":` is `TELEGRAM_CHAT_ID` (negative for groups).

## Local testing (uses the `blitz` profile — no keys in the shell history)

```bash
# detection only (no Telegram):
ATOLL_PROFILE=blitz node automation/atoll-watch.mjs --dry-run --no-telegram --notify-only

# full dry run once TELEGRAM_* are exported (prints, sends nothing, claims nothing):
ATOLL_PROFILE=blitz TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... \
  node automation/atoll-watch.mjs --dry-run

# what /workflow will pick up:
ATOLL_PROFILE=blitz node automation/atoll-claimed.mjs
```

## Cloud routine setup (the always-on part)

1. **Set the four env secrets** in the cloud environment on
   <https://claude.ai/code> → Environments → (your environment) → Environment variables:
   `ATOLL_API_KEY`, `ATOLL_ORG_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
2. **Create the routine** (done via the `schedule` skill / `RemoteTrigger`). It:
   - checks out this repo,
   - runs `node automation/atoll-watch.mjs`,
   - reports what it sent/claimed.
   - Schedule: hourly (cron minimum interval is 1 hour).
3. Manage/inspect at <https://claude.ai/code/routines>.

The routine prompt is intentionally thin — all logic lives in the committed scripts,
so behavior is deterministic and testable locally before it ever runs in the cloud.

## Portability (Windows ↔ macOS)

- Pure Node ESM, no shell-specific code, no hardcoded paths → runs as-is on both.
- On a fresh Mac: clone this repo, install the Atoll CLI (`npx @atollhq/skill-claude@latest`
  or `npm i -g @atollhq/cli`), set `ATOLL_PROFILE=blitz` locally, and the desktop side works.
- The cloud routine is machine-independent — nothing to reinstall when you switch laptops.

## Tuning

Edit `watch-config.json`:
- `notify.lookbackMinutes` — how far back "new" reaches (default 90; keep ≥ cron interval).
- `notify.watchedStatuses` — which statuses trigger a ping (default `todo`, `backlog`).
- `notify.skipAssignedToSelf` / `excludeAssigneeIds` — suppress already-owned or others' issues.
- `pickup.keyword` — the reply word (default `pickup`).
