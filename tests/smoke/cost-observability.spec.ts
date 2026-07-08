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

  test("breakdown bars + table are merged into one table with an inline bar-in-cell (regression: separate bar chart removed)", async ({
    page,
  }) => {
    await page.goto("/ops/costs");
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();

    // Only one breakdown table on the page — no separate standalone bar-chart list alongside it.
    await expect(page.getByTestId("cost-breakdown-table")).toHaveCount(1);

    // Default sort is cost desc, so the top row carries the max cost in-window — its inline
    // bar-in-cell should render at (near) full width, proving the bar tracks the row's own cost.
    const firstBarFill = table.locator("tbody tr").first().getByTestId("cost-bar-fill");
    await expect(firstBarFill).toBeVisible();
    const width = await firstBarFill.evaluate((el) => (el as HTMLElement).style.width);
    expect(parseFloat(width)).toBeGreaterThan(90);

    // Sorting by cost ascending flips the bar's magnitude too — proves the bar is data-driven,
    // not a static decoration, and lives in the same row as the label + share it replaced a
    // separate chart column for.
    await table.getByRole("columnheader", { name: /cost/i }).click();
    const lastBarFill = table.locator("tbody tr").first().getByTestId("cost-bar-fill");
    const ascWidth = await lastBarFill.evaluate((el) => (el as HTMLElement).style.width);
    expect(parseFloat(ascWidth)).toBeLessThan(parseFloat(width));
  });

  test("breakdown table shows gross/credit columns only where a credit applies (mirrors the KPI band)", async ({
    page,
  }) => {
    await page.goto("/ops/costs");
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();

    // Default "By service · all clouds" view includes GCP (which carries a mock promo credit) —
    // the Gross/Credit columns render, and at least one row shows a dash (AWS/GitHub, no credit).
    await expect(page.getByTestId("cost-col-gross")).toBeVisible();
    await expect(page.getByTestId("cost-col-credit")).toBeVisible();
    const creditCells = table.locator("tbody tr").getByTestId("cost-row-credit");
    await expect.poll(async () => (await creditCells.allTextContents()).some((t) => t === "—")).toBe(true);
    await expect.poll(async () => (await creditCells.allTextContents()).some((t) => t.startsWith("−$"))).toBe(true);

    // Filtering to AWS-only removes every GCP (credited) row — the columns disappear entirely
    // rather than rendering two all-dash columns.
    const pageRoot = page.getByTestId("cost-observability-page");
    await pageRoot.getByRole("button", { name: "AWS", exact: true }).click();
    await expect(page.getByTestId("cost-col-gross")).toHaveCount(0);
    await expect(page.getByTestId("cost-col-credit")).toHaveCount(0);
  });

  test("By bucket shows storage/class-split/$-per-GB columns formatted in GB, not bytes", async ({ page }) => {
    await page.goto("/ops/costs");
    const pageRoot = page.getByTestId("cost-observability-page");
    await pageRoot.getByRole("button", { name: "By bucket", exact: true }).click();
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();
    await expect(table).toContainText("central-element-323112-events");

    // Storage column reads in GB (mock fixture sums to 18,500 GB for the top bucket) — never a
    // raw byte count (which would be ~9-10 digits with no unit for this fixture).
    const storageCell = table.locator("tbody tr").first().getByTestId("cost-bucket-storage-gb");
    await expect(storageCell).toContainText("GB");
    await expect(storageCell).toContainText("18,500");

    // Storage-class split lists the per-class GB breakdown (Standard/Nearline/Coldline/Archive).
    const classCell = table.locator("tbody tr").first().getByTestId("cost-bucket-storage-class");
    await expect(classCell).toContainText("Standard");
    await expect(classCell).toContainText("GB");

    // $/GB column renders a per-GB rate, not the row's raw total cost.
    const perGbCell = table.locator("tbody tr").first().getByTestId("cost-bucket-cost-per-gb");
    await expect(perGbCell).toContainText("/GB");

    // These columns are bucket-dimension-only — switching to "By resource" drops them.
    await pageRoot.getByRole("button", { name: "By resource", exact: true }).click();
    await expect(page.getByTestId("cost-bucket-storage-gb")).toHaveCount(0);
  });

  test("By resource shows machine specs + cost-waste badges (idle IP / orphaned disk) made visually obvious", async ({
    page,
  }) => {
    await page.goto("/ops/costs");
    const pageRoot = page.getByTestId("cost-observability-page");
    await pageRoot.getByRole("button", { name: "By resource", exact: true }).click();
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();
    await expect(table).toContainText("ikenna-windows-tokyo-restored");

    // A VM row's machine spec renders (model · vCPU · GB, per the mock's e2-highmem-8 fixture).
    await expect(page.getByText(/e2-highmem-8.*8 vCPU.*64 GB/)).toBeVisible();

    // The orphaned-disk mock resource carries a waste badge + its own cost as the waste amount —
    // not a separate/hidden sub-amount, the row's cost IS the waste.
    const wasteCells = table.locator("tbody tr").getByTestId("cost-resource-waste");
    await expect.poll(async () => (await wasteCells.allTextContents()).some((t) => /orphaned/i.test(t))).toBe(true);
    await expect.poll(async () => (await wasteCells.allTextContents()).some((t) => t.includes("68.62"))).toBe(true);
    // Non-waste resource rows dash instead of a false "$0.00" waste amount.
    await expect.poll(async () => (await wasteCells.allTextContents()).some((t) => t === "—")).toBe(true);

    // Both columns are resource-dimension-only — switching away drops them.
    await pageRoot.getByRole("button", { name: "By bucket", exact: true }).click();
    await expect(page.getByTestId("cost-resource-machine")).toHaveCount(0);
    await expect(page.getByTestId("cost-resource-waste")).toHaveCount(0);
  });

  test("switching dimension never shows the prior fetch's rows under the new header (loading gate during refetch)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as typeof window & { __mockBreakdownDelayMs?: Record<string, number> }).__mockBreakdownDelayMs = {
        resource: 400,
      };
    });
    await page.goto("/ops/costs");
    const pageRoot = page.getByTestId("cost-observability-page");
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();
    await expect(table).toContainText("Compute Engine"); // default "By service" rows loaded

    await pageRoot.getByRole("button", { name: "By resource", exact: true }).click();
    // While the (slowed) resource fetch is in flight, the body shows the loading gate — never the
    // prior "service"-dimension rows re-rendered under the "resource" header.
    await expect(page.getByTestId("cost-breakdown-loading")).toBeVisible();
    await expect(table).not.toContainText("Compute Engine");

    // Once the slow fetch resolves, the gate clears and the correct resource rows render.
    await expect(page.getByTestId("cost-breakdown-loading")).toHaveCount(0, { timeout: 2000 });
    await expect(table).toContainText("mtds-perp-funding-backfill");
  });

  test("a stale slower response never clobbers a fresher one after a rapid dimension switch", async ({ page }) => {
    await page.addInitScript(() => {
      (window as typeof window & { __mockBreakdownDelayMs?: Record<string, number> }).__mockBreakdownDelayMs = {
        resource: 400,
      };
    });
    await page.goto("/ops/costs");
    const pageRoot = page.getByTestId("cost-observability-page");
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();

    // "By resource" is slowed (400ms); "By bucket" is fast (default ~60ms) and clicked right after,
    // so bucket's response lands first — the still-in-flight, now-stale resource response must not
    // be allowed to land afterward and overwrite the fresher bucket state.
    await pageRoot.getByRole("button", { name: "By resource", exact: true }).click();
    await pageRoot.getByRole("button", { name: "By bucket", exact: true }).click();

    await expect(page.getByTestId("cost-bucket-storage-gb").first()).toBeVisible({ timeout: 2000 });
    // Give the slow, now-stale "resource" response time to resolve in the background.
    await page.waitForTimeout(500);
    // Bucket columns/rows are still in view — the late resource response never overwrote them.
    await expect(page.getByTestId("cost-bucket-storage-gb").first()).toBeVisible();
    await expect(table).not.toContainText("mtds-perp-funding-backfill");
  });

  test("headline shows net with the gross − credits derivation", async ({ page }) => {
    await page.goto("/ops/costs");
    // Total tile leads with net, then the derivation line (mock gives GCP ~20% promo credit).
    const bd = page.getByTestId("cost-total-breakdown");
    await expect(bd).toBeVisible();
    await expect(bd).toContainText("gross");
    await expect(bd).toContainText("credits");
    // The GCP tile carries its own credit line; AWS (no credits) does not.
    await expect(page.getByTestId("cost-cloud-breakdown-gcp")).toBeVisible();
    await expect(page.getByTestId("cost-cloud-breakdown-aws")).toHaveCount(0);
  });
});
