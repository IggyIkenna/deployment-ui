import { defineConfig, devices } from "@playwright/test";

// Smoke/e2e specs REQUIRE the mock API, so they must not reuse a LIVE-mode dev server.
// The default dev port 5183 is where the operator's *non-mock* live stack runs
// (restart-deployment-stack.sh), and `reuseExistingServer` would silently reuse it →
// every detail-drilldown spec fails "element(s) not found" because the detail fetch hits
// the real backend (incident 2026-06-17). Default to a DEDICATED playwright port (5199) so
// the mock webServer below always owns it and never collides with :5183. CI (where nothing
// is on 5199) starts a fresh mock server there. Override both via env if 5199 is taken.
// SSOT: promotion_queue_conflict_wall_pileup_2026_06_17 P3.
const PORT = process.env.PLAYWRIGHT_PORT ?? "5199";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

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
