// QA evidence harness (template) — copied into the worktree as `qa-harness.mjs`
// and edited to add one qaCheck() per acceptance criterion. Records a full
// Chromium video and a screenshot at every checkpoint, then writes a results
// manifest that qa-publish.mjs turns into the PR evidence comment.
//
// Aligned to the tool-portal E2E stack (Phase 4.75): header-based E2E auth via
// tests/e2e/e2e-auth `login(page)`, local Supabase, dev server on PLAYWRIGHT_BASE_URL.
//
// Run with the same env block as Phase 4.75:
//   APP_E2E_AUTH=1 APP_E2E_AUTH_TOKEN=local-dev-token \
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable> SUPABASE_SERVICE_ROLE_KEY=<secret> \
//   PLAYWRIGHT_BASE_URL=http://localhost:50551 \
//   QA_SPEC_ID=SPEC-... QA_OUT_DIR=tests/e2e/.qa \
//   node qa-harness.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// Adjust the relative path if the harness lives outside the repo root:
import { login } from "./tests/e2e/e2e-auth";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:50551";
const OUT = process.env.QA_OUT_DIR || "tests/e2e/.qa";
const SPEC = process.env.QA_SPEC_ID || "SPEC";
mkdirSync(OUT, { recursive: true });

const results = [];
let seq = 0;

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes()
  )}${p(d.getSeconds())}`;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();

// Screenshot + record one acceptance-criterion result.
async function qaCheck(name, status, detail) {
  seq += 1;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const file = `${stamp()}-${String(seq).padStart(2, "0")}-${slug}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: false });
  results.push({ seq, name, status, detail, screenshot: file });
  console.log(`${status === "PASS" ? "✅" : "❌"} ${name} — ${detail}`);
}

try {
  // Authenticate via the project's E2E header auth (no Google OAuth).
  await login(page);

  // ─────────────── BEGIN CHECKS ───────────────
  // One qaCheck per acceptance criterion. Navigate, act, assert, screenshot.
  // Example:
  //   await page.goto(`${BASE}/tools/quality-check`);
  //   await page.waitForLoadState("networkidle");
  //   const grid = await page.locator('[data-testid="workspace-grid"]').isVisible();
  //   await qaCheck("AC1 - Landing view without params", grid ? "PASS" : "FAIL",
  //     grid ? "Workspace grid renders with no ?project= param." : "Grid missing.");
  // ─────────────── END CHECKS ───────────────
} catch (err) {
  await qaCheck("Harness error", "FAIL", String(err).slice(0, 300));
} finally {
  await context.close(); // flush the video
  await browser.close();
}

// The video filename is resolved by qa-publish.mjs (newest .webm in OUT).
const passed = results.filter((r) => r.status === "PASS").length;
const manifest = {
  spec: SPEC,
  base: BASE,
  outDir: OUT,
  total: results.length,
  passed,
  failed: results.length - passed,
  verdict: results.length && passed === results.length ? "passed" : "failed",
  results,
};
writeFileSync(join(OUT, "qa-results.json"), JSON.stringify(manifest, null, 2));
console.log(`\n${passed}/${results.length} passed → ${join(OUT, "qa-results.json")}`);
process.exit(manifest.verdict === "passed" ? 0 : 1);
