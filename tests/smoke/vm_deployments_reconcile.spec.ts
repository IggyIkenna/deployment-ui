/**
 * Regression spec: VM Deployments — Reconcile Registry button
 *
 * Covers the §1.3 reconcile feature added in live-defi-rollout:
 *   - Button renders on the VM Deployments page
 *   - Clicking fires POST /api/vm-deployments/reconcile
 *   - Success banner shows reaped count
 *   - API error shows error banner (no JS crash)
 */

import { expect, type Page, test } from "@playwright/test";

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  mock_mode: false,
  gcs_fuse: { active: true, reason: "mounted" },
};

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

async function mockBase(page: Page) {
  await page.route("**/api/health", (route) => route.fulfill({ json: MOCK_HEALTH }));
  await page.route("**/api/services", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/monitor/**", (route) =>
    route.fulfill({ json: { jobs: [], total: 0, queried_at: new Date().toISOString(), cloud: "gcp", env: "dev" } }),
  );
  await page.route("**/api/dart/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/ml/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/strategy/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/research/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/ops/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/deployments**", (route) => route.fulfill({ json: { deployments: [] } }));
  await page.route("**/api/costs/**", (route) =>
    route.fulfill({ json: { date: "2026-05-28", total_usd: 0, by_asset_group: [], by_archetype: [], by_vm: [] } }),
  );
  await page.route("**/api/vm-deployments", (route) => route.fulfill({ json: MOCK_VM_LIST }));
}

test.describe("VM Deployments — Reconcile Registry", () => {
  test("Reconcile button is visible on VM Deployments page", async ({ page }) => {
    await mockBase(page);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    const btn = page.getByTestId("reconcile-registry-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("Reconcile Registry");
  });

  test("Clicking Reconcile fires POST to reconcile endpoint and shows result", async ({ page }) => {
    await mockBase(page);

    const reconcileResponse = {
      reaped_count: 1737,
      reaped: ["dep-stale-1", "dep-stale-2"],
      running_vm_count: 25,
      total_active_before: 1762,
    };

    await page.route("**/api/vm-deployments/reconcile", (route) => {
      expect(route.request().method()).toBe("POST");
      return route.fulfill({ json: reconcileResponse });
    });

    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("reconcile-registry-btn").click();

    // Wait for the result banner to appear
    const result = page.getByTestId("reconcile-result");
    await expect(result).toBeVisible({ timeout: 5000 });
    await expect(result).toContainText("1737");
    await expect(result).toContainText("1762");
    await expect(result).toContainText("25");
  });

  test("Reconcile API error shows error banner without JS crash", async ({ page }) => {
    await mockBase(page);

    await page.route("**/api/vm-deployments/reconcile", (route) =>
      route.fulfill({ status: 502, body: "GCP unavailable" }),
    );

    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("reconcile-registry-btn").click();

    const errBanner = page.getByTestId("reconcile-error");
    await expect(errBanner).toBeVisible({ timeout: 5000 });

    // No JS crash
    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });

  test("VM Deployments page renders without JS error (regression guard)", async ({ page }) => {
    await mockBase(page);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
    await expect(page.getByTestId("reconcile-registry-btn")).toBeVisible();
  });
});
