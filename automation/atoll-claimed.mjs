#!/usr/bin/env node
// Desktop-side consumer: list Atoll issues you've claimed (assigned to self) that
// are ready to run — i.e. not yet in a terminal or in-progress status. The
// /workflow command runs this on a no-arg / pickup entry to find work to start.
//
// Usage:
//   ATOLL_PROFILE=blitz node automation/atoll-claimed.mjs [--all]
//     (default: only todo/backlog/claimed-and-idle; --all: every open issue of mine)
//
// Also supports claiming from the desktop directly (parity with Telegram pickup):
//   ATOLL_PROFILE=blitz node automation/atoll-claimed.mjs --claim VTP-1234

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { listMyOpenIssues, listOpenIssues, claimIssue, addLabel, comment } from "./lib/atoll.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, "watch-config.json"), "utf8"));
const args = process.argv.slice(2);

const flagVal = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : (args[i + 1] || "").toUpperCase();
};

const claimId = flagVal("--claim");
if (claimId) {
  if (!/^[A-Z]+-\d+$/.test(claimId)) {
    console.error("Usage: --claim <IDENTIFIER e.g. VTP-1234>");
    process.exit(1);
  }
  await claimIssue(claimId);
  await addLabel(claimId, cfg.pickup.claimLabel);
  await comment(claimId, "Claimed for /workflow from the desktop.");
  console.log(JSON.stringify({ claimed: claimId }, null, 2));
  process.exit(0);
}

// Desktop parity for Telegram "approve <ID>": unpark a card awaiting human approval.
const approveId = flagVal("--approve");
if (approveId) {
  if (!/^[A-Z]+-\d+$/.test(approveId)) {
    console.error("Usage: --approve <IDENTIFIER e.g. VTP-1234>");
    process.exit(1);
  }
  const marker = cfg.pickup.approvalMarker || "WF-APPROVED";
  await comment(approveId, `${marker}: human approved — resume the paused step.`);
  console.log(JSON.stringify({ approved: approveId }, null, 2));
  process.exit(0);
}

// --available: browse NEW pickable issues in the watched projects (no Telegram
// needed). Lists open issues in the watched statuses that are unassigned or
// already yours — the desktop equivalent of the Telegram "new issue" ping.
if (args.includes("--available")) {
  const statuses = cfg.notify.watchedStatuses || [];
  const rows = [];
  for (const proj of cfg.projects) {
    let issues = [];
    try {
      issues = await listOpenIssues(proj.atollProjectId, 50);
    } catch (e) {
      console.error(`[available] ${proj.key}: ${e.message}`);
      continue;
    }
    for (const it of issues) {
      if (statuses.length && !statuses.includes(it.status)) continue;
      if (it.assignee_id && !args.includes("--include-assigned")) continue; // unassigned/pickable only
      rows.push({
        identifier: it.identifier,
        project: proj.key,
        status: it.status,
        priority: it.priority ?? 3,
        title: it.title,
        url: it.url,
        created_at: it.created_at,
      });
    }
  }
  rows.sort((a, b) => a.priority - b.priority || new Date(b.created_at) - new Date(a.created_at));
  console.log(JSON.stringify({ count: rows.length, available: rows }, null, 2));
  process.exit(0);
}

const all = args.includes("--all");
const projById = new Map(cfg.projects.map((p) => [p.atollProjectId, p]));
const READY = new Set(["todo", "backlog", "in_review", "planned"]);

const mine = await listMyOpenIssues();
const rows = mine
  .filter((it) => all || READY.has(it.status))
  .map((it) => ({
    identifier: it.identifier,
    project: projById.get(it.project_id)?.key || it.projectSlug || it.project_id,
    status: it.status,
    title: it.title,
    url: it.url,
    created_at: it.created_at,
  }));

console.log(JSON.stringify({ count: rows.length, issues: rows }, null, 2));
