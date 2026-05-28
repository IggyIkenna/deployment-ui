/**
 * Regression spec: VM Deployments — Reconcile Registry button
 *
 * Covers the §1.3 reconcile feature added in live-defi-rollout:
 *   - Button renders on the VM Deployments page
 *   - Clicking fires POST /api/vm-deployments/reconcile
 *   - Success banner shows reaped count
 *   - API error shows error banner (no JS crash)
 *
 * Note: mock-api.ts patches window.fetch for all /api/ routes, so Playwright
 * route mocks for /api/ paths are bypassed. We use window injection:
 *   - window.__mockVmDeploymentOverride — overrides the GET /api/vm-deployments response
 *   - window.__mockReconcileError — when truthy, reconcile endpoint returns 502
 * Both hooks are handled in mock-api.ts.
 */

import { expect, type Page, test } from "@playwright/test";

const MOCK_VM_LIST = {
  active: [
    {
      deployment_id: "dep-test-1",
      vm_name: "canonical-migration-cefi-20260418-042359",
      asset_group: "CEFI",
      task: "canonical-migration",
      mode: "live",
      start_date: "2024-06-01",
      end_date: "2024-06-30",
      status: "running",
      started_at: "2026-04-18T04:23:59Z",
      last_heartbeat_at: "2026-04-18T04:28:59Z",
      completed_at: null,
      exit_code: null,
      rows_in: 1000,
      rows_out: 900,
      rows_error: 0,
      events_emitted: 5,
      log_uri: "gs://bucket/log.txt",
    },
  ],
  recent: [],
  archive_days: 7,
};

async function injectVmDeploymentData(page: Page) {
  await page.addInitScript((data) => {
    (window as typeof window & { __mockVmDeploymentOverride?: unknown }).__mockVmDeploymentOverride = data;
  }, MOCK_VM_LIST);
}

test.describe("VM Deployments — Reconcile Registry", () => {
  test("Reconcile button is visible on VM Deployments page", async ({ page }) => {
    await injectVmDeploymentData(page);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    const btn = page.getByTestId("reconcile-registry-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("Reconcile Registry");
  });

  test("Clicking Reconcile fires POST to reconcile endpoint and shows result", async ({ page }) => {
    await injectVmDeploymentData(page);
    await page.goto("/vm-deployments");
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
    await injectVmDeploymentData(page);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("reconcile-registry-btn").click();

    const errBanner = page.getByTestId("reconcile-error");
    await expect(errBanner).toBeVisible({ timeout: 5000 });

    // No JS crash
    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });

  test("VM Deployments page renders without JS error (regression guard)", async ({ page }) => {
    await injectVmDeploymentData(page);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
    await expect(page.getByTestId("reconcile-registry-btn")).toBeVisible();
  });
});
