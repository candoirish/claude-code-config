#!/usr/bin/env node
// Move an Atoll card to the board column for a given /workflow phase — the
// "blitz moves it automatically" step. The workflow calls this at each phase
// boundary so the board always reflects reality.
//
// Usage:
//   node automation/atoll-move.mjs <IDENTIFIER> <phase> ["optional note"]
//   node automation/atoll-move.mjs VTP-1234 in_progress "Implementation started"
//
//   phases: idea | ready | in_progress | remediation | testing | human_gate | waiting | done | cancelled
//
// Flags: --dry-run (print the intended move, change nothing)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { updateStatus } from "./lib/atoll.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const boardMap = JSON.parse(readFileSync(join(__dirname, "board-map.json"), "utf8"));
const watchCfg = JSON.parse(readFileSync(join(__dirname, "watch-config.json"), "utf8"));

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const [id, phase, note] = args.filter((a) => a !== "--dry-run");

if (!id || !phase) {
  console.error("Usage: atoll-move.mjs <IDENTIFIER> <phase> [note] [--dry-run]");
  console.error("phases:", boardMap.phases.$order.join(", "));
  process.exit(1);
}

const prefix = id.split("-")[0].toUpperCase();
const projEntry = watchCfg.projects.find((p) => p.identifierPrefix.toUpperCase() === prefix);
if (!projEntry) {
  console.error(`Unknown identifier prefix '${prefix}'. Known:`, watchCfg.projects.map((p) => p.identifierPrefix).join(", "));
  process.exit(1);
}

const projMap = boardMap.projects[projEntry.key];
if (!projMap) {
  console.error(`No board map for project '${projEntry.key}'.`);
  process.exit(1);
}

const status = projMap.map[phase];
if (!status) {
  console.error(`Phase '${phase}' not mapped for '${projEntry.key}'. Valid:`, Object.keys(projMap.map).join(", "));
  process.exit(1);
}

console.log(`${DRY ? "(dry) " : ""}${id}: phase '${phase}' → status '${status}' [${projEntry.key}]`);
if (DRY) process.exit(0);

await updateStatus(id, status, note);
console.log(`Moved ${id} to '${status}'.`);
