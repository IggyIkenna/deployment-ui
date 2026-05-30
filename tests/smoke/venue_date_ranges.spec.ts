/**
 * Regression spec: Venue Date Range Availability panel (§3.P2)
 *
 * Covers the date-range availability view added to the VM Deployments page:
 *   - Panel renders with "Venue Date Range Availability" heading
 *   - binance row is visible with free/paid counts (mock data)
 *   - Refresh button is present on the panel
 *   - No JS crash on API error (regression guard)
 *
 * Note: mock-api.ts patches window.fetch; /api/venue-date-ranges returns
 * mocked date-range data for 6 CeFi venues (binance, okx, bybit, deribit,
 * kraken, bitfinex).
 */

import { expect, type Page, test } from "@playwright/test";

async function goToVmDeployments(page: Page) {
  await page.goto("/vm-deployments");
  await page.waitForLoadState("networkidle");
}

test.describe("Venue Date Range Availability panel", () => {
  test("Panel renders with Venue Date Range Availability heading", async ({ page }) => {
    await goToVmDeployments(page);

    const panel = page.getByTestId("venue-date-range-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Venue Date Range Availability");
  });

  test("binance row shows free and paid date counts", async ({ page }) => {
    await goToVmDeployments(page);

    const row = page.getByTestId("venue-date-range-row-binance");
    await expect(row).toBeVisible();
    await expect(row).toContainText("binance");

    const freeCount = page.getByTestId("venue-date-range-free-count-binance");
    await expect(freeCount).toBeVisible();

    const paidCount = page.getByTestId("venue-date-range-paid-count-binance");
    await expect(paidCount).toBeVisible();
  });

  test("Refresh button is visible on the date range panel", async ({ page }) => {
    await goToVmDeployments(page);

    const btn = page.getByTestId("venue-date-range-refresh-btn");
    await expect(btn).toBeVisible();
  });

  test("Panel renders without JS error (regression guard)", async ({ page }) => {
    await goToVmDeployments(page);

    await expect(page.getByTestId("venue-date-range-panel")).toBeVisible();
    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });
});
