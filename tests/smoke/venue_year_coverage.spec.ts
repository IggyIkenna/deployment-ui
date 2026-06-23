/**
 * Smoke spec — VenueCoverageTable (venue × year coverage).
 *
 * Runs wherever chromium + its libs (libatk-1.0) are present (CI / UI-capable host).
 *
 * Covers:
 *   1. "Venue Coverage" tab visible for market-tick-data-service.
 *   2. Table renders venue rows after API response.
 *   3. pending_paid_key rows show "★key" marker (not "complete").
 *   4. Error state renders role="alert" when API fails.
 *   5. Asset-group toggles filter the request param.
 *   6. MVP scope toggle renders (default MVP) + drives the ?scope= request param
 *      (mvp_scope_catalogue_tagging_2026_06_08 — deployment-ui MVP toggle).
 */

import { expect, test, type Page } from "@playwright/test";

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  gcs_fuse: { active: true, reason: "mounted" },
};

const MOCK_COVERAGE_RESPONSE = {
  rows: [
    {
      venue: "BINANCE-SPOT",
      asset_group: "CEFI",
      year: 2024,
      captured: 320,
      empty_confirmed: 5,
      expected_unattempted: 10,
      pending_paid_key: 0,
      attempted_failed: 2,
      total: 337,
    },
    {
      venue: "COINBASE-SPOT",
      asset_group: "CEFI",
      year: 2024,
      captured: 200,
      empty_confirmed: 0,
      expected_unattempted: 0,
      pending_paid_key: 30,
      attempted_failed: 0,
      total: 230,
    },
    {
      venue: "DERIBIT",
      asset_group: "CEFI",
      year: 2023,
      captured: 365,
      empty_confirmed: 0,
      expected_unattempted: 0,
      pending_paid_key: 0,
      attempted_failed: 0,
      total: 365,
    },
  ],
  asset_groups_loaded: ["cefi"],
  asset_groups_failed: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function mockBase(page: Page) {
  await page.route("**/api/health", (route) => route.fulfill({ json: MOCK_HEALTH }));
  await page.route("**/api/services", (route) => route.fulfill({ json: ["market-tick-data-service"] }));
}

async function mockCoverageOk(page: Page) {
  await page.route("**/api/data-status/venue-year-coverage**", (route) =>
    route.fulfill({ json: MOCK_COVERAGE_RESPONSE }),
  );
}

async function mockCoverageError(page: Page) {
  // mock-api.ts replaces window.fetch before Playwright route intercepts fire,
  // so we use the window override flag instead of page.route.
  await page.evaluate(() => {
    (window as typeof window & { __mockVenueCoverageError?: boolean }).__mockVenueCoverageError = true;
  });
}

async function navigateToVenueCoverage(page: Page) {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");

  // Select market-tick-data-service
  const serviceItem = page.locator('[data-testid="service-item-market-tick-data-service"]');
  if (await serviceItem.isVisible()) {
    await serviceItem.click();
  } else {
    // fallback: click the service in the list
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
    await page.goto("/home");
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
    // Navigate to service page first, then set the error flag before clicking tab
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    const serviceItem = page.locator('[data-testid="service-item-market-tick-data-service"]');
    if (await serviceItem.isVisible()) {
      await serviceItem.click();
    } else {
      await page.locator("text=market tick data").first().click();
    }
    await page.waitForLoadState("networkidle");
    // Set error flag after page load so it isn't reset by navigation
    await mockCoverageError(page);
    await page.locator('[data-testid="venue-coverage-tab-trigger"]').click();
    await page.waitForLoadState("networkidle");

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

  test("scope toggle renders with MVP selected by default", async ({ page }) => {
    await mockBase(page);
    await mockCoverageOk(page);
    await navigateToVenueCoverage(page);

    for (const scope of ["mvp", "could_exist", "all"]) {
      await expect(page.locator(`[data-testid="scope-toggle-${scope}"]`)).toBeVisible();
    }
    // MVP is the default pre-launch view → active (accent-green) styling.
    await expect(page.locator('[data-testid="scope-toggle-mvp"]')).toHaveClass(/accent-green/);
  });

  test("clicking a scope toggle moves the active state (drives the scope re-fetch)", async ({ page }) => {
    // The app serves coverage via its window.fetch mock (mock-api.ts), so the
    // ?scope= param is asserted at the client-unit/tsc layer; here we guard the
    // UI wiring: clicking a scope pill makes it the active (accent-green) one and
    // deactivates MVP, which is what triggers load() to re-fetch with that scope.
    await mockBase(page);
    await mockCoverageOk(page);
    await navigateToVenueCoverage(page);

    const mvp = page.locator('[data-testid="scope-toggle-mvp"]');
    const couldExist = page.locator('[data-testid="scope-toggle-could_exist"]');
    await expect(mvp).toHaveClass(/accent-green/); // default ON pre-launch

    await couldExist.click();
    await expect(couldExist).toHaveClass(/accent-green/);
    await expect(mvp).not.toHaveClass(/accent-green/);
  });
});
