/**
 * Smoke (pw:L2): Cost Observability page (/ops/costs) renders against the mock API and
 * its filters/sort drive re-renders.
 * Plan: unified-trading-pm/plans/active/cost_observability_ui_2026_07_08.md Phase B/C.
 */

import { expect, test } from "@playwright/test";

test.describe("Cost Observability page", () => {
  test("renders the KPI band, charts, breakdown, and leaf tables", async ({ page }) => {
    await page.goto("/ops/costs");
    await expect(page).toHaveURL(/\/ops\/costs$/);
    await expect(page.getByTestId("cost-observability-page")).toBeVisible();

    // KPI total is populated (non-zero) from the mock summary.
    const total = page.getByTestId("cost-total");
    await expect(total).toBeVisible();
    await expect(total).toContainText("$");

    // Trend chart + breakdown table + provisional notice all present.
    await expect(page.getByTestId("cost-trend-chart")).toBeVisible();
    await expect(page.getByTestId("cost-breakdown-table")).toBeVisible();
    await expect(page.getByText(/provisional/i).first()).toBeVisible();

    // Per-cloud KPI tiles + the GitHub dummy banner.
    await expect(page.getByText("GCP").first()).toBeVisible();
    await expect(page.getByText("AWS").first()).toBeVisible();
    await expect(page.getByText(/Dummy data/i)).toBeVisible();
  });

  test("dimension switch re-renders the breakdown (resource shows VM/bucket rows)", async ({ page }) => {
    await page.goto("/ops/costs");
    await page.getByRole("button", { name: "By resource" }).click();
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();
    // A known mock VM id surfaces under the resource dimension.
    await expect(table).toContainText("mtds-perp-funding-backfill");
  });

  test("cloud filter narrows to a single cloud", async ({ page }) => {
    await page.goto("/ops/costs");
    // Scope to the page — "AWS" also matches the global app-header cloud toggle.
    const pageRoot = page.getByTestId("cost-observability-page");
    await pageRoot.getByRole("button", { name: "AWS", exact: true }).click();
    await expect(page.getByText(/AWS · \d+d/).first()).toBeVisible();
  });

  test("time-range presets change the window label", async ({ page }) => {
    await page.goto("/ops/costs");
    await page.getByRole("button", { name: "7d" }).click();
    await expect(page.getByText("Total spend · last 7 days")).toBeVisible();
  });

  test("By day at 90d lists every day in a bounded scroll region (regression: 15-row table cap removed)", async ({
    page,
  }) => {
    await page.goto("/ops/costs");
    const pageRoot = page.getByTestId("cost-observability-page");
    // Widen to a 90-day window, then slice by day — the mock emits one row per day (~90).
    await pageRoot.getByRole("button", { name: "90d", exact: true }).click();
    await pageRoot.getByRole("button", { name: "By day", exact: true }).click();

    // The table previously hard-capped at 15 rows via `.slice(0, 15)`; every day now renders.
    const rows = page.getByTestId("cost-breakdown-table").locator("tbody tr");
    await expect.poll(async () => rows.count()).toBeGreaterThan(30);

    // …but the page doesn't grow unboundedly: the rows sit in a max-height scroll container
    // that actually overflows (scrollHeight > clientHeight), so the footprint stays compact.
    const scroller = page.getByTestId("cost-breakdown-scroll");
    const overflow = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeGreaterThan(0);
  });
});
