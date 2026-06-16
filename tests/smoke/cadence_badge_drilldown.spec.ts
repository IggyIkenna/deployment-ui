/**
 * Regression guard — M8 cadence badge in HierarchicalShardDrilldown.
 *
 * The deployment-api data-status union threads a `cadence` observability axis
 * (UAC `Cadence` StrEnum: one_off_backfill / t1_daily / scheduled_recurring /
 * continuous_live / recovery_replay) through each per-(pipeline_mode, source)
 * provenance row, parallel to `transport`. The HierarchicalShardDrilldown must
 * render a human-readable cadence badge mirroring the transport badge, and be
 * blank-safe when cadence is absent.
 *
 * This spec asserts the cadence badge renders against the BUILT-IN mock fixture
 * (mock-api.ts `/api/data-status/drilldown/...` handler), which the app reads in
 * FRONTEND MOCK MODE (`VITE_MOCK_API=true`). Navigates to the canonical
 * `/service/{name}/data-status` URL so the DataStatusTab + drilldown mount.
 *
 * Companion unit-level guard (blank-safe absence + human-readable mapping):
 *   src/components/HierarchicalShardDrilldown.test.tsx — the two "M8:" tests.
 *
 * Plan: pipeline_mode_source_batch_live_replay_standardisation_2026_06_05.md
 *   § "M8 cadence observability axis — data-status drilldown" GATE-0 M5c [UI]
 */

import { expect, test } from "@playwright/test";

const DATA_STATUS_URL = "/service/market-tick-data-service/data-status";

test.describe("M8 cadence badge — HierarchicalShardDrilldown", () => {
  test("renders the data-status drilldown without a JS crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(DATA_STATUS_URL);
    await page.waitForLoadState("networkidle");

    expect(errors).toEqual([]);
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("renders a human-readable cadence badge on each provenance row", async ({ page }) => {
    await page.goto(DATA_STATUS_URL);
    await page.waitForLoadState("networkidle");

    // The drilldown lives inside a collapsed <details>; expand the first one so
    // the provenance rows (and their cadence badges) are visible. The badges are
    // present in the DOM regardless, but expanding mirrors the operator flow.
    const drillSummary = page.getByText("Hierarchical drill-down (shard atom)").first();
    if (await drillSummary.count()) {
      await drillSummary.click();
    }

    // The mock drilldown leaf carries two provenance rows: a batch row with
    // cadence=one_off_backfill ("One-off backfill") and a live row with
    // cadence=continuous_live ("Continuous (live)"). Both render a badge with
    // the human-readable label, and the raw enum is preserved on data-cadence.
    const cadenceBadges = page.locator(".provenance-cadence");
    await expect.poll(async () => cadenceBadges.count()).toBeGreaterThan(0);

    await expect(page.locator('.provenance-cadence[data-cadence="one_off_backfill"]').first()).toHaveText(
      "One-off backfill",
    );
    await expect(page.locator('.provenance-cadence[data-cadence="continuous_live"]').first()).toHaveText(
      "Continuous (live)",
    );

    // The badge must NOT show the raw enum value verbatim (would mean the
    // human-readable mapping regressed).
    await expect(page.getByText("one_off_backfill", { exact: true })).toHaveCount(0);
  });
});
