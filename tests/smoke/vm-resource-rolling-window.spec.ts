/**
 * pw:L2 — rolling-window resource history.
 *
 * Regression guard for deployment_durable_operational_data_bigquery_2026_07_21.md:
 * the WorkHealthCard window selector (Live/1h/4h/24h/1wk) on the deployment detail page,
 * and the new cross-VM comparison page at /vm-resources. Runs against the mock API
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
    await page.goto("/vm-resources");
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
    await page.goto("/vm-resources");
    await expect(page.getByTestId("vm-resource-comparison-table")).toBeVisible();
    // The table itself renders during the loading state (before rows.length > 0), so wait
    // for a row rather than racing .count() against the still-in-flight fetch.
    const rowsLocator = page.getByTestId("vm-resource-comparison-row");
    await expect(rowsLocator.first()).toBeVisible();
    const totalRows = await rowsLocator.count();
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

  test("cross-VM comparison page expands a VM row to show its process-category breakdown", async ({ page }) => {
    await page.goto("/vm-resources");
    const rows = page.getByTestId("vm-resource-comparison-row");
    await expect(rows.first()).toBeVisible();

    // Collapsed by default -- no breakdown panel rendered yet.
    await expect(page.getByTestId("process-breakdown-panel")).not.toBeVisible();

    await rows.first().click();
    await expect(page.getByTestId("process-breakdown-chevron-open")).toBeVisible();
    await expect(page.getByTestId("process-breakdown-panel")).toBeVisible();
    await expect(page.getByTestId("process-breakdown-chart")).toBeVisible();

    // Mock fixture returns all 5 process_category_sampler.py categories.
    const table = page.getByTestId("process-breakdown-table");
    await expect(table).toBeVisible();
    await expect(table).toContainText("other");
    await expect(table).toContainText("worker_agent");
    await expect(table).toContainText("ao_plan_work");
    await expect(table).toContainText("ci");
    await expect(table).toContainText("orchestrator");

    // Clicking the same row again collapses it.
    await rows.first().click();
    await expect(page.getByTestId("process-breakdown-panel")).not.toBeVisible();
  });

  test("cross-VM comparison page expands a VM row to show watchdog kill events", async ({ page }) => {
    await page.goto("/vm-resources");
    const rows = page.getByTestId("vm-resource-comparison-row");
    await expect(rows.first()).toBeVisible();

    // Collapsed by default -- no kill-events panel rendered yet.
    await expect(page.getByTestId("kill-events-panel")).not.toBeVisible();

    await rows.first().click();
    await expect(page.getByTestId("kill-events-panel")).toBeVisible();
    await expect(page.getByTestId("kill-events-table")).toBeVisible();

    // Mock fixture returns the watchdog kill-event shape: timestamp, command, reason,
    // rss_mb/limit_mb (the columns the plan's [UI] P3 todo names).
    const table = page.getByTestId("kill-events-table");
    await expect(table).toContainText("python -m pytest");
    await expect(table).toContainText("rss:51204000kB > 8388608kB");
    await expect(table).toContainText("51204 / 8388 MB");
    await expect(table).toContainText("swap:5242880kB > 4194304kB");

    // Clicking the same row again collapses the kill-events panel too.
    await rows.first().click();
    await expect(page.getByTestId("kill-events-panel")).not.toBeVisible();
  });
});
