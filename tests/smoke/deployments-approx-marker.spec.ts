/**
 * pw:L2 — WS-2 approx-row colour marker (decision 4).
 *
 * Regression guard for deployment_ui_date_range_filter_and_search_2026_07_20 decision 4: any row
 * whose Last Run figure is DERIVED rather than authoritative (`basis === "approx"` — heartbeat-stale
 * VMs, unmanaged-VM fallback, single-timestamp kinds like Cloud Run jobs) reuses the WS-1 partial-day
 * colour convention already shipped for the Cost cell (deployment_ui_cost_per_day_accuracy_2026_07_20):
 * the amber warning tone, colour only, no added text label. Runs against the mock API whose fixtures
 * live in src/lib/mock-api.ts (funding-ensemble-paper-week is a CLOUD_RUN_JOB — a single-timestamp
 * kind — mocked with basis "approx"; defi-live-capture-1 has no `basis` set, i.e. authoritative).
 */
import { expect, test } from "@playwright/test";

test.describe("Deployments approx-row colour marker (WS-2 decision 4)", () => {
  test("approx last-run renders in the amber warning tone, no text label added", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();

    const lastRun = page.getByTestId("last-run-funding-ensemble-paper-week");
    await expect(lastRun).toBeVisible();
    await expect(lastRun).toHaveAttribute("data-basis", "approx");
    await expect(lastRun).toHaveClass(/text-amber-400/);
    // Colour is the only signal — no added "approx"/"est."/tooltip text in the visible figure.
    await expect(lastRun).not.toContainText(/approx/i);
  });

  test("authoritative last-run renders without the amber tone", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();

    // defi-live-capture-1 carries no `basis` field (authoritative last_run_at).
    const lastRun = page.getByTestId("last-run-defi-live-capture-1");
    await expect(lastRun).toBeVisible();
    await expect(lastRun).not.toHaveAttribute("data-basis", "approx");
    await expect(lastRun).not.toHaveClass(/text-amber-400/);
  });
});
