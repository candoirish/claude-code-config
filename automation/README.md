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
| `run-watch.ps1` | **Windows scheduled task** | loads `.env.local`, runs the watcher hourly, logs to `logs/` |

## Known Atoll CLI quirks (found during live testing, already worked around in the code)

- **`issue assign --to self` fails for the `blitz` key.** It's an agent-type identity
  (`memberType: agent`), and `self` only resolves for regular member accounts — it errors
  `"You are not a member of this organisation"`. Fixed in `lib/atoll.mjs`: `claimIssue()`
  resolves the caller's real ID via `atoll auth status` once and assigns to that explicitly.
- **`issue list --scope mine` omits `identifier` and `projectSlug`** (present on a normal
  `--project` list, absent here — confirmed via raw JSON). Fixed by synthesizing
  `"<identifierPrefix>-<number>"` in `atoll-claimed.mjs` and `next-card.mjs` wherever this
  scope is used.
- **The `atoll` CLI intermittently crashes on Windows** (exit 0xC0000409 / 3221226505,
  no stderr). `lib/atoll.mjs`'s `atoll()` retries up to 3 attempts with linear backoff.

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

## Local scheduled task (Windows) — what's actually running

**The cloud routine path was tried and shelved**: the claude.ai/code environment's
"Environment variables" UI does not get injected into scheduled-routine runs (confirmed
live — `env | grep ATOLL_` came back empty inside the run), and writing secrets into the
routine config directly via the API is blocked by a safety classifier (correctly — a tool
shouldn't be the one embedding live credentials). The routine (`trig_01NpkLQ5SUxn38j7bDgMiPue`,
name `atoll-issue-watcher`) exists but is **disabled**; revisit only if the platform adds a
supported way to attach secrets to a routine.

Instead, the watcher runs as an **hourly Windows Scheduled Task**:

1. Real secrets live in `automation/.env.local` (gitignored — copy from
   `automation/.env.local.example` and fill in `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`;
   `ATOLL_PROFILE=blitz` handles Atoll auth via the existing local profile).
2. `automation/run-watch.ps1` loads that file and runs `atoll-watch.mjs`, logging to
   `automation/logs/watch-YYYY-MM-DD.log` (14-day retention).
3. The task `AtollIssueWatcher` runs it every hour. Recreate it with:
   ```powershell
   $psExe = (Get-Command powershell).Source
   $scriptPath = "<repo>\automation\run-watch.ps1"
   $action = New-ScheduledTaskAction -Execute $psExe -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
   $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
   $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
   Register-ScheduledTask -TaskName "AtollIssueWatcher" -Action $action -Trigger $trigger -Settings $settings -Force
   ```
   Check status: `Get-ScheduledTaskInfo -TaskName "AtollIssueWatcher"` (`LastTaskResult 0` = success).

**Trade-off:** this only runs while the machine is on (not true always-on like a cloud
routine would be), but it's fully proven working — see the bugs it caught below.

**On macOS**, the equivalent is a `launchd` plist (`~/Library/LaunchAgents/`) with an hourly
`StartInterval` calling the same `atoll-watch.mjs` via `node`, sourcing the same
`.env.local` shape. `run-watch.ps1`'s logic (load env file → run → log → prune) is what
to port; ask for the plist if/when you set up the Mac.

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
