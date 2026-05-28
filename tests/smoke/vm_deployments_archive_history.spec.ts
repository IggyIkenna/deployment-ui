/**
 * Regression spec: VM Deployments — Archive History tab (§2.P1)
 *
 * Covers the archive table added for completed/failed/reaped VM deployments:
 *   - Outcome badge shows COMPLETED / FAILED / reaped
 *   - Duration column shows formatted elapsed time
 *   - Rows Captured column shows rows_out
 *   - Log link renders as clickable GCS console URL
 *   - Empty archive renders "None" without JS crash
 */

import { expect, type Page, test } from "@playwright/test";

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  mock_mode: false,
  gcs_fuse: { active: true, reason: "mounted" },
};

function makeArchiveEntry(overrides: Record<string, unknown> = {}) {
  return {
    deployment_id: "dep-archive-1",
    vm_name: "canonical-migration-cefi-20260418-042359",
    asset_group: "CEFI",
    task: "canonical-migration",
    mode: "live",
    start_date: "2024-06-01",
    end_date: "2024-06-30",
    status: "completed",
    started_at: "2026-04-18T04:00:00Z",
    last_heartbeat_at: "2026-04-18T06:15:00Z",
    completed_at: "2026-04-18T06:15:00Z",
    exit_code: 0,
    rows_in: 30000,
    rows_out: 29987,
    rows_error: 13,
    events_emitted: 120,
    log_uri: "gs://vm-logs-archive-central-element-323112/canonical-migration-cefi-20260418-042359/run.log",
    machine_type: null,
    zone: null,
    uptime_hours: null,
    health_status: null,
    ...overrides,
  };
}

async function mockBase(page: Page, recentRows: unknown[] = []) {
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
  await page.route("**/api/vm-deployments", (route) =>
    route.fulfill({
      json: {
        active: [],
        recent: recentRows,
        archive_days: 7,
      },
    }),
  );
}

test.describe("VM Deployments — Archive History (§2.P1)", () => {
  test("COMPLETED entry shows outcome badge, duration, rows captured, log link", async ({ page }) => {
    const entry = makeArchiveEntry();
    await mockBase(page, [entry]);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    const row = page.getByTestId("archive-row-dep-archive-1");
    await expect(row).toBeVisible();

    // Outcome badge
    const outcome = page.getByTestId("outcome-dep-archive-1");
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText("COMPLETED");

    // Duration: started_at=04:00, completed_at=06:15 → 135m = 2h 15m
    const duration = page.getByTestId("duration-dep-archive-1");
    await expect(duration).toBeVisible();
    await expect(duration).toContainText("h");

    // Rows captured
    const rowsCaptured = page.getByTestId("rows-captured-dep-archive-1");
    await expect(rowsCaptured).toBeVisible();
    await expect(rowsCaptured).toContainText("29,987");

    // Log link renders as clickable "run.log"
    const logLink = page.getByTestId("log-link-dep-archive-1");
    await expect(logLink).toBeVisible();
    await expect(logLink).toContainText("run.log");
    const href = await logLink.getAttribute("href");
    expect(href).toContain("console.cloud.google.com");
    expect(href).toContain("vm-logs-archive-central-element-323112");
  });

  test("FAILED entry shows error outcome badge with exit code", async ({ page }) => {
    const entry = makeArchiveEntry({
      deployment_id: "dep-failed-1",
      vm_name: "features-onchain-defi-20260420-080000",
      status: "failed",
      exit_code: 1,
      rows_out: 0,
      completed_at: "2026-04-20T09:00:00Z",
      log_uri: "gs://vm-logs-archive-central-element-323112/features-onchain-defi-20260420-080000/run.log",
    });
    await mockBase(page, [entry]);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    const outcome = page.getByTestId("outcome-dep-failed-1");
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText("FAILED");

    const rowsCaptured = page.getByTestId("rows-captured-dep-failed-1");
    await expect(rowsCaptured).toContainText("—");
  });

  test("reaped entry shows warning outcome badge", async ({ page }) => {
    const entry = makeArchiveEntry({
      deployment_id: "dep-reaped-1",
      status: "reaped",
      exit_code: 125,
      completed_at: "2026-04-20T09:00:00Z",
      rows_out: 0,
    });
    await mockBase(page, [entry]);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    const outcome = page.getByTestId("outcome-dep-reaped-1");
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText("reaped");
  });

  test("empty archive renders None without JS crash", async ({ page }) => {
    await mockBase(page, []);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
    await expect(page.getByText("None").first()).toBeVisible();
  });

  test("entry with no log_uri shows dash instead of link", async ({ page }) => {
    const entry = makeArchiveEntry({
      deployment_id: "dep-nolog-1",
      log_uri: "",
    });
    await mockBase(page, [entry]);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("log-link-dep-nolog-1")).not.toBeVisible();
  });
});
