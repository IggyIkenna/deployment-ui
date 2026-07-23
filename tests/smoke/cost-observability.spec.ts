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

    // Header currency/timezone note: USD-everywhere + GCP GBP→USD conversion + the per-cloud day-boundary
    // convention (GCP grouped in US Pacific to match its console; AWS in UTC to match Cost Explorer),
    // hover-revealed (regression: the currency mislabel + TZ-alignment reconciliation findings).
    const tzNote = page.getByTestId("cost-currency-tz-note");
    await expect(tzNote).toBeVisible();
    await tzNote.hover();
    await expect(page.getByRole("tooltip").filter({ hasText: /converted at Google's own daily rate/i })).toBeVisible();
    await expect(page.getByRole("tooltip").filter({ hasText: /US Pacific time/i })).toBeVisible();
    await expect(page.getByRole("tooltip").filter({ hasText: /AWS days follow UTC/i })).toBeVisible();
  });

  test("USD⇄GBP toggle re-denominates GCP to £, leaves AWS in $ (GCP-invoice tally view)", async ({ page }) => {
    await page.goto("/ops/costs");
    await expect(page.getByTestId("cost-cloud-total-gcp")).toContainText("$");
    await page.getByRole("button", { name: "GBP", exact: true }).click();
    // GCP (GBP-native) switches to its raw £; AWS has no GBP figure so stays $.
    await expect(page.getByTestId("cost-cloud-total-gcp")).toContainText("£");
    await expect(page.getByTestId("cost-cloud-total-aws")).toContainText("$");
    // The breakdown table's GCP rows re-denominate too (not just the KPI band).
    await expect(page.getByTestId("cost-breakdown-table")).toContainText("£");
    // Toggling back to USD restores $ everywhere.
    await page.getByRole("button", { name: "USD", exact: true }).click();
    await expect(page.getByTestId("cost-cloud-total-gcp")).toContainText("$");
  });

  test("dimension switch re-renders the breakdown (resource shows VM/bucket rows)", async ({ page }) => {
    await page.goto("/ops/costs");
    await page.getByRole("button", { name: "By resource" }).click();
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();
    // A known mock VM id surfaces under the resource dimension.
    await expect(table).toContainText("mtds-perp-funding-backfill");
  });

  test("Waste tab (after By label) shows only idle/orphaned resources, not the full resource set", async ({ page }) => {
    await page.goto("/ops/costs");
    // Positioned right after "By label" (Deployments cost-visibility follow-up, 2026-07-23).
    const dims = page.getByTestId("cost-observability-page").getByRole("button", { name: /^By |^Waste$/ });
    await expect(dims.nth(6)).toHaveText("By label");
    await expect(dims.nth(7)).toHaveText("Waste");

    await page.getByRole("button", { name: "Waste", exact: true }).click();
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();
    // Only the two waste-flagged resources from the shared resource fixture — the non-waste ones
    // (e.g. the mtds-* VMs the "By resource" test above asserts ARE present) must be absent here.
    await expect(table).toContainText("harsh-static-ip");
    await expect(table).toContainText("ikenna-windows-tokyo-restored");
    await expect(table).not.toContainText("mtds-perp-funding-backfill");
    // Header total reflects the waste-only scope ($5.95 + $68.62 = $74.57 @ default 30d), not the
    // full resource-dimension total the same fixtures would sum to.
    await expect(page.getByTestId("cost-observability-page")).toContainText("$74.57 total");
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

    // These columns are bucket-dimension-only in the breakdown table — switching to "By resource"
    // drops them there (scoped to `table`; the "Top storage buckets" leaf table carries the same
    // testid independent of the breakdown dimension selector, so a page-wide count would be wrong).
    await pageRoot.getByRole("button", { name: "By resource", exact: true }).click();
    await expect(table.getByTestId("cost-bucket-storage-gb")).toHaveCount(0);
  });

  test("By bucket splits cost into storage/operations/egress columns reflecting each bucket's real driver", async ({
    page,
  }) => {
    await page.goto("/ops/costs");
    const pageRoot = page.getByTestId("cost-observability-page");
    await pageRoot.getByRole("button", { name: "By bucket", exact: true }).click();
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();

    // The three cost-component columns render for bucket rows.
    await expect(table.getByTestId("cost-bucket-comp-storage").first()).toBeVisible();
    await expect(table.getByTestId("cost-bucket-comp-operations").first()).toBeVisible();
    await expect(table.getByTestId("cost-bucket-comp-egress").first()).toBeVisible();

    const num = (t: string | null) => parseFloat((t ?? "").replace(/[^0-9.]/g, "")) || 0;

    // The event-log bucket is operations-dominated — ops must exceed storage. This is the whole
    // point of the split: a bare total next to 95 GB looked wrong; the columns show it's ~all
    // Class-A operations, not storage.
    const events = table.locator("tbody tr", { hasText: "central-element-323112-events" }).first();
    expect(num(await events.getByTestId("cost-bucket-comp-operations").textContent())).toBeGreaterThan(
      num(await events.getByTestId("cost-bucket-comp-storage").textContent()),
    );

    // The market-data bucket is storage-dominated — storage exceeds operations.
    const cefi = table.locator("tbody tr", { hasText: "market-data-tick-cefi-central-element-323112" }).first();
    expect(num(await cefi.getByTestId("cost-bucket-comp-storage").textContent())).toBeGreaterThan(
      num(await cefi.getByTestId("cost-bucket-comp-operations").textContent()),
    );

    // The columns are bucket-dimension-only — switching to "By resource" drops them.
    await pageRoot.getByRole("button", { name: "By resource", exact: true }).click();
    await expect(table.getByTestId("cost-bucket-comp-storage")).toHaveCount(0);
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
    // Scoped to `table` — the "Top compute instances" leaf table renders the same text.
    await expect(table.getByText(/e2-highmem-8.*8 vCPU.*64 GB/)).toBeVisible();

    // The orphaned-disk mock resource carries a waste badge + the GROSS cost as the waste amount —
    // the mock's ikenna disk is net $68.62 but gross $82.34 (a ~20% promo credit); the waste column
    // must show the gross ($82.34), the honest "what the idle resource costs / what you'll pay when
    // the promo ends", NOT the credit-masked net (which for a fully-credited idle IP rounds to ~$0
    // and would read as "not waste").
    const wasteCells = table.locator("tbody tr").getByTestId("cost-resource-waste");
    await expect.poll(async () => (await wasteCells.allTextContents()).some((t) => /orphaned/i.test(t))).toBe(true);
    await expect.poll(async () => (await wasteCells.allTextContents()).some((t) => t.includes("82.34"))).toBe(true);
    await expect.poll(async () => (await wasteCells.allTextContents()).every((t) => !t.includes("68.62"))).toBe(true);
    // Non-waste resource rows dash instead of a false "$0.00" waste amount.
    await expect.poll(async () => (await wasteCells.allTextContents()).some((t) => t === "—")).toBe(true);

    // Both columns are resource-dimension-only in the breakdown table — switching away drops them
    // there (scoped to `table`; the "Top compute instances" leaf table carries the same testids
    // independent of the breakdown dimension selector).
    await pageRoot.getByRole("button", { name: "By bucket", exact: true }).click();
    await expect(table.getByTestId("cost-resource-machine")).toHaveCount(0);
    await expect(table.getByTestId("cost-resource-waste")).toHaveCount(0);
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

  test("leaf tables carry the same dimension-aware detail columns as the breakdown table (machine/waste, storage)", async ({
    page,
  }) => {
    await page.goto("/ops/costs");

    // "Top compute instances" is pinned to vm rows — same Machine/Waste columns as the breakdown
    // table's "By resource" view, not a separate/lesser column set.
    const vmTable = page.getByTestId("leaf-vm-table");
    await expect(vmTable).toBeVisible();
    await expect(vmTable).toContainText("e2-highmem-8");
    await expect(vmTable).toContainText("8 vCPU");

    // "Top storage buckets" is pinned to bucket rows — same Storage/class/$-per-GB columns as the
    // breakdown table's "By bucket" view, formatted in GB (not bytes).
    const bucketTable = page.getByTestId("leaf-bucket-table");
    await expect(bucketTable).toBeVisible();
    const storageCell = bucketTable.getByTestId("cost-bucket-storage-gb").first();
    await expect(storageCell).toContainText("GB");
    await expect(bucketTable.getByTestId("cost-bucket-cost-per-gb").first()).toContainText("/GB");
  });

  test("leaf table detail columns scroll horizontally instead of overflowing on narrow widths", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 900 });
    await page.goto("/ops/costs");
    const scroller = page.getByTestId("leaf-vm-scroll");
    await expect(scroller).toBeVisible();
    const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeGreaterThan(0);
  });

  test("By-label dimension: label-key selector + per-column filter + pagination + resizable container", async ({
    page,
  }) => {
    await page.goto("/ops/costs");
    await page.getByRole("button", { name: "By label", exact: true }).click();
    const table = page.getByTestId("cost-breakdown-table");
    await expect(table).toBeVisible();

    // The label-key sub-selector shows only for this dimension (purpose/category/venue/asset_group).
    await expect(page.getByRole("button", { name: "category", exact: true })).toBeVisible();
    await expect(table).toContainText("manifest-consolidator");

    // Pagination: the mock label set is >100 rows, so a pager renders and Next advances the page.
    const pager = page.getByTestId("cost-breakdown-pagination");
    await expect(pager).toContainText("1 / 2");
    const rows = table.locator("tbody tr");
    const firstRowP1 = await rows.first().innerText();
    await page.getByTestId("cost-breakdown-next").click();
    await expect(pager).toContainText("2 / 2");
    expect(await rows.first().innerText()).not.toEqual(firstRowP1);

    // Per-column filter: each categorical column header carries a dropdown of the DISTINCT values
    // present in the cached rows (dynamic). Selecting one narrows client-side to matching rows.
    const labelFilter = page.getByTestId("cost-breakdown-colfilter-label");
    await expect(labelFilter).toBeVisible();
    await labelFilter.selectOption("manifest-consolidator");
    await expect(rows).toHaveCount(1);
    await expect(table).toContainText("manifest-consolidator");
    // Clearing restores the full (paginated) set.
    await page.getByTestId("cost-breakdown-clear-filters").click();
    await expect(pager).toContainText("1 / 2");

    // The breakdown container is user-resizable (resize-y drag handle at the bottom edge).
    await expect(page.getByTestId("cost-breakdown-scroll")).toHaveClass(/resize-y/);
  });

  test("help guide: opens from the top bar, carries the moved provisional note, closes on Escape", async ({ page }) => {
    await page.goto("/ops/costs");
    await expect(page.getByTestId("cost-breakdown-table")).toBeVisible();

    await page.getByTestId("cost-help-button").click();
    await expect(page.getByText(/quick guide/i)).toBeVisible();
    await expect(page.getByText(/What you actually pay/i)).toBeVisible();
    // The provisional note is no longer a standing page banner — it lives in the guide now.
    await expect(page.getByText(/Recent days are provisional/i)).toBeVisible();
    await expect(page.getByText(/The breakdown table/i)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText(/quick guide/i)).toHaveCount(0);
  });

  // --- date range (pw:L2) ----------------------------------------------------
  // The window control is presets + an always-visible explicit range. Plan:
  // unified-trading-pm/plans/active/cost_observability_ui_2026_07_08.md (date-range follow-up).

  test("shows the date range up front, populated from the window the API resolved", async ({ page }) => {
    await page.goto("/ops/costs");
    await expect(page.getByTestId("cost-total")).toBeVisible();

    // No "Custom" mode to enter — the range is the window, always on screen.
    await expect(page.getByTestId("cost-date-range")).toBeVisible();
    await expect(page.getByRole("button", { name: "Custom" })).toHaveCount(0);

    // Seeded from the API's ECHOED bounds, so the dates describe the numbers beside them.
    const start = page.getByTestId("cost-range-start");
    const end = page.getByTestId("cost-range-end");
    await expect(start).not.toHaveValue("");
    await expect(end).not.toHaveValue("");
    await expect(page.getByText(/last 30 days/i)).toBeVisible();
  });

  test("a preset repopulates the date range with its resolved window", async ({ page }) => {
    await page.goto("/ops/costs");
    await expect(page.getByTestId("cost-total")).toBeVisible();
    const startBefore = await page.getByTestId("cost-range-start").inputValue();

    await page.getByRole("button", { name: "7d" }).click();

    // The dates must MOVE with the preset — a control whose fields don't track the selection is
    // exactly the "looks filtered but isn't" failure this page can't afford.
    await expect(page.getByText(/last 7 days/i)).toBeVisible();
    await expect(page.getByTestId("cost-range-start")).not.toHaveValue(startBefore);
    await expect(page.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
  });

  test("hand-picking a window refilters the page and deselects every preset", async ({ page }) => {
    await page.goto("/ops/costs");
    await expect(page.getByTestId("cost-total")).toBeVisible();
    await expect(page.getByRole("button", { name: "30d" })).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("cost-range-start").fill("2026-06-01");
    await page.getByTestId("cost-range-end").fill("2026-06-10");

    // 1-10 June is a real 10-day window; the KPI band must say so...
    await expect(page.getByText(/last 10 days/i)).toBeVisible();
    // ...and no preset may stay lit, since none of them describes this window.
    for (const label of ["7d", "30d", "90d"]) {
      await expect(page.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
    }
  });

  test("bounds the date inputs so an inverted range is unreachable", async ({ page }) => {
    await page.goto("/ops/costs");
    await expect(page.getByTestId("cost-total")).toBeVisible();

    // The API 400s an inverted range; the control cannot express one in the first place.
    const start = page.getByTestId("cost-range-start");
    const end = page.getByTestId("cost-range-end");
    await expect(start).toHaveAttribute("max", await end.inputValue());
    await expect(end).toHaveAttribute("min", await start.inputValue());
  });

  test("a stale slower window never clobbers a fresher one after a rapid date edit", async ({ page }) => {
    // Regression, found by driving the LIVE page (the mocked unit tests couldn't see it): editing
    // two date fields issues two windows a moment apart, and a real cost window is a ~10s cache
    // miss, so the earlier request routinely resolves LAST. `loadBreakdown` already guarded this;
    // `loadCore` did not, and the KPI band rendered one window behind its own dates.
    await page.addInitScript(() => {
      (window as typeof window & { __mockSummaryDelayMs?: Record<string, number> }).__mockSummaryDelayMs = {
        "2026-06-01:2026-06-10": 1500, // the 10-day window resolves LATE
      };
    });
    await page.goto("/ops/costs");
    await expect(page.getByTestId("cost-total")).toBeVisible();

    await page.getByTestId("cost-range-start").fill("2026-06-01");
    await page.getByTestId("cost-range-end").fill("2026-06-10"); // slow: 10 days
    await page.getByTestId("cost-range-start").fill("2026-06-02"); // fast: 9 days, supersedes it

    await expect(page.getByText(/last 9 days/i)).toBeVisible();
    // Let the superseded 10-day response land — it must be dropped, not painted over the fresher
    // window the operator is actually looking at.
    await page.waitForTimeout(2500);
    await expect(page.getByText(/last 9 days/i)).toBeVisible();
    await expect(page.getByText(/last 10 days/i)).toHaveCount(0);
    await expect(page.getByTestId("cost-range-start")).toHaveValue("2026-06-02");
  });
});
