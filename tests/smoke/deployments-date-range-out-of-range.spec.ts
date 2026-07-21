/**
 * pw:L2 — WS-2 out-of-range archive-floor banner (decision 5).
 *
 * Regression guard for deployment_ui_date_range_filter_and_search_2026_07_20 decision 5: a
 * date-range request whose `date_from` predates the real 30-day GCS archive retention floor must
 * surface an EXPLICIT "no data before <floor>" banner — never a silently clipped/partial result an
 * operator would mistake for "nothing ran in that window". The mock API (src/lib/mock-api.ts) mirrors
 * the backend's `_archive_floor_date` (today minus 29 days) and returns `archive_floor` +
 * `date_range_out_of_range` on `/api/deployments/inventory` only when a date-range param is present.
 * `2000-01-01` is used as the out-of-range `date_from` so that assertion never depends on "today"
 * drifting; the within-floor case below computes its range relative to `new Date()` for the same
 * reason (a fixed recent-looking literal would eventually age past the 30-day floor itself).
 */
import { expect, test } from "@playwright/test";

test.describe("Deployments out-of-range archive-floor banner (WS-2 decision 5)", () => {
  test("a date_from older than the 30-day floor shows the explicit banner", async ({ page }) => {
    await page.goto("/deployments?status=all&date_from=2000-01-01");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();

    const banner = page.getByTestId("deployments-date-range-out-of-range");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/no data before/i);
    await expect(banner).not.toHaveClass(/text-red-400/); // distinct from the fetch-error banner tone
  });

  test("a recent date range (within the floor) shows no out-of-range banner", async ({ page }) => {
    // Computed relative to "now" (not a fixed literal) so this stays within the 30-day floor no
    // matter when the suite runs.
    const today = new Date();
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 5);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = today.toISOString().slice(0, 10);
    await page.goto(`/deployments?status=all&date_from=${fromStr}&date_to=${toStr}`);
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    await expect(page.getByTestId("deployments-date-range-out-of-range")).toHaveCount(0);
  });

  test("no date filter at all shows no out-of-range banner", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    await expect(page.getByTestId("deployments-date-range-out-of-range")).toHaveCount(0);
  });
});
