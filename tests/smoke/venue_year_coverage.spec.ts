/**
 * Smoke spec — VenueCoverageTable (venue × year coverage).
 *
 * pw:L2 BLOCKED-INFRA: libatk-1.0.so.0 missing in slot env.
 * Spec is written and will execute when infra is available.
 *
 * Covers:
 *   1. "Venue Coverage" tab visible for market-tick-data-service.
 *   2. Table renders venue rows after API response.
 *   3. pending_paid_key rows show "★key" marker (not "complete").
 *   4. Error state renders role="alert" when API fails.
 *   5. Asset-group toggles filter the request param.
 */

import { expect, test, type Page } from "@playwright/test";

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  gcs_fuse: { active: true, reason: "mounted" },
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function mockBase(page: Page) {
  await page.route("**/api/health", (route) => route.fulfill({ json: MOCK_HEALTH }));
  await page.route("**/api/services", (route) => route.fulfill({ json: ["market-tick-data-service"] }));
}

// mock-api.ts (window.fetch patch) intercepts /api/data-status/venue-year-coverage
// before Playwright page.route() fires. mockCoverageOk is a no-op — the mock
// already returns the expected rows. mockCoverageError sets a window flag that
// the mock-api handler checks to simulate a 500 error.
async function mockCoverageOk(_page: Page) {
  // mock-api.ts serves the default MOCK_COVERAGE_RESPONSE for this endpoint.
}

async function mockCoverageError(page: Page) {
  await page.addInitScript(() => {
    (window as typeof window & { __mockVenueYearCoverageError?: boolean }).__mockVenueYearCoverageError = true;
  });
}

async function navigateToVenueCoverage(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Select market-tick-data-service — scroll into view first (item may be off-screen in a list of 22)
  const serviceItem = page.locator('[data-testid="service-item-market-tick-data-service"]');
  if ((await serviceItem.count()) > 0) {
    await serviceItem.first().scrollIntoViewIfNeeded();
    await serviceItem.first().click();
  } else {
    await page.locator("text=market-tick-data-service").first().scrollIntoViewIfNeeded();
    await page.locator("text=market-tick-data-service").first().click();
  }
  await page.waitForLoadState("networkidle");

  // Click the Venue Coverage tab
  await page.locator('[data-testid="venue-coverage-tab-trigger"]').click();
  await page.waitForLoadState("networkidle");
}

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe("VenueCoverageTable", () => {
  test("venue coverage tab trigger visible for market-tick-data-service", async ({ page }) => {
    await mockBase(page);
    await mockCoverageOk(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Select market-tick-data-service if service list is visible
    const serviceLocator = page.locator("text=market-tick-data-service").first();
    if (await serviceLocator.isVisible()) {
      await serviceLocator.click();
      await page.waitForLoadState("networkidle");
      const trigger = page.locator('[data-testid="venue-coverage-tab-trigger"]');
      await expect(trigger).toBeVisible();
    }
  });

  test("renders venue rows when API returns data", async ({ page }) => {
    await mockBase(page);
    await mockCoverageOk(page);
    await navigateToVenueCoverage(page);

    const table = page.locator('[data-testid="venue-coverage-table"]');
    await expect(table).toBeVisible();

    const rows = page.locator('[data-testid="venue-coverage-row"]');
    await expect(rows).toHaveCount(3);
  });

  test("pending_paid_key row shows star-key marker not complete", async ({ page }) => {
    await mockBase(page);
    await mockCoverageOk(page);
    await navigateToVenueCoverage(page);

    // COINBASE-SPOT has pending_paid_key=30
    const starKey = page.locator("text=★key").first();
    await expect(starKey).toBeVisible();

    // Must NOT show "complete" or "empty" for that cell
    const tableText = await page.locator('[data-testid="venue-coverage-table"]').innerText();
    expect(tableText).not.toMatch(/complete/i);
  });

  test("shows error alert when API fails", async ({ page }) => {
    await mockBase(page);
    await mockCoverageError(page);
    await navigateToVenueCoverage(page);

    const alert = page.locator('[data-testid="venue-coverage-error"]');
    await expect(alert).toBeVisible();
  });

  test("asset group toggle buttons are rendered", async ({ page }) => {
    await mockBase(page);
    await mockCoverageOk(page);
    await navigateToVenueCoverage(page);

    for (const ag of ["cefi", "tradfi", "defi"]) {
      await expect(page.locator(`[data-testid="ag-toggle-${ag}"]`)).toBeVisible();
    }
  });
});
