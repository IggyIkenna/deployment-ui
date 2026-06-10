import { defineConfig, devices } from "@playwright/test";

// PLAYWRIGHT_BASE_URL lets a run target a dedicated mock dev server (e.g. on a
// spare port) when the default 5183 is occupied by a non-mock live dev stack —
// smoke specs require the mock API, so they must not reuse a LIVE-mode server.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5183";

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
    command: "npm run dev",
    url: "http://localhost:5183",
    reuseExistingServer: true,
    timeout: 120 * 1000,
    env: { VITE_MOCK_API: "true" },
  },
});
