#!/usr/bin/env node
// Atoll issue watcher — runs once per invocation (the cloud routine calls it hourly).
//
// Two jobs each tick:
//   1. NOTIFY  — new open issues in watched projects/statuses within the lookback
//                window get a Telegram ping: "reply: pickup <IDENTIFIER>".
//   2. PICKUP  — Telegram replies of "pickup <IDENTIFIER>" assign that issue to you
//                (self) so the desktop /workflow can consume it. Idempotent.
//
// Stateless by design: NOTIFY uses a time window, PICKUP re-reads the Telegram
// update window and assign-to-self is a safe no-op when already claimed.
//
// Flags:
//   --dry-run       do everything read-only; print what WOULD be sent/claimed
//   --no-telegram   skip Telegram entirely (detection smoke-test with Atoll only)
//   --notify-only   run job 1 only
//   --pickup-only   run job 2 only

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { listOpenIssues, claimIssue, addLabel, comment } from "./lib/atoll.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, "watch-config.json"), "utf8"));

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const NO_TG = args.has("--no-telegram");
const notifyOnly = args.has("--notify-only");
const pickupOnly = args.has("--pickup-only");

let tg = null;
if (!NO_TG) {
  tg = await import("./lib/telegram.mjs");
  if (!tg.configured) {
    console.error("Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). Use --no-telegram to test Atoll only.");
    if (!DRY) process.exit(1);
  }
}

const projectByPrefix = new Map(cfg.projects.map((p) => [p.identifierPrefix.toUpperCase(), p]));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cleanTitle = (t) => t.replace(/^\[[^\]]*\]\s*/g, "").replace(/\[[^\]]*\]\s*/g, "").trim();

// This process doesn't reliably get desktop/window access when spawning GUI apps
// via child_process (confirmed live), so it never launches anything itself — it
// only emits a machine-readable LAUNCH_JSON line. run-watch.ps1 (native
// PowerShell, which does have desktop access) parses it and:
//   1. silently checks out + pulls `base` in the main checkout at `path`
//   2. opens a NEW Claude Code DESKTOP conversation there via the
//      claude://code/new?folder=<path> deep link (confirmed live — this is the
//      same action as the app's own "New Claude Code Session"), with `prompt`
//      placed on the clipboard, since that deep link has no message parameter
//      (verified against the app's own bundled source).
//
// Prompt depends on whether this project's own /workflow has the `pickup <ID>` entry
// mode: tool-portal's does (added alongside this automation); coal's is a separate,
// older copy we deliberately don't modify — for coal, fall back to a plain
// direct-request prompt built from the issue title, which its /workflow already supports.
function describeLaunch(id, proj, issueTitle) {
  if (!proj.localRepoPath) {
    console.log(`[launch] ${proj.key}: no localRepoPath configured — skipping auto-launch for ${id}`);
    return null;
  }
  const base = proj.baseBranch || "main";
  const prompt = proj.supportsPickupEntry
    ? `/workflow pickup ${id}`
    : `/workflow ${cleanTitle(issueTitle || id)} (Atoll ${id})`;
  return { id, project: proj.key, path: proj.localRepoPath, base, prompt };
}

// ---------- Job 1: NOTIFY ----------
async function notify() {
  const { lookbackMinutes, watchedStatuses, skipAssignedToSelf, excludeAssigneeIds, maxPerTick } =
    cfg.notify;
  const cutoff = Date.now() - lookbackMinutes * 60 * 1000;
  const exclude = new Set(excludeAssigneeIds || []);
  const found = [];

  for (const proj of cfg.projects) {
    let issues = [];
    try {
      issues = await listOpenIssues(proj.atollProjectId, 50);
    } catch (e) {
      console.error(`[notify] ${proj.key}: list failed: ${e.message}`);
      continue;
    }
    for (const it of issues) {
      const created = new Date(it.created_at).getTime();
      if (created < cutoff) continue; // outside the window → treated as already-seen
      if (watchedStatuses?.length && !watchedStatuses.includes(it.status)) continue;
      if (exclude.has(it.assignee_id)) continue;
      // skipAssignedToSelf: rely on the CLI identity — an issue already assigned to
      // anyone is "taken"; we only surface unassigned ones unless configured otherwise.
      if (skipAssignedToSelf && it.assignee_id) continue;
      found.push({ proj, it });
    }
  }

  found.sort((a, b) => new Date(a.it.created_at) - new Date(b.it.created_at));
  const batch = found.slice(0, cfg.notify.maxPerTick || 10);

  if (!batch.length) {
    console.log("[notify] no new issues in window");
    return;
  }

  for (const { proj, it } of batch) {
    const id = it.identifier;
    const msg =
      `🆕 <b>${esc(proj.key)}</b> · <code>${esc(id)}</code>\n` +
      `${esc(cleanTitle(it.title))}\n\n` +
      `Reply <code>${cfg.pickup.keyword} ${esc(id)}</code> to start the workflow.`;
    console.log(`[notify] ${id} — ${cleanTitle(it.title).slice(0, 60)}`);
    if (!DRY && tg) await tg.sendMessage(msg);
  }
  console.log(`[notify] ${DRY ? "(dry) " : ""}sent ${batch.length}`);
}

// ---------- Job 2: PICKUP ----------
async function pickup() {
  if (NO_TG || !tg) {
    console.log("[pickup] skipped (no telegram)");
    return;
  }
  let updates = [];
  try {
    updates = await tg.getUpdates();
  } catch (e) {
    console.error(`[pickup] getUpdates failed: ${e.message}`);
    return;
  }
  const msgs = tg.recentTextMessages(updates, cfg.pickup.updatesLookbackHours);
  const pkw = cfg.pickup.keyword.toLowerCase();
  const akw = (cfg.pickup.approveKeyword || "approve").toLowerCase();
  const pickRe = new RegExp(`^\\s*${pkw}\\s+([a-z]+-\\d+)\\s*$`, "i");
  const apprRe = new RegExp(`^\\s*${akw}\\s+([a-z]+-\\d+)\\s*$`, "i");

  const claims = new Set();
  const approvals = new Set();
  for (const m of msgs) {
    const p = m.text.match(pickRe);
    if (p) claims.add(p[1].toUpperCase());
    const a = m.text.match(apprRe);
    if (a) approvals.add(a[1].toUpperCase());
  }

  if (!claims.size && !approvals.size) {
    console.log("[pickup] no pickup/approve replies in window");
    return;
  }

  for (const id of claims) {
    const proj = projectByPrefix.get(id.split("-")[0]);
    if (!proj) {
      console.log(`[pickup] ${id}: unknown prefix, skipping`);
      continue;
    }
    console.log(`[pickup] claiming ${id}`);
    if (DRY) continue;
    try {
      const assignResult = await claimIssue(id);
      const issueTitle = assignResult?.issue?.title;
      await addLabel(id, cfg.pickup.claimLabel);
      await comment(id, "Claimed for /workflow via Telegram pickup.");

      const launch = cfg.autoLaunch?.enabled ? describeLaunch(id, proj, issueTitle) : null;
      if (launch) {
        // run-watch.ps1 greps stdout for this exact prefix and does the actual launch.
        console.log(`LAUNCH_JSON ${JSON.stringify(launch)}`);
      }
      await tg.sendMessage(
        launch
          ? `✅ <code>${esc(id)}</code> claimed — opening Claude Code Desktop for it now. The starting prompt is on your clipboard — paste (Ctrl+V) and press Enter to begin.`
          : `✅ <code>${esc(id)}</code> claimed. Open Claude Code and run <code>/workflow</code> to start it.`
      );
    } catch (e) {
      console.error(`[pickup] ${id} failed: ${e.message}`);
      await tg.sendMessage(`⚠️ Could not claim <code>${esc(id)}</code>: ${esc(e.message)}`).catch(() => {});
    }
  }

  // Approvals: post the approval marker so a parked card resumes next loop cycle.
  const marker = cfg.pickup.approvalMarker || "WF-APPROVED";
  for (const id of approvals) {
    if (!projectByPrefix.has(id.split("-")[0])) {
      console.log(`[approve] ${id}: unknown prefix, skipping`);
      continue;
    }
    console.log(`[approve] approving ${id}`);
    if (DRY) continue;
    try {
      await comment(id, `${marker}: human approved — resume the paused step.`);
      await tg.sendMessage(`👍 <code>${esc(id)}</code> approved. It resumes on the next /workflow loop cycle.`);
    } catch (e) {
      console.error(`[approve] ${id} failed: ${e.message}`);
    }
  }
}

if (!pickupOnly) await notify();
if (!notifyOnly) await pickup();
console.log("[watch] done");
