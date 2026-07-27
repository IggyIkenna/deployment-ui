/**
 * pw:L2 — rolling-window resource history.
 *
 * Regression guard for deployment_durable_operational_data_bigquery_2026_07_21.md:
 * the WorkHealthCard window selector (Live/1h/4h/24h/1wk) on the deployment detail page,
 * and the new cross-VM comparison page at /ops/vm-resources. Runs against the mock API
 * (VITE_MOCK_API); fixtures for /api/vm-resources/rolling + /process-category live in
 * src/lib/mock-api.ts.
 */
import { expect, test } from "@playwright/test";

test.describe("VM resource rolling-window views", () => {
  test("WorkHealthCard window selector switches from live snapshot to a rolling rollup", async ({ page }) => {
    await page.goto("/deployments/defi-live-capture-1");
    await expect(page.getByTestId("detail-work-health")).toBeVisible();
    // Live is the default — the point-in-time metric grid renders.
    await expect(page.getByTestId("detail-work-health-window-live")).toHaveClass(/bg-\[var\(--color-accent-cyan\)\]/);

    await page.getByTestId("detail-work-health-window-1h").click();
    // Rolling view renders avg/p95 once the mock fixture resolves.
    await expect(page.getByTestId("detail-work-health-rolling")).toBeVisible();
    await expect(page.getByTestId("detail-work-health-rolling")).toContainText("avg");
    await expect(page.getByTestId("detail-work-health-rolling")).toContainText("p95");

    // Switching back to live restores the point-in-time grid.
    await page.getByTestId("detail-work-health-window-live").click();
    await expect(page.getByTestId("detail-work-health")).not.toContainText("avg /");
  });

  test("cross-VM comparison page lists VMs with rolling stats and supports a window switch", async ({ page }) => {
    await page.goto("/ops/vm-resources");
    await expect(page.getByTestId("vm-resource-comparison-page")).toBeVisible();
    await expect(page.getByTestId("vm-resource-comparison-table")).toBeVisible();
    const rows = page.getByTestId("vm-resource-comparison-row");
    await expect(rows.first()).toBeVisible();

    await page.getByTestId("vm-resource-comparison-window-24h").click();
    await expect(page.getByTestId("vm-resource-comparison-window-24h")).toHaveClass(
      /bg-\[var\(--color-accent-cyan\)\]/,
    );
  });

  test("cross-VM comparison page filters by service name", async ({ page }) => {
    await page.goto("/ops/vm-resources");
    await expect(page.getByTestId("vm-resource-comparison-table")).toBeVisible();
    const totalRows = await page.getByTestId("vm-resource-comparison-row").count();
    expect(totalRows).toBeGreaterThan(0);

    await page.getByTestId("vm-resource-comparison-service-filter").fill("market-tick-data-service");
    const filteredRows = page.getByTestId("vm-resource-comparison-row");
    await expect(filteredRows.first()).toBeVisible();
    const filteredCount = await filteredRows.count();
    expect(filteredCount).toBeLessThanOrEqual(totalRows);
    for (let i = 0; i < filteredCount; i++) {
      await expect(filteredRows.nth(i)).toContainText("market-tick-data-service");
    }
  });
});
