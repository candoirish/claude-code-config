#!/usr/bin/env node
// Loop helper: return the next eligible card to build — the highest-priority
// card sitting in the "ready to build" column (ready→todo) that is assigned to
// you, across the watched projects. /workflow loop mode calls this each cycle,
// runs the returned card's pipeline, then calls again.
//
// Usage: ATOLL_PROFILE=blitz node automation/next-card.mjs
// Output: JSON { card: {...} | null, remaining: N }

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { atoll } from "./lib/atoll.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const boardMap = JSON.parse(readFileSync(join(__dirname, "board-map.json"), "utf8"));
const watchCfg = JSON.parse(readFileSync(join(__dirname, "watch-config.json"), "utf8"));

const pool = [];
for (const proj of watchCfg.projects) {
  const readyStatus = boardMap.projects[proj.key]?.map.ready;
  if (!readyStatus) continue;
  let res;
  try {
    res = await atoll([
      "issue", "list",
      "--project", proj.atollProjectId,
      "--status", readyStatus,
      "--scope", "mine",
      "--order-by", "priority",
      "--order-dir", "asc",
      "--limit", "50",
    ]);
  } catch (e) {
    console.error(`[next-card] ${proj.key}: ${e.message}`);
    continue;
  }
  for (const it of res.items || []) {
    // `--scope mine` omits `identifier` (confirmed live) — synthesize it.
    pool.push({
      identifier: it.identifier || `${proj.identifierPrefix}-${it.number}`,
      project: proj.key,
      priority: it.priority ?? 3,
      status: it.status,
      title: it.title,
      description: it.description,
      url: it.url,
      created_at: it.created_at,
    });
  }
}

// Priority asc (0=urgent first), then oldest first.
pool.sort((a, b) => a.priority - b.priority || new Date(a.created_at) - new Date(b.created_at));

const card = pool[0] || null;
console.log(JSON.stringify({ card, remaining: pool.length }, null, 2));
