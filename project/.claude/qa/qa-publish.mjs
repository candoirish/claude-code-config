#!/usr/bin/env node
// Turn a QA harness run into PR evidence: convert the recording, upload
// screenshots + video as GitHub release assets (so they render inline in the
// comment), and emit the PR comment markdown (matching the tool-portal QA
// evidence format). Cross-platform: uses `gh` and `ffmpeg` via child_process.
//
// Usage:
//   node qa-publish.mjs --repo VMG-Digital/tool-portal --pr 699 \
//        --out tests/e2e/.qa [--post] [--preview <url>]
//
// Without --post it writes the comment to <out>/qa-comment.md for the
// pr-manager to post (keeps posting under the workflow's control/gates).

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const get = (flag, def) => {
  const i = args.indexOf(flag);
  return i === -1 ? def : args[i + 1];
};
const REPO = get("--repo");
const PR = get("--pr");
const OUT = get("--out", "tests/e2e/.qa");
const PREVIEW = get("--preview", "");
const POST = args.includes("--post");
const TAG = get("--tag", "qa-assets");

if (!REPO || !PR) {
  console.error("Required: --repo <owner/name> --pr <number>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(OUT, "qa-results.json"), "utf8"));

function sh(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(" ")} failed: ${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

// 1. Convert the newest .webm recording → .mp4
let videoAsset = null;
const webms = readdirSync(OUT).filter((f) => f.endsWith(".webm"));
if (webms.length) {
  const newest = webms
    .map((f) => ({ f, t: readFileSync(join(OUT, f)).length }))
    .sort((a, b) => b.t - a.t)[0].f;
  const mp4 = `qa-${manifest.spec}-${Date.now()}.mp4`;
  try {
    sh("ffmpeg", ["-y", "-i", join(OUT, newest), "-c:v", "libx264", "-pix_fmt", "yuv420p", join(OUT, mp4)]);
    videoAsset = mp4;
  } catch (e) {
    console.error("ffmpeg conversion failed; linking raw .webm instead:", e.message);
    videoAsset = newest;
  }
}

// 2. Ensure the asset release exists (reused across runs; filenames are unique).
const releases = sh("gh", ["release", "list", "--repo", REPO, "--json", "tagName"], { shell: false });
if (!JSON.parse(releases || "[]").some((r) => r.tagName === TAG)) {
  sh("gh", [
    "release", "create", TAG,
    "--repo", REPO, "--prerelease",
    "--title", "QA evidence assets",
    "--notes", "Auto-managed store for /workflow QA screenshots and recordings. Do not delete.",
  ]);
}

const assetUrl = (name) => `https://github.com/${REPO}/releases/download/${TAG}/${name}`;

// 3. Upload screenshots + video
const uploads = [...manifest.results.map((r) => r.screenshot), videoAsset].filter(Boolean);
for (const name of uploads) {
  sh("gh", ["release", "upload", TAG, join(OUT, name), "--repo", REPO, "--clobber"]);
}

// 4. Build the PR comment (neutral wording — no internal tool/agent names).
const icon = (s) => (s === "PASS" ? "✅" : "❌");
const rows = [
  PREVIEW ? `| **preview** | ${PREVIEW} |` : null,
  `| **functional** | ${manifest.failed === 0 ? "all requirements verified" : `${manifest.failed} failing`} |`,
  `| **design** | ${manifest.verdict === "passed" ? "approved" : "see findings"} |`,
  `| **verdict** | **${manifest.verdict}** |`,
].filter(Boolean).join("\n");

let md = `## QA evidence — \`${manifest.spec}\`\n\n| | |\n| --- | --- |\n${rows}\n\n---\n\n`;
for (const r of manifest.results) {
  md += `#### ${icon(r.status)} ${r.name}\n\n`;
  md += `![${r.name}](${assetUrl(r.screenshot)})\n\n`;
  md += `${r.detail}\n\n---\n\n`;
}
if (videoAsset) {
  md += `<details>\n<summary>Full QA recording</summary>\n\n`;
  md += `[Watch / download recording](${assetUrl(videoAsset)})\n\n`;
  md += `<sub>Tip: drag the file into a comment for inline playback.</sub>\n\n</details>\n`;
}

const commentPath = join(OUT, "qa-comment.md");
writeFileSync(commentPath, md);
console.log(`Wrote ${commentPath} (${manifest.passed}/${manifest.total} passed, verdict: ${manifest.verdict})`);

if (POST) {
  sh("gh", ["pr", "comment", String(PR), "--repo", REPO, "--body-file", commentPath]);
  console.log(`Posted QA evidence to ${REPO}#${PR}`);
} else {
  console.log("Not posted (no --post). pr-manager will post via gh pr comment --body-file.");
}
