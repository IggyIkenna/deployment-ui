/**
 * Regression spec: VM archive history, folded into DeploymentDetail's History card
 * (Fleet-tab consolidation, deployment_ui_fleet_tab_consolidation_2026_07_21.md).
 *
 * /vm-deployments (the old standalone archive table) is RETIRED — this spec previously
 * exercised it directly; it now exercises the SAME content at its new home,
 * DeploymentDetail's "History" card (VmRunHistoryCard), scoped to one target's rows:
 *   - Outcome badge shows COMPLETED / FAILED / reaped
 *   - Duration column shows formatted elapsed time
 *   - Rows Captured column shows rows_out
 *   - run.log link → durable log-archive/rolling/ path (deployment-scripts-{pid}, no 14-day TTL)
 *   - serial link → durable log-archive/serial-rolling/ path (for VMs with serial capture)
 *   - No archived runs renders the honest empty state without a JS crash
 *
 * Note: mock-api.ts patches window.fetch for all /api/ routes, so Playwright
 * route mocks for /api/ paths are bypassed. We inject vm-deployment data via
 * window.__mockVmDeploymentOverride (handled in mock-api.ts) — the SAME override
 * DeploymentDetail's VmRunHistoryCard reads through fetchVmDeployments().
 */

import { expect, type Page, test } from "@playwright/test";

// cefi-backfill-20260620 is a known default entry in mock-api.ts's inventory (also used by
// run-log-panel.spec.ts) — DeploymentDetail needs a real inventory match to render its header.
const TARGET_VM = "cefi-backfill-20260620";

function makeArchiveEntry(overrides: Record<string, unknown> = {}) {
  return {
    deployment_id: "dep-archive-1",
    vm_name: TARGET_VM,
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
    log_uri: `gs://deployment-scripts-central-element-323112/vm-logs/${TARGET_VM}/run.log`,
    archive_run_log_uri: `gs://deployment-scripts-central-element-323112/log-archive/rolling/20260418/${TARGET_VM}/run.log`,
    archive_serial_uri: `gs://deployment-scripts-central-element-323112/log-archive/serial-rolling/20260418/${TARGET_VM}/serial-console.txt`,
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
      archive_days: 30,
    };
  }, recentRows);
}

test.describe("DeploymentDetail — VM History card (folded /vm-deployments archive)", () => {
  // /vm-deployments stays LIVE (legacy-quarantined, not redirected — operator decision
  // BLK-7cb5bbbc): its 2 remaining unique features (the "Reconcile Registry" action + the raw
  // active/archive VM table) have no other home yet — a follow-up todo tracks relocating those
  // before this route can be deleted for real. Its 4 venue-config panels already moved to
  // /venue-config (2026-07-21) — see tests/smoke/venue_tardis_windows.spec.ts +
  // vm_deployments_reconcile.spec.ts for that page's own regression coverage, unaffected here.
  test("/vm-deployments stays reachable (legacy-quarantined, off the canonical nav)", async ({ page }) => {
    await page.goto("/vm-deployments");
    await expect(page).toHaveURL(/\/vm-deployments$/);
    await expect(page.getByTestId("reconcile-registry-btn")).toBeVisible();
  });

  test("COMPLETED entry shows outcome badge, duration, rows captured, log link", async ({ page }) => {
    const entry = makeArchiveEntry();
    await injectVmDeploymentData(page, [entry]);
    await page.goto(`/deployments/${TARGET_VM}`);
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();

    const row = page.getByTestId("vm-history-row-dep-archive-1");
    await expect(row).toBeVisible();

    const outcome = page.getByTestId("vm-history-outcome-dep-archive-1");
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText("COMPLETED");

    // Duration: started_at=04:00, completed_at=06:15 → 135m = 2h 15m
    await expect(row).toContainText("h");

    // Rows captured
    await expect(row).toContainText("29,987");

    // run.log link → durable log-archive/rolling/ path (canonical, no 14-day TTL)
    const logLink = page.getByTestId("vm-history-log-link-dep-archive-1");
    await expect(logLink).toBeVisible();
    await expect(logLink).toContainText("run.log");
    const href = await logLink.getAttribute("href");
    expect(href).toContain("console.cloud.google.com");
    expect(href).toContain("deployment-scripts-central-element-323112");
    expect(href).toContain("log-archive");

    // serial link → durable log-archive/serial-rolling/ path
    const serialLink = page.getByTestId("vm-history-serial-link-dep-archive-1");
    await expect(serialLink).toBeVisible();
    await expect(serialLink).toContainText("serial");
    const serialHref = await serialLink.getAttribute("href");
    expect(serialHref).toContain("console.cloud.google.com");
    expect(serialHref).toContain("serial-rolling");
  });

  test("FAILED entry shows error outcome badge", async ({ page }) => {
    const entry = makeArchiveEntry({
      deployment_id: "dep-failed-1",
      status: "failed",
      exit_code: 1,
      rows_out: 0,
      completed_at: "2026-04-20T09:00:00Z",
    });
    await injectVmDeploymentData(page, [entry]);
    await page.goto(`/deployments/${TARGET_VM}`);
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();

    const outcome = page.getByTestId("vm-history-outcome-dep-failed-1");
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText("FAILED");

    const row = page.getByTestId("vm-history-row-dep-failed-1");
    await expect(row).toContainText("—"); // rows_out=0 -> dash, not a fabricated 0
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
    await page.goto(`/deployments/${TARGET_VM}`);
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();

    const outcome = page.getByTestId("vm-history-outcome-dep-reaped-1");
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText("reaped");
  });

  test("no archived runs renders the honest empty state without a JS crash", async ({ page }) => {
    await injectVmDeploymentData(page, []);
    await page.goto(`/deployments/${TARGET_VM}`);
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
    await expect(page.getByTestId("detail-vm-history")).toContainText("No archived runs.");
  });

  test("entry with no archive URIs shows dash instead of a log link", async ({ page }) => {
    const entry = makeArchiveEntry({
      deployment_id: "dep-nolog-1",
      log_uri: "",
      archive_run_log_uri: "",
      archive_serial_uri: "",
    });
    await injectVmDeploymentData(page, [entry]);
    await page.goto(`/deployments/${TARGET_VM}`);
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();

    await expect(page.getByTestId("vm-history-log-link-dep-nolog-1")).not.toBeVisible();
  });
});
