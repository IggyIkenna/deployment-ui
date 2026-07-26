import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// Smoke/e2e specs REQUIRE the mock API, so they must not reuse a LIVE-mode dev server.
// The default dev port 5183 is where the operator's *non-mock* live stack runs
// (restart-deployment-stack.sh), and `reuseExistingServer` would silently reuse it →
// every detail-drilldown spec fails "element(s) not found" because the detail fetch hits
// the real backend (incident 2026-06-17). Default to a DEDICATED playwright port (5199) so
// the mock webServer below always owns it and never collides with :5183. CI (where nothing
// is on 5199) starts a fresh mock server there. Override both via env if 5199 is taken.
// SSOT: promotion_queue_conflict_wall_pileup_2026_06_17 P3.
//
// Per-slot port derivation (fix: playwright_reuse_existing_server_cross_slot_false_results_2026_07_20.md)
// -- with 10+ per-slot worktrees on one host all defaulting to :5199, a late-arriving slot's
// `reuseExistingServer: true` silently attached to an EARLIER slot's dev server and tested
// foreign code (measured 2026-07-20). Slot-N is derived from the checkout path (`.tabs/<N>/`) so
// each slot gets its own default port and can never collide; 0 (the un-slotted default, still
// 5199) when not in a slot clone. SSOT for slot-N derivation: scripts/hooks/slot-identity-lib.sh.
const SLOT = Number(process.cwd().match(/\/\.tabs\/(\d+)\//)?.[1] ?? 0);
const PORT = process.env.PLAYWRIGHT_PORT ?? String(5199 + SLOT);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

// Surface whether the dev server is already up (about to be REUSED -- the visible signal for a
// possible cross-slot/foreign attach, in case the port derivation above is ever wrong) vs will be
// freshly spawned by webServer below, instead of a silent reuse.
try {
  execSync(`curl -sf -o /dev/null --max-time 1 "${BASE_URL}"`, { stdio: "ignore" });
  console.log(`[playwright.config] slot=${SLOT} port=${PORT} dev server @ ${BASE_URL} -- ALREADY UP, will be REUSED`);
} catch {
  console.log(`[playwright.config] slot=${SLOT} port=${PORT} dev server @ ${BASE_URL} -- not up, will be freshly SPAWNED`);
}

export default defineConfig({
  testDir: "./tests",
  testMatch: ["smoke/**/*.spec.ts", "e2e/**/*.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    colorScheme: "dark",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // --strictPort so vite binds EXACTLY $PORT (never auto-increments off to a port the
    // baseURL wouldn't match); on the dedicated 5199 a reused server is always mock-mode.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120 * 1000,
    env: { VITE_MOCK_API: "true" },
  },
});
