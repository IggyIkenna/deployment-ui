/**
 * Regression spec: Venue Relaunch Coverage Estimate panel (§4.P2)
 *
 * Covers the relaunch-estimate view added to the VM Deployments page:
 *   - Panel renders with "Relaunch Coverage Estimate" heading
 *   - Summary bar shows pending / now-unlockable / after-renewal totals
 *   - At least one venue row is visible (mock data has 5 rows)
 *   - Refresh button is present
 *   - No JS crash on load (regression guard)
 *
 * Note: mock-api.ts patches window.fetch; /api/venue-relaunch-estimate
 * returns 5 mock rows (COINBASE-SPOT/2024, BINANCE-SPOT/2025, etc.).
 */

import { expect, type Page, test } from "@playwright/test";

async function goToVmDeployments(page: Page) {
  await page.goto("/vm-deployments");
  await page.waitForLoadState("networkidle");
}

test.describe("Venue Relaunch Coverage Estimate panel", () => {
  test("Panel renders with Relaunch Coverage Estimate heading", async ({ page }) => {
    await goToVmDeployments(page);

    const panel = page.getByTestId("venue-relaunch-estimate-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Relaunch Coverage Estimate");
  });

  test("Summary bar is visible with pending/now/renewal stats", async ({ page }) => {
    await goToVmDeployments(page);

    const summary = page.getByTestId("relaunch-estimate-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("Pending");
    await expect(summary).toContainText("After key renewal");
  });

  test("At least one venue row is visible", async ({ page }) => {
    await goToVmDeployments(page);

    const row = page.getByTestId("relaunch-row-BINANCE-SPOT-2025");
    await expect(row).toBeVisible();
    await expect(row).toContainText("BINANCE-SPOT");
  });

  test("Refresh button is visible on the estimate panel", async ({ page }) => {
    await goToVmDeployments(page);

    const btn = page.getByTestId("relaunch-estimate-refresh-btn");
    await expect(btn).toBeVisible();
  });

  test("Panel renders without JS error (regression guard)", async ({ page }) => {
    await goToVmDeployments(page);

    await expect(page.getByTestId("venue-relaunch-estimate-panel")).toBeVisible();
    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });
});
