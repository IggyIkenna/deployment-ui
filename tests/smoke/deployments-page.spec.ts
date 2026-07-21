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

test.describe("Deployments date-range filter (WS-2, URL-backed ?date_from=&date_to=)", () => {
  test("a date-range deep-link narrows to targets that ran in the window, keeps signal-less rows", async ({ page }) => {
    // cefi-backfill-20260620 last-ran 2026-06-20T22:14:00Z (inside); defi-live-capture-1 last-ran
    // 2026-06-22 (outside, excluded); uts-shared-deployment-api has no last_run_at at all (an
    // always-on Cloud Run service) and must NEVER be filtered out by a date range (honest-absence
    // pass-through, matches deployment-api `_apply_date_range`).
    await page.goto("/deployments?status=all&date_from=2026-06-20&date_to=2026-06-20");
    await expect(page.getByTestId("filter-date-from")).toHaveValue("2026-06-20");
    await expect(page.getByTestId("filter-date-to")).toHaveValue("2026-06-20");
    await expect(page.getByTestId("deployment-row-cefi-backfill-20260620")).toBeVisible();
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toHaveCount(0);
    await expect(page.getByTestId("deployment-row-uts-shared-deployment-api")).toBeVisible();
  });

  test("editing the date inputs writes ?date_from=&date_to= to the URL; the ✕ clears both", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("filter-date-clear")).toHaveCount(0);
    await page.getByTestId("filter-date-from").fill("2026-06-20");
    await expect(page).toHaveURL(/date_from=2026-06-20/);
    await page.getByTestId("filter-date-to").fill("2026-06-21");
    await expect(page).toHaveURL(/date_to=2026-06-21/);
    await expect(page.getByTestId("filter-date-clear")).toBeVisible();
    await page.getByTestId("filter-date-clear").click();
    await expect(page).not.toHaveURL(/date_from=/);
    await expect(page).not.toHaveURL(/date_to=/);
    await expect(page.getByTestId("filter-date-clear")).toHaveCount(0);
  });
});
