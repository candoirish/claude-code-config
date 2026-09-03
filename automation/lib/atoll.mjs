// Thin wrapper around the `atoll` CLI. Runs the same on Windows, macOS, and the
// Anthropic cloud environment.
//
// Auth resolution (in priority order):
//   1. ATOLL_PROFILE set  -> `atoll --profile <name> ...`   (local dev; e.g. blitz)
//   2. ATOLL_API_KEY set  -> `atoll --env-mode ...`          (cloud; reads ATOLL_* env)
//
// The CLI binary defaults to `atoll` but can be overridden with ATOLL_BIN
// (e.g. "npx -y @atollhq/cli@latest" in a cloud environment without a global install).

import { spawn } from "node:child_process";

const BIN = process.env.ATOLL_BIN || "atoll";

function authArgs() {
  if (process.env.ATOLL_PROFILE) return ["--profile", process.env.ATOLL_PROFILE];
  if (process.env.ATOLL_API_KEY) return ["--env-mode"];
  throw new Error(
    "No Atoll auth: set ATOLL_PROFILE (local) or ATOLL_API_KEY + ATOLL_ORG_ID (cloud/env-mode)."
  );
}

function runOnce(args, json) {
  const parts = BIN.split(" ");
  const cmd = parts[0];
  const full = [...parts.slice(1), ...authArgs(), ...args];
  if (json) full.push("--json");

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, full, { shell: process.platform === "win32" });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`atoll ${args.join(" ")} exited ${code}: ${err.trim() || out.trim()}`));
      }
      if (!json) return resolve(out);
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`atoll ${args.join(" ")} returned non-JSON: ${out.slice(0, 300)}`));
      }
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run the CLI with a small retry — the atoll CLI intermittently crashes on
// Windows (exit 0xC0000409) and network blips happen; a second attempt clears
// nearly all of these. Retries up to 3 attempts with linear backoff.
export async function atoll(args, { json = true, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await runOnce(args, json);
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(400 * (attempt + 1));
    }
  }
  throw lastErr;
}

// List open issues in a project, newest first.
export async function listOpenIssues(projectId, limit = 50) {
  const res = await atoll([
    "issue", "list",
    "--project", projectId,
    "--open",
    "--order-by", "created_at",
    "--order-dir", "desc",
    "--limit", String(limit),
  ]);
  return res.items || [];
}

// Assign an issue to the calling identity.
//
// `--to self` only resolves for regular member accounts. The `blitz` API key
// is an agent-type identity (memberType: agent), and for agents `self` fails
// with "You are not a member of this organisation" — confirmed live against
// VTP-2201. So resolve the actor's own ID once (via `auth status`) and assign
// to that explicitly; this also works for a regular member key unchanged.
let selfIdCache = null;
async function resolveSelfId() {
  if (selfIdCache) return selfIdCache;
  if (process.env.ATOLL_ASSIGNEE_ID) return (selfIdCache = process.env.ATOLL_ASSIGNEE_ID);
  const status = await atoll(["auth", "status"]);
  const id = status?.auth?.userId || status?.auth?.agentId;
  if (!id) throw new Error("Could not resolve caller identity from `atoll auth status`.");
  return (selfIdCache = id);
}

export async function claimIssue(identifier) {
  const id = await resolveSelfId();
  return atoll(["issue", "assign", identifier, "--to", id]);
}

// Add a label (best-effort; label must exist or the CLI will create/attach it).
export async function addLabel(identifier, label) {
  return atoll(["label", "add", identifier, label], { json: false }).catch(() => null);
}

// Post a comment on an issue.
export async function comment(identifier, body) {
  return atoll(["comment", "add", identifier, "--body", body], { json: false }).catch(() => null);
}

// List recent comments on an issue (used to detect a human approval).
export async function listComments(identifier, limit = 20) {
  const res = await atoll(["comment", "list", identifier, "--limit", String(limit)]).catch(() => null);
  return res ? res.items || [] : [];
}

// Move an issue to a board column (status). Optional comment explains the move.
export async function updateStatus(identifier, status, commentBody) {
  const args = ["issue", "update", identifier, "--status", status];
  if (commentBody) args.push("--comment-body", commentBody);
  return atoll(args);
}

// List issues in a given status within a project (e.g. the "ready to build" column).
export async function listByStatus(projectId, status, limit = 50) {
  const res = await atoll([
    "issue", "list",
    "--project", projectId,
    "--status", status,
    "--order-by", "priority",
    "--order-dir", "asc",
    "--limit", String(limit),
  ]);
  return res.items || [];
}

// Issues assigned to me (the "claimed" queue the desktop /workflow consumes).
export async function listMyOpenIssues() {
  const res = await atoll([
    "issue", "list",
    "--scope", "mine",
    "--open",
    "--order-by", "updated_at",
    "--order-dir", "desc",
    "--limit", "50",
  ]);
  return res.items || [];
}
