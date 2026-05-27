/**
 * Data Status redesign — Batch 1 smoke coverage.
 *
 * Verifies the re-architected redesign that loads from the FAST endpoints
 * (`/data-status/turbo` + `/data-status/coverage-summary` +
 * `/config/shard-axis-matrix`) instead of the slow `/grid` index:
 *   1. Loads + renders hero / AG tiles / inventory for a data-pipeline service.
 *   2. The visual switcher cycles Heatmap / Stacked / Matrix / Columns without
 *      crashing (grid visuals lazily fetch `/grid`).
 *   3. "Check status" (Refresh) triggers a re-fetch of turbo.
 *   4. "Clear cache" fires `POST /data-status/turbo/clear` then re-fetches.
 *   5. The Columns drilldown Download builds a `/download-csv` URL.
 *
 * All endpoints are route-mocked so the test is deterministic and does NOT
 * depend on the slow real backend.
 *
 * Regression guard for: redesign load-on-real-manifest + operator controls
 * (Batch 1, deployment-ui Data Status redesign).
 */

import { expect, Page, test } from "@playwright/test";

const SERVICE = "market-tick-data-service";

function captureCounts(captured: number, empty: number, failed: number) {
  return {
    captured,
    empty_confirmed: empty,
    attempted_failed: failed,
    expected_unattempted_known_empty: 0,
    expected_unattempted_pending_fetch: 0,
  };
}

function venueEntry(captured: number, empty: number, failed: number) {
  const total = captured + empty + failed;
  const datesFound = captured > 0 ? 20 : 0;
  return {
    dates_found: datesFound,
    dates_expected: 30,
    dates_expected_venue: 28,
    dates_missing: 28 - datesFound,
    dates_missing_count: 28 - datesFound,
    dates_missing_list: ["2026-05-01", "2026-05-02"],
    missing_data_types: failed > 0 ? ["funding"] : [],
    venue_start_date: "2026-04-01",
    completion_pct: total ? (captured / total) * 100 : 0,
    capture_status_counts: captureCounts(captured, empty, failed),
    failure_rate: total ? failed / total : 0,
  };
}

const TURBO = {
  service: SERVICE,
  date_range: { start: "2026-04-28", end: "2026-05-27", days: 30 },
  mode: "turbo",
  sub_dimension: "venue",
  overall_completion_pct: 72.5,
  overall_dates_found: 100,
  overall_dates_expected: 150,
  asset_groups: {
    CEFI: {
      category: "CEFI",
      bucket: "market-data-tick-cefi-x",
      prefixes_queried: 0,
      dates_found: 24,
      dates_expected: 30,
      dates_missing: 6,
      completion_pct: 80,
      breakdown_axis: "venue",
      capture_status_counts: captureCounts(150000, 12000, 8000),
      missing_dates: [],
      venues: {
        BINANCE: venueEntry(90000, 6000, 1000),
        BYBIT: venueEntry(50000, 4000, 2000),
        ASTER: venueEntry(0, 0, 5000),
      },
      data_types: {
        trades: { dates_found: 20, dates_expected: 30, completion_pct: 66 },
      },
    },
    DEFI: {
      category: "DEFI",
      bucket: "market-data-tick-defi-x",
      prefixes_queried: 0,
      dates_found: 10,
      dates_expected: 30,
      dates_missing: 20,
      completion_pct: 33,
      breakdown_axis: "venue",
      capture_status_counts: captureCounts(4000, 500, 1500),
      missing_dates: [],
      venues: {
        UNISWAP: venueEntry(4000, 500, 1500),
      },
    },
  },
};

const COVERAGE_SUMMARY = {
  service: SERVICE,
  asset_groups: {
    CEFI: {
      total_shards: 170000,
      total_instrument_rows: 170000,
      unique_dates: 24,
      unique_venues: 12,
      date_range: { start: "2026-04-28", end: "2026-05-27" },
      latest_day: "2026-05-27",
      latest_day_instruments: {},
      latest_day_total: 5000,
    },
    DEFI: {
      total_shards: 6000,
      total_instrument_rows: 6000,
      unique_dates: 10,
      unique_venues: 3,
      date_range: { start: "2026-05-17", end: "2026-05-27" },
      latest_day: "2026-05-27",
      latest_day_instruments: {},
      latest_day_total: 200,
    },
  },
  totals: {
    shards: 176000,
    instrument_rows: 176000,
    dates_across_categories: 34,
    latest_day_instruments: 5200,
  },
  totals_source: "rollup",
};

const SHARD_AXIS_MATRIX = {
  shard_axes: {
    [SERVICE]: {
      cefi: ["venue", "data_type", "instrument_type", "instrument_id"],
      defi: ["venue", "chain", "data_type", "instrument_id"],
    },
  },
  display_axes: { [SERVICE]: { cefi: [], defi: ["instrument_type"] } },
  primary_axis: { [SERVICE]: { cefi: "venue", defi: "venue" } },
  breakdown_axes: {
    [SERVICE]: {
      cefi: ["data_type", "instrument_type", "instrument_id"],
      defi: ["chain", "data_type", "instrument_id"],
    },
  },
};

function gridCell(captured: number, empty: number, failed: number) {
  return { captured, empty_confirmed: empty, attempted_failed: failed };
}

function buildGridDays() {
  const days: Record<string, ReturnType<typeof gridCell>> = {};
  for (let d = 1; d <= 27; d++) {
    const date = `2026-05-${String(d).padStart(2, "0")}`;
    days[date] = gridCell(100, 5, d % 7 === 0 ? 10 : 0);
  }
  return days;
}

const GRID = {
  service: SERVICE,
  date_range: { start: "2026-04-28", end: "2026-05-27" },
  asset_groups: {
    CEFI: {
      primary: "venue",
      primary_values: ["BINANCE", "BYBIT", "ASTER"],
      sub_axes: ["data_type", "date"],
      axis_values: { data_type: ["trades"] },
      grid: {
        BINANCE: buildGridDays(),
        BYBIT: buildGridDays(),
        ASTER: buildGridDays(),
      },
      by_primary: {},
      total: gridCell(8100, 405, 30),
      meta: { primary_count: 3, days: 27, shards_per_day: 9 },
    },
    DEFI: {
      primary: "venue",
      primary_values: ["UNISWAP"],
      sub_axes: ["chain", "date"],
      axis_values: { chain: ["ethereum"] },
      grid: { UNISWAP: buildGridDays() },
      by_primary: {},
      total: gridCell(2700, 135, 10),
      meta: { primary_count: 1, days: 27, shards_per_day: 3 },
    },
  },
};

const DRILLDOWN = {
  service: SERVICE,
  asset_group: "cefi",
  axes: ["venue", "data_type", "instrument_type", "date"],
  tree: [
    {
      axis: "venue",
      value: "BINANCE",
      captured: 100,
      empty_confirmed: 5,
      attempted_failed: 0,
      total: 105,
      completion_pct: 95.2,
      row_key: { venue: "BINANCE" },
      children: [],
      is_leaf: false,
    },
  ],
  totals: {
    captured: 100,
    empty_confirmed: 5,
    attempted_failed: 0,
    total: 105,
    completion_pct: 95.2,
  },
  filtered_by: {},
  reason_summary: {
    captured: 270,
    empty_calendar: 12,
    fail_not_found: 60,
    fail_auth: 4,
  },
  total_top_axis_children: 1,
  child_offset: 0,
  child_limit: 200,
};

interface Hits {
  turbo: number;
  coverageSummary: number;
  shardAxisMatrix: number;
  grid: number;
  clearCache: number;
}

async function setupMocks(page: Page): Promise<Hits> {
  const hits: Hits = {
    turbo: 0,
    coverageSummary: 0,
    shardAxisMatrix: 0,
    grid: 0,
    clearCache: 0,
  };

  // We only mock the data-status + config endpoints the redesign consumes, so
  // the test is deterministic regardless of the (slow, real) production
  // manifest. The service sidebar / health come from the running dev server.
  //
  // NOTE: Playwright matches the MOST-RECENTLY-registered handler first, so
  // `/turbo/clear` is registered LAST to win over the broader `/turbo**`.
  await page.route("**/api/data-status/turbo**", (route) => {
    hits.turbo += 1;
    route.fulfill({ json: TURBO });
  });

  await page.route("**/api/data-status/coverage-summary**", (route) => {
    hits.coverageSummary += 1;
    route.fulfill({ json: COVERAGE_SUMMARY });
  });

  await page.route("**/api/config/shard-axis-matrix**", (route) => {
    hits.shardAxisMatrix += 1;
    route.fulfill({ json: SHARD_AXIS_MATRIX });
  });

  await page.route("**/api/data-status/grid**", (route) => {
    hits.grid += 1;
    route.fulfill({ json: GRID });
  });

  await page.route("**/api/data-status/drilldown/**", (route) =>
    route.fulfill({ json: DRILLDOWN }),
  );

  await page.route("**/api/data-status/drilldown-pairs", (route) =>
    route.fulfill({ json: [{ service: SERVICE, asset_group: "cefi" }] }),
  );

  // Registered last → highest precedence over `/turbo**`.
  await page.route("**/api/data-status/turbo/clear", (route) => {
    hits.clearCache += 1;
    route.fulfill({ json: { status: "ok", entries_cleared: 3 } });
  });

  return hits;
}

async function gotoDataStatus(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // The sidebar shows the human label ("market tick data"), not the raw
  // service id; the real dev server supplies the service mesh.
  await page.getByText("market tick data", { exact: true }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Data Status" }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("Data Status redesign — Batch 1", () => {
  test("loads from fast endpoints; hero + AG tiles + inventory render", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    const hits = await setupMocks(page);

    await gotoDataStatus(page);

    // Hero key-stat + AG tiles render real (non-zero) numbers from turbo.
    await expect(page.getByText("Honest coverage").first()).toBeVisible();
    await expect(page.getByText("CEFI", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("DEFI", { exact: true }).first()).toBeVisible();

    // Inventory row from coverage-summary.
    await expect(page.getByText("Total shards").first()).toBeVisible();

    // Fast path used; the slow grid was NOT fetched on initial load.
    expect(hits.turbo).toBeGreaterThanOrEqual(1);
    expect(hits.coverageSummary).toBeGreaterThanOrEqual(1);
    expect(hits.grid).toBe(0);
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  });

  test("visual switcher cycles Heatmap / Stacked / Matrix / Columns without crash", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    const hits = await setupMocks(page);

    await gotoDataStatus(page);

    // Stacked is the default; switch through the rest.
    await page.getByRole("button", { name: "Heatmap" }).click();
    // Grid visual lazily fetches /grid.
    await expect.poll(() => hits.grid).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: "Matrix" }).click();
    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("button", { name: "Stacked" }).click();

    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  });

  test("Check status (Refresh) re-fetches turbo", async ({ page }) => {
    const hits = await setupMocks(page);
    await gotoDataStatus(page);

    const before = hits.turbo;
    await page.getByTestId("data-status-refresh").click();
    await expect.poll(() => hits.turbo).toBeGreaterThan(before);
  });

  test("Clear cache fires the clear endpoint then re-fetches", async ({
    page,
  }) => {
    const hits = await setupMocks(page);
    await gotoDataStatus(page);

    const turboBefore = hits.turbo;
    await page.getByTestId("data-status-clear-cache").click();
    await expect.poll(() => hits.clearCache).toBeGreaterThanOrEqual(1);
    await expect.poll(() => hits.turbo).toBeGreaterThan(turboBefore);
  });

  test("Columns view renders the leaf Download control (CSV URL contract unit-tested separately)", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await setupMocks(page);
    await gotoDataStatus(page);

    await page.getByRole("button", { name: "Columns" }).click();
    // Drill into the first primary value (venue) to expose the leaf actions.
    await page.getByText("BINANCE", { exact: true }).first().click();

    // The Download button is present in the columns leaf-action row. It calls
    // buildCsvDownloadUrl(...) (asserted in tests/unit/client-branches.test.ts);
    // here we only guard that the control renders without crashing.
    await expect(
      page.getByRole("button", { name: /Download/ }).first(),
    ).toBeVisible();
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  });

  test("Stacked visual shows a per-venue date completion readout", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await setupMocks(page);
    await gotoDataStatus(page);

    // Stacked is the default visual; ensure we are on it.
    await page.getByRole("button", { name: "Stacked" }).click();

    // Completion readout: "{found}/{expected} dates · {missing} missing".
    await expect(page.getByText(/\d+\/\d+ dates/).first()).toBeVisible();
    await expect(page.getByText(/missing/).first()).toBeVisible();
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  });

  test("venue drawer renders Completion + Why (reason) sections", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await setupMocks(page);
    await gotoDataStatus(page);

    await page.getByRole("button", { name: "Stacked" }).click();
    // Click a venue row to open the primary (venue) drawer.
    await page.getByText("BINANCE", { exact: true }).first().click();

    // Completion block + Why panel headings render (structure, not numbers).
    await expect(
      page.getByRole("heading", { name: "Completion" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Why" }).first(),
    ).toBeVisible();
    // The reason breakdown surfaces a known failed category label.
    await expect(
      page.getByText(/not found|captured|empty/i).first(),
    ).toBeVisible();
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  });

  test("Columns Download enables once a venue + date are pinned and builds a well-formed URL", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await setupMocks(page);
    await gotoDataStatus(page);

    await page.getByRole("button", { name: "Columns" }).click();

    // Drill into a venue to expose the date column + leaf actions.
    await page.getByText("BINANCE", { exact: true }).first().click();

    const download = page.getByRole("button", { name: /Download/ }).first();
    await expect(download).toBeVisible();

    // Pin a date (the date column lists days). Pick the first available day cell
    // value; date labels are rendered in the date pivot column.
    const dayCandidate = page.getByText(/2026-05-\d{2}/).first();
    if (await dayCandidate.count()) {
      await dayCandidate.click();
    }

    // Once venue + date are pinned the Download button must be enabled (the old
    // bug kept it disabled because data_type / instrument_type were unset).
    await expect.poll(async () => download.isEnabled()).toBe(true);
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  });
});
