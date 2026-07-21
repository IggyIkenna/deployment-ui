/**
 * Regression spec: Deployments — Reconcile Registry button
 *
 * Retargeted 2026-07-21 from the retired /vm-deployments page to /deployments, where the
 * action now lives (see plans/active/issues/vm_deployments_venue_panels_orphaned_route_2026_07_21.md).
 * Covers the §1.3 reconcile feature added in live-defi-rollout:
 *   - Button renders on the Deployments page header
 *   - Clicking fires POST /api/vm-deployments/reconcile (unchanged endpoint — only the
 *     button's HOME page moved, not the API it calls)
 *   - Success banner shows reaped count
 *   - API error shows error banner (no JS crash)
 *
 * Note: mock-api.ts patches window.fetch for all /api/ routes, so Playwright route mocks for
 * /api/ paths are bypassed. We use window injection for the reconcile response:
 *   - window.__mockReconcileError — when truthy, reconcile endpoint returns 502
 * /deployments' own inventory listing reads /api/deployments/inventory (a different endpoint,
 * already mocked with default data by mock-api.ts), so no vm-deployments list override is
 * needed here — this spec only exercises the reconcile button itself.
 */

import { expect, test } from "@playwright/test";

test.describe("Deployments — Reconcile Registry", () => {
  test("Reconcile button is visible on the Deployments page header", async ({ page }) => {
    await page.goto("/deployments");
    await page.waitForLoadState("networkidle");

    const btn = page.getByTestId("reconcile-registry-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("Reconcile Registry");
  });

  test("Clicking Reconcile fires POST to reconcile endpoint and shows result", async ({ page }) => {
    await page.goto("/deployments");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("reconcile-registry-btn").click();

    // Wait for the result banner to appear — mock-api.ts returns reaped_count:1737, total_active_before:1762, running:25
    const result = page.getByTestId("reconcile-result");
    await expect(result).toBeVisible({ timeout: 5000 });
    await expect(result).toContainText("1737");
    await expect(result).toContainText("1762");
    await expect(result).toContainText("25");
  });

  test("Reconcile API error shows error banner without JS crash", async ({ page }) => {
    await page.addInitScript(() => {
      (window as typeof window & { __mockReconcileError?: boolean }).__mockReconcileError = true;
    });
    await page.goto("/deployments");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("reconcile-registry-btn").click();

    const errBanner = page.getByTestId("reconcile-error");
    await expect(errBanner).toBeVisible({ timeout: 5000 });

    // No JS crash
    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });
});
