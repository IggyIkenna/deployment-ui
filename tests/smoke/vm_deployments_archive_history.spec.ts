/**
 * Regression spec: VM Deployments — Archive History tab (§2.P1 + canonical_vm_log_archival-005)
 *
 * Covers the archive table added for completed/failed/reaped VM deployments:
 *   - Outcome badge shows COMPLETED / FAILED / reaped
 *   - Duration column shows formatted elapsed time
 *   - Rows Captured column shows rows_out
 *   - run.log link → durable log-archive/rolling/ path (deployment-scripts-{pid}, no 14-day TTL)
 *   - serial link → durable log-archive/serial-rolling/ path (for VMs with serial capture)
 *   - Empty archive renders "None" without JS crash
 *
 * Note: mock-api.ts patches window.fetch for all /api/ routes, so Playwright
 * route mocks for /api/ paths are bypassed. We inject vm-deployment data via
 * window.__mockVmDeploymentOverride (handled in mock-api.ts).
 */

import { expect, type Page, test } from "@playwright/test";

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
    log_uri: "gs://deployment-scripts-central-element-323112/vm-logs/canonical-migration-cefi-20260418-042359/run.log",
    archive_run_log_uri:
      "gs://deployment-scripts-central-element-323112/log-archive/rolling/20260418/canonical-migration-cefi-20260418-042359/run.log",
    archive_serial_uri:
      "gs://deployment-scripts-central-element-323112/log-archive/serial-rolling/20260418/canonical-migration-cefi-20260418-042359/serial-console.txt",
    machine_type: null,
    zone: null,
    uptime_hours: null,
    health_status: null,
    ...overrides,
  };
}

async function injectVmDeploymentData(page: Page, recentRows: unknown[]) {
  await page.addInitScript((rows) => {
    (window as typeof window & { __mockVmDeploymentOverride?: unknown }).__mockVmDeploymentOverride = {
      active: [],
      recent: rows,
      archive_days: 7,
    };
  }, recentRows);
}

test.describe("VM Deployments — Archive History (§2.P1)", () => {
  test("COMPLETED entry shows outcome badge, duration, rows captured, log link", async ({ page }) => {
    const entry = makeArchiveEntry();
    await injectVmDeploymentData(page, [entry]);
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

    // run.log link → durable log-archive/rolling/ path (canonical, no 14-day TTL)
    const logLink = page.getByTestId("log-link-dep-archive-1");
    await expect(logLink).toBeVisible();
    await expect(logLink).toContainText("run.log");
    const href = await logLink.getAttribute("href");
    expect(href).toContain("console.cloud.google.com");
    expect(href).toContain("deployment-scripts-central-element-323112");
    expect(href).toContain("log-archive");

    // serial link → durable log-archive/serial-rolling/ path
    const serialLink = page.getByTestId("serial-link-dep-archive-1");
    await expect(serialLink).toBeVisible();
    await expect(serialLink).toContainText("serial");
    const serialHref = await serialLink.getAttribute("href");
    expect(serialHref).toContain("console.cloud.google.com");
    expect(serialHref).toContain("serial-rolling");
  });

  test("FAILED entry shows error outcome badge with exit code", async ({ page }) => {
    const entry = makeArchiveEntry({
      deployment_id: "dep-failed-1",
      vm_name: "features-onchain-defi-20260420-080000",
      status: "failed",
      exit_code: 1,
      rows_out: 0,
      completed_at: "2026-04-20T09:00:00Z",
      log_uri: "gs://deployment-scripts-central-element-323112/vm-logs/features-onchain-defi-20260420-080000/run.log",
      archive_run_log_uri:
        "gs://deployment-scripts-central-element-323112/log-archive/rolling/20260420/features-onchain-defi-20260420-080000/run.log",
    });
    await injectVmDeploymentData(page, [entry]);
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
    await injectVmDeploymentData(page, [entry]);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    const outcome = page.getByTestId("outcome-dep-reaped-1");
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText("reaped");
  });

  test("empty archive renders None without JS crash", async ({ page }) => {
    await injectVmDeploymentData(page, []);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
    await expect(page.getByText("None").first()).toBeVisible();
  });

  test("entry with no archive URIs shows dash instead of link", async ({ page }) => {
    const entry = makeArchiveEntry({
      deployment_id: "dep-nolog-1",
      log_uri: "",
      archive_run_log_uri: "",
      archive_serial_uri: "",
    });
    await injectVmDeploymentData(page, [entry]);
    await page.goto("/vm-deployments");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("log-link-dep-nolog-1")).not.toBeVisible();
  });
});
