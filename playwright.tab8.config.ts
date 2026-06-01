// Tab-8 worktree playwright config — points to port 5184 (tab8 dev server).
// Usage: node_modules/.bin/playwright test --config playwright.tab8.config.ts ...
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["smoke/**/*.spec.ts", "e2e/**/*.spec.ts"],
  fullyParallel: true,
  forbidOnly: false,
  retries: 0,
  reporter: "line",

  use: {
    baseURL: "http://localhost:5184",
    trace: "off",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "VITE_MOCK_API=true node_modules/.bin/vite --port 5184",
    url: "http://localhost:5184",
    reuseExistingServer: true,
  },
});
