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

// Axis-ordered drilldown fixture for CEFI. The mock returns children for the
// NEXT axis given the pinned (contiguous-prefix) filters in the query, so the
// test exercises REAL narrowing (BINANCE → only book_snapshot_5/trades, etc.),
// not the old static cross-product.
const DRILLDOWN_AXES = ["venue", "data_type", "instrument_type", "date"];

// children[depth] = the value set for axes[depth], keyed by the parent value at
// the previous axis. A single value per venue proves the narrowing (the column
// would otherwise show the full union).
function drilldownNode(
  axis: string,
  value: string,
  rowKey: Record<string, string>,
  completion: number,
) {
  const captured = Math.round(completion);
  return {
    axis,
    value,
    captured,
    empty_confirmed: 2,
    attempted_failed: 0,
    total: captured + 2,
    completion_pct: completion,
    row_key: rowKey,
    children: [],
    is_leaf: axis === "date",
  };
}

function drilldownTreeFor(filters: Record<string, string>) {
  const depth = DRILLDOWN_AXES.filter(
    (a) => filters[a] != null && filters[a] !== "",
  ).length;
  const axis = DRILLDOWN_AXES[depth];
  if (axis === "venue") {
    return ["BINANCE", "BYBIT"].map((v) =>
      drilldownNode("venue", v, { venue: v }, v === "BINANCE" ? 95 : 80),
    );
  }
  if (axis === "data_type") {
    // BINANCE narrows to a SINGLE real data_type — proves co-occurrence.
    const dt = filters.venue === "BINANCE" ? "book_snapshot_5" : "trades";
    return [
      drilldownNode(
        "data_type",
        dt,
        { venue: filters.venue, data_type: dt },
        90,
      ),
    ];
  }
  if (axis === "instrument_type") {
    return [
      drilldownNode(
        "instrument_type",
        "perpetual",
        {
          venue: filters.venue,
          data_type: filters.data_type,
          instrument_type: "perpetual",
        },
        88,
      ),
    ];
  }
  if (axis === "date") {
    // Non-zero per-date completion — proves the date column is real, not 0%.
    return ["2026-05-10", "2026-05-11"].map((d, i) =>
      drilldownNode(
        "date",
        d,
        {
          venue: filters.venue,
          data_type: filters.data_type,
          instrument_type: filters.instrument_type,
          date: d,
        },
        i === 0 ? 100 : 75,
      ),
    );
  }
  return [];
}

function drilldownResponse(url: URL) {
  const filters: Record<string, string> = {};
  for (const a of DRILLDOWN_AXES) {
    const v = url.searchParams.get(a);
    if (v != null) filters[a] = v;
  }
  const tree = drilldownTreeFor(filters);
  const captured = tree.reduce((s, n) => s + n.captured, 0);
  const total = tree.reduce((s, n) => s + n.total, 0);
  return {
    service: SERVICE,
    asset_group: "cefi",
    axes: DRILLDOWN_AXES,
    tree,
    totals: {
      captured,
      empty_confirmed: 5,
      attempted_failed: 0,
      total: total || 105,
      completion_pct: 92.5,
    },
    filtered_by: filters,
    manifest_uri:
      "gs://market-data-tick-cefi-prd/_index/availability_index.parquet",
    reason_summary: {
      captured: 270,
      empty_calendar: 12,
      fail_not_found: 60,
      fail_auth: 4,
    },
    total_top_axis_children: tree.length,
    child_offset: 0,
    child_limit: 500,
  };
}

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

  await page.route("**/api/data-status/drilldown/**", (route) => {
    const url = new URL(route.request().url());
    route.fulfill({ json: drilldownResponse(url) });
  });

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
    // CEFI is the default-pinned asset_group; pin a venue to expose the leaf
    // actions. Scope clicks to the columns grid so we don't hit the AG tiles
    // above (which open the drawer).
    const cols = page.locator(".cols-wrap");
    await cols.getByText("BINANCE", { exact: true }).first().click();

    // The Download button is present in the detail leaf-action row. It is
    // DISABLED until a date is pinned (no fabricated tuple → no 404).
    const download = page
      .locator(".cols-col-detail")
      .getByRole("button", { name: "Download", exact: true });
    await expect(download).toBeVisible();
    await expect.poll(async () => download.isEnabled()).toBe(false);
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  });

  test("Columns: pinning a venue narrows the data_type column to its real co-occurring values (not the union)", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await setupMocks(page);
    await gotoDataStatus(page);

    await page.getByRole("button", { name: "Columns" }).click();
    const cols = page.locator(".cols-wrap");
    await cols.getByText("BINANCE", { exact: true }).first().click();

    // The data_type column now shows ONLY BINANCE's co-occurring data_type
    // (book_snapshot_5 from the mock) — real narrowing, not the static union.
    await expect(
      cols.getByText("book_snapshot_5", { exact: true }).first(),
    ).toBeVisible();
    // `trades` is BYBIT's data_type in the mock — it must NOT appear under
    // BINANCE (proves the old cross-product union is gone).
    await expect(cols.getByText("trades", { exact: true })).toHaveCount(0);
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  });

  test("Columns: the date column shows non-zero per-date coverage (fixes the always-0% bug)", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await setupMocks(page);
    await gotoDataStatus(page);

    await page.getByRole("button", { name: "Columns" }).click();
    const cols = page.locator(".cols-wrap");
    await cols.getByText("BINANCE", { exact: true }).first().click();
    await cols.getByText("book_snapshot_5", { exact: true }).first().click();
    await cols.getByText("perpetual", { exact: true }).first().click();

    // The date column renders real dates (formatted "10 May 2026") with a
    // non-zero coverage % (100% for the first mocked date) — NOT 0%.
    const dateRow = cols
      .locator(".cols-row-date")
      .filter({ hasText: "10 May 2026" })
      .first();
    await expect(dateRow).toBeVisible();
    await expect(dateRow).toContainText("100%");
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

  test("Columns Download is disabled until a leaf (venue+date) is pinned, then builds a URL with the pinned tuple", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await setupMocks(page);
    await gotoDataStatus(page);

    await page.getByRole("button", { name: "Columns" }).click();
    const cols = page.locator(".cols-wrap");

    const download = page
      .locator(".cols-col-detail")
      .getByRole("button", { name: "Download", exact: true });
    await expect(download).toBeVisible();
    // No venue/date yet → disabled (guarantees we never target a phantom shard).
    await expect.poll(async () => download.isEnabled()).toBe(false);

    // Walk the cascade: venue → data_type → instrument_type → date.
    await cols.getByText("BINANCE", { exact: true }).first().click();
    await cols.getByText("book_snapshot_5", { exact: true }).first().click();
    await cols.getByText("perpetual", { exact: true }).first().click();
    await cols.getByText("10 May 2026", { exact: true }).first().click();

    // With the full leaf pinned, Download is enabled and opens a CSV URL that
    // carries the pinned tuple (taken from the leaf node's row_key).
    await expect.poll(async () => download.isEnabled()).toBe(true);

    const popupPromise = page.waitForEvent("popup");
    await download.click();
    const popup = await popupPromise;
    const url = popup.url();
    expect(url).toContain("/data-status/download-csv");
    expect(url).toContain("venue=BINANCE");
    expect(url).toContain("day=2026-05-10");
    expect(url).toContain("data_type=book_snapshot_5");
    expect(url).toContain("instrument_type=perpetual");
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  });
});
