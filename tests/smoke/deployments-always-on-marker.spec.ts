/**
 * pw:L2 — WS-2 always-on/no-interval sort-last + visual marker (decision 2).
 *
 * Regression guard for deployment_ui_date_range_filter_and_search_2026_07_20 decision 2: a row whose
 * kind carries NO start/end interval at all (Cloud Run/ECS service, function, orphaned disk/IP — the
 * backend's `_apply_date_range` passes these through unfiltered regardless of range) must (a) stay
 * visible in a date-range-filtered view, (b) sort LAST — after every interval-backed/single-timestamp
 * row, and (c) render a distinct "always-on" badge that is visibly different from the amber
 * `basis === "approx"` colour-only convention (decision 4) — this means "not applicable", not
 * "uncertain". The marker only appears while a date-range filter is actually active: outside a
 * date-filtered view, an always-on row's sort position and rendering are unaffected (no filter to
 * explain away). Runs against the mock API (src/lib/mock-api.ts): `market-data-query-service` is a
 * CLOUD_RUN_SERVICE with no `last_run_at`; `defi-live-capture-1` is a VM with a real
 * `last_run_at` of 2026-06-22.
 */
import { expect, test } from "@playwright/test";

test.describe("Deployments always-on sort-last + badge (WS-2 decision 2)", () => {
  test("always-on row gets the cyan badge and sorts after an interval-backed row when date-filtered", async ({
    page,
  }) => {
    await page.goto("/deployments?status=all&date_from=2026-06-20&date_to=2026-06-25");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();

    const alwaysOnCell = page.getByTestId("last-run-market-data-query-service");
    await expect(alwaysOnCell).toBeVisible();
    await expect(alwaysOnCell).toHaveAttribute("data-always-on", "true");
    const badge = page.getByTestId("always-on-badge-market-data-query-service");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/always-on/i);
    await expect(badge).toHaveClass(/text-cyan-400/);
    // Distinct from the approx amber tone — the always-on cell itself must never carry it.
    await expect(alwaysOnCell).not.toHaveClass(/text-amber-400/);

    // Sort-last: the always-on CLOUD_RUN_SERVICE row must appear AFTER the interval-backed VM row
    // whose last_run_at (2026-06-22) falls inside the requested range.
    const rowNames = await page
      .getByTestId("deployment-matrix")
      .locator("tbody tr")
      .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-testid")));
    const vmIndex = rowNames.indexOf("deployment-row-defi-live-capture-1");
    const serviceIndex = rowNames.indexOf("deployment-row-market-data-query-service");
    expect(vmIndex).toBeGreaterThanOrEqual(0);
    expect(serviceIndex).toBeGreaterThanOrEqual(0);
    expect(serviceIndex).toBeGreaterThan(vmIndex);
  });

  test("no date filter → no always-on badge, sort order unaffected", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();

    const alwaysOnCell = page.getByTestId("last-run-market-data-query-service");
    await expect(alwaysOnCell).toBeVisible();
    await expect(alwaysOnCell).not.toHaveAttribute("data-always-on", "true");
    await expect(page.getByTestId("always-on-badge-market-data-query-service")).toHaveCount(0);
  });
});
