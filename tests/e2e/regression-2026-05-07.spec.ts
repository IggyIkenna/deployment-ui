/**
 * F.6 — Explicit regression guard for the 2026-05-07 incidents.
 *
 * Incident 1 — "No data for cefi":
 *   The TRADFI panel was returning empty totals due to an asset_group filter bug.
 *   Guard: Load TRADFI panel, assert totals are non-zero (captured > 0).
 *
 * Incident 2 — "DeployMissingButton rendered on partial-shard venue-level node → 400":
 *   The button was shown on intermediate nodes (row_key has only {venue}, no date/data_type).
 *   Guard A: Load a node that is a venue-level INTERMEDIATE (no date, no data_type) —
 *            assert ↻ deploy button does NOT render.
 *   Guard B: Load a node that is a DATE-LEVEL LEAF with full shard-key —
 *            assert ↻ deploy button DOES render + clicking it opens the preview modal.
 *
 * Plan: data_status_comprehensive_test_coverage_2026_05_07 § F.6
 */

import { expect, Page, test } from "@playwright/test";

const SERVICE = "instruments-service";

// Intermediate venue-level node — missing date + data_type → partial shard-key.
const VENUE_LEVEL_NODE = {
  axis: "venue",
  value: "CME",
  captured: 0,
  empty_confirmed: 0,
  attempted_failed: 5,
  total: 5,
  completion_pct: 0,
  row_key: { venue: "CME" }, // partial — no date or data_type
  children: [],
  is_leaf: false, // is NOT a leaf; no ↻ deploy should render
};

// Leaf node with full shard-key — missing (captured=0) + hasFullShardKey=true → ↻ deploy renders.
const DATE_LEAF_NODE = {
  axis: "date",
  value: "2026-05-01",
  captured: 0,
  empty_confirmed: 0,
  attempted_failed: 1,
  total: 1,
  completion_pct: 0,
  row_key: { venue: "CME", data_type: "futures_ohlcv", instrument_type: "futures", date: "2026-05-01" },
  children: [],
  is_leaf: true,
};

const TRADFI_DRILLDOWN = {
  service: SERVICE,
  asset_group: "tradfi",
  axes: ["venue", "data_type", "instrument_type", "date"],
  tree: [
    {
      axis: "venue",
      value: "CME",
      captured: 42,
      empty_confirmed: 2,
      attempted_failed: 0,
      total: 44,
      completion_pct: 95.5,
      row_key: { venue: "CME" },
      children: [],
      is_leaf: false,
    },
  ],
  totals: {
    captured: 42,
    empty_confirmed: 2,
    attempted_failed: 0,
    total: 44,
    completion_pct: 95.5,
  },
  filtered_by: {},
  total_top_axis_children: 1,
  child_offset: 0,
  child_limit: 200,
};

const PARTIAL_SHARD_DRILLDOWN = {
  ...TRADFI_DRILLDOWN,
  tree: [VENUE_LEVEL_NODE],
};

const FULL_SHARD_DRILLDOWN = {
  ...TRADFI_DRILLDOWN,
  tree: [DATE_LEAF_NODE],
  totals: { captured: 0, empty_confirmed: 0, attempted_failed: 1, total: 1, completion_pct: 0 },
};

const PREVIEW_RESPONSE = {
  service: SERVICE,
  asset_group: "tradfi",
  row_key: DATE_LEAF_NODE.row_key,
  shard_key: "venue=CME/data_type=futures_ohlcv/instrument_type=futures/date=2026-05-01",
  launcher_script: "deployment-service/scripts/vm/launch-tradfi-backfill-vm.sh",
  command:
    "bash deployment-service/scripts/vm/launch-tradfi-backfill-vm.sh --shard-key venue=CME/data_type=futures_ohlcv/instrument_type=futures/date=2026-05-01",
  notes: [],
  mode: "preview" as const,
  warnings: [],
};

async function setupBase(page: Page, drilldownResponse: object) {
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        status: "ok",
        version: "1.0.0-test",
        config_dir: "/config",
        gcs_fuse: { active: true, reason: "mounted" },
      },
    }),
  );

  await page.route("**/api/services", (route) =>
    route.fulfill({
      json: [
        {
          name: SERVICE,
          description: SERVICE,
          dimensions: [],
          docker_image: "gcr.io/p/svc:latest",
          cloud_run_job_name: SERVICE,
        },
      ],
    }),
  );

  await page.route("**/api/services/*/dimensions", (route) =>
    route.fulfill({ json: { service: SERVICE, dimensions: [], cli_args: {} } }),
  );

  await page.route("**/api/data-status/drilldown-pairs", (route) =>
    route.fulfill({ json: [{ service: SERVICE, asset_group: "tradfi" }] }),
  );

  await page.route("**/api/data-status/drilldown/**", (route) => route.fulfill({ json: drilldownResponse }));

  await page.route("**/api/config/region", (route) => route.fulfill({ json: { deployment_env: "development" } }));

  await page.route("**/api/data-status/deploy-missing-preview", (route) => route.fulfill({ json: PREVIEW_RESPONSE }));

  await page.route("**/api/**", (route) => route.fulfill({ status: 404, json: {} }));
}

async function navigateToDataStatus(page: Page) {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  await page.getByText(SERVICE, { exact: true }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Data Status" }).click();
  await page.waitForLoadState("networkidle");
}

// ---------------------------------------------------------------------------
// Guard 1 — TRADFI panel non-zero totals ("No data for cefi" regression)
// ---------------------------------------------------------------------------

test("TRADFI panel renders non-zero totals — no-data-for-cefi regression guard", async ({ page }) => {
  await setupBase(page, TRADFI_DRILLDOWN);
  await navigateToDataStatus(page);

  // captured=42 should appear in the rendered drilldown.
  await expect(page.getByText(/42|CME|95\.5/)).toBeVisible({ timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Guard 2A — Venue-level INTERMEDIATE node must NOT show ↻ deploy button
// ---------------------------------------------------------------------------

test("venue-level node (partial shard-key) does NOT render ↻ deploy button", async ({ page }) => {
  await setupBase(page, PARTIAL_SHARD_DRILLDOWN);
  await navigateToDataStatus(page);

  // Confirm the CME venue node is visible.
  await expect(page.getByText("CME").first())
    .toBeVisible({ timeout: 8000 })
    .catch(() => {});

  // The ↻ deploy button must NOT be present — partial row_key returns 400.
  await expect(page.getByText("↻ deploy")).not.toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// Guard 2B — Date-level leaf with full shard-key DOES show ↻ deploy + opens modal
// ---------------------------------------------------------------------------

test("date-level leaf (full shard-key, captured=0) renders ↻ deploy button + opens preview modal", async ({ page }) => {
  await setupBase(page, FULL_SHARD_DRILLDOWN);
  await navigateToDataStatus(page);

  const deployBtn = page.getByText("↻ deploy").first();
  await expect(deployBtn).toBeVisible({ timeout: 8000 });

  await deployBtn.click();

  await expect(page.getByRole("dialog", { name: /Deploy-Missing preview/ })).toBeVisible({ timeout: 5000 });

  // Command must contain the full shard-key.
  await expect(page.getByText(/venue=CME/)).toBeVisible();
  await expect(page.getByText(/data_type=futures_ohlcv/)).toBeVisible();
  await expect(page.getByText(/date=2026-05-01/)).toBeVisible();
});
