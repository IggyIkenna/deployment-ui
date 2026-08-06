/**
 * Regression spec — DATA_PIPELINE_SERVICES set correctness (FOLD A cutover +
 * strategy-service + ml-service addition).
 *
 * Verifies that the banner classification (pipeline vs runtime) is correct for
 * every category of service after the stale-name remediation in
 * infra_satellite_ao_dispatch_batch5_2026_08_01.md G-UI.
 *
 * Assertions:
 *  1. FOLD A service (features-onchain-service) — recognised as pipeline, NO
 *     amber out-of-scope banner.
 *  2. Newly added strategy-service — recognised as pipeline, NO banner.
 *  3. Newly added ml-service — recognised as pipeline, NO banner.
 *  4. execution-service — still correctly classified as runtime, banner IS
 *     shown.
 *  5. Stale name (features-cefi-service) — if a user lands on its URL directly,
 *     it no longer matches the Set so the banner IS shown (service was removed).
 *  6. Existing service (market-tick-data-service) — still recognised, NO banner.
 */

import { expect, test } from "@playwright/test";

// This repo's webServer (playwright.config.ts) runs with VITE_MOCK_API=true.
// The app's own client-side mock layer (src/lib/mock-api.ts) serves data for
// every service, so no manual page.route() interception is needed.

const PIPELINE_SERVICES = [
  "features-onchain-service", // FOLD A — was features-defi/prediction
  "features-delta-one-service", // FOLD A — was features-cefi
  "features-volatility-service", // FOLD A — was features-tradfi
  "strategy-service", // newly added
  "ml-service", // newly added
  "features-sports-service", // kept from original set
  "features-calendar-service", // newly added
  "features-multi-timeframe-service", // newly added
  "features-cross-instrument-service", // newly added
  "market-tick-data-service", // kept from original set
] as const;

const RUNTIME_SERVICES = [
  "execution-service", // documented exclusion
] as const;

const STALE_SERVICES = [
  "features-cefi-service", // removed — stale per-AG name
  "features-defi-service", // removed — stale per-AG name
  "features-tradfi-service", // removed — stale per-AG name
  "features-prediction-service", // removed — stale per-AG name
] as const;

test.describe("DataStatusTab DATA_PIPELINE_SERVICES: pipeline services render WITHOUT out-of-scope banner (PASS)", () => {
  for (const service of PIPELINE_SERVICES) {
    test(`${service}: page loads without amber out-of-scope banner`, async ({ page }) => {
      await page.goto(`/service/${service}/data-status`);
      await page.waitForLoadState("networkidle");

      // The amber out-of-scope banner has text "is a runtime service"
      const banner = page.locator("text=is a runtime service");
      await expect(banner).toHaveCount(0);

      // The page actually renders (not a blank 404)
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading.first()).toBeVisible({ timeout: 10000 });
    });
  }
});

test.describe("DataStatusTab DATA_PIPELINE_SERVICES: runtime services SHOW out-of-scope banner (PASS)", () => {
  for (const service of RUNTIME_SERVICES) {
    test(`${service}: page shows amber out-of-scope banner`, async ({ page }) => {
      await page.goto(`/service/${service}/data-status`);
      await page.waitForLoadState("networkidle");

      const banner = page.locator("text=is a runtime service");
      await expect(banner).toBeVisible({ timeout: 10000 });

      // Banner names the specific service and directs to Monitor
      await expect(banner).toContainText(service);
      await expect(banner).toContainText("Monitor");
    });
  }
});

test.describe("DataStatusTab DATA_PIPELINE_SERVICES: stale removed names now classified as runtime (PASS)", () => {
  for (const service of STALE_SERVICES) {
    test(`${service}: removed from set — now shows banner`, async ({ page }) => {
      await page.goto(`/service/${service}/data-status`);
      await page.waitForLoadState("networkidle");

      const banner = page.locator("text=is a runtime service");
      await expect(banner).toBeVisible({ timeout: 10000 });
    });
  }
});
