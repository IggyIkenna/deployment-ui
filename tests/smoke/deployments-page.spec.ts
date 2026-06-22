/**
 * Smoke: Deployments observability page renders against the mock API.
 *
 * Regression guard for the /deployments surface (Phase 2 of
 * deployment_observability_parity_live_batch_paper_2026_06_22.md): the umbrella
 * tabs (Live / Batch / Paper) render, a target row appears, the failed/137 row
 * shows the failed badge + exit code, a status filter deep-link narrows the list,
 * and the per-target drill-down renders. The mock API (VITE_MOCK_API=true via the
 * playwright webServer) serves /api/deployments/inventory + the umbrella summary.
 */
import { expect, test } from "@playwright/test";

test.describe("Deployments observability page", () => {
  test("nav entry routes to /deployments and the umbrella tabs + a target row render", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-deployments").click();
    await expect(page).toHaveURL(/\/deployments$/);
    await expect(page.getByTestId("deployments-page")).toBeVisible();
    await expect(page.getByTestId("umbrella-tab-LIVE")).toBeVisible();
    await expect(page.getByTestId("umbrella-tab-BATCH")).toBeVisible();
    await expect(page.getByTestId("umbrella-tab-PAPER")).toBeVisible();
    // A live target row appears in the default (Live) tab.
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
    // Both GCP and AWS cloud badges render.
    await expect(page.getByTestId("cloud-badge-GCP").first()).toBeVisible();
    await expect(page.getByTestId("cloud-badge-AWS").first()).toBeVisible();
  });

  test("Batch tab surfaces the failed/137 (OOM) row with a failed badge + exit code", async ({ page }) => {
    await page.goto("/deployments?umbrella=batch");
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
    await page.goto("/deployments?umbrella=batch");
    await page.getByTestId("deployment-link-sports-backfill-20260621").click();
    await expect(page).toHaveURL(/\/deployments\/sports-backfill-20260621$/);
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();
    await expect(page.getByTestId("deployment-detail-title")).toContainText("sports-backfill-20260621");
    await expect(page.getByTestId("detail-exit-code")).toContainText("137 (OOM)");
    await expect(page.getByTestId("detail-run-log")).toContainText("run.log");
    // Reused per-VM detail backbone renders.
    await expect(page.getByTestId("vm-events-timeline")).toBeVisible();
  });
});
