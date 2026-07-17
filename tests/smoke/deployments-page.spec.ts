/**
 * Smoke: Deployments observability page renders against the mock API.
 *
 * Regression guard for the /deployments surface — MERGED into one flat all-modes table
 * (operator 2026-07-08; live/batch/paper are a Mode FILTER, not tabs). Guards: the unified
 * table renders every mode with a Mode badge, the failed/137 row shows the failed badge +
 * exit code, a mode+status filter deep-link narrows the list, and the per-target drill-down
 * renders. The mock API (VITE_MOCK_API=true via the playwright webServer) serves
 * /api/deployments/inventory + the umbrella summaries.
 */
import { expect, test } from "@playwright/test";

test.describe("Deployments observability page (unified all-modes)", () => {
  test("the /deployments page renders one flat table with every mode + a Mode filter", async ({ page }) => {
    // status=all so completed/failed + paper rows show alongside running (the default is
    // running — live-first). On the plain route this is a real filter deep-link (the fix).
    await page.goto("/deployments?status=all");
    await expect(page).toHaveURL(/status=all/);
    await expect(page.getByTestId("deployments-page")).toBeVisible();
    // Mode is a FILTER now, not per-mode tabs.
    await expect(page.getByTestId("umbrella-tab-LIVE")).toHaveCount(0);
    await expect(page.getByTestId("filter-mode")).toBeVisible();
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    // Rows from MULTIPLE modes appear together (live + batch + paper) with Mode badges.
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("deployment-row-sports-backfill-20260621")).toBeVisible();
    await expect(page.getByTestId("deployment-row-defi-paper-trading-1")).toBeVisible();
    await expect(page.getByTestId("mode-badge-LIVE").first()).toBeVisible();
    await expect(page.getByTestId("mode-badge-BATCH").first()).toBeVisible();
    await expect(page.getByTestId("mode-badge-PAPER").first()).toBeVisible();
    // Both GCP and AWS cloud badges render.
    await expect(page.getByTestId("cloud-badge-GCP").first()).toBeVisible();
    await expect(page.getByTestId("cloud-badge-AWS").first()).toBeVisible();
  });

  test("the mode filter (umbrella deep-link) surfaces the failed/137 (OOM) batch row", async ({ page }) => {
    // status=all reveals the failed row (default running would hide it); umbrella=batch scopes mode.
    await page.goto("/deployments?umbrella=batch&status=all");
    const row = page.getByTestId("deployment-row-sports-backfill-20260621");
    await expect(row).toBeVisible();
    await expect(page.getByTestId("status-sports-backfill-20260621")).toContainText("failed");
    await expect(row).toContainText("137 (OOM)");
    // The per-umbrella summary header surfaces the last failure.
    await expect(page.getByTestId("summary-last-failure")).toContainText("sports-backfill-20260621");
  });

  test("status filter deep-link narrows the list to failed targets", async ({ page }) => {
    await page.goto("/deployments?umbrella=batch&status=failed");
    await expect(page.getByTestId("deployment-row-sports-backfill-20260621")).toBeVisible();
    // The succeeded Cloud Run job is filtered out.
    await expect(page.getByTestId("deployment-row-manifest-consolidator")).toHaveCount(0);
    // The status select reflects the URL param.
    await expect(page.getByTestId("filter-status")).toHaveValue("failed");
  });

  test("per-target detail drills down with exit code, run.log link, timeline + log tail", async ({ page }) => {
    await page.goto("/deployments?umbrella=batch&status=all");
    await page.getByTestId("deployment-link-sports-backfill-20260621").click();
    // A row opens the in-context slide-over (deep-linkable via ?detail=), not a full-page nav.
    // The standalone full page still exists at /deployments/:name (Alerts deep-links to it).
    await expect(page.getByTestId("cockpit-detail-panel")).toBeVisible();
    await expect(page).toHaveURL(/detail=sports-backfill-20260621/);
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();
    await expect(page.getByTestId("deployment-detail-title")).toContainText("sports-backfill-20260621");
    await expect(page.getByTestId("detail-exit-code")).toContainText("137 (OOM)");
    await expect(page.getByTestId("detail-run-log")).toContainText("run.log");
    // Reused per-VM detail backbone renders.
    await expect(page.getByTestId("vm-events-timeline")).toBeVisible();
  });
});
