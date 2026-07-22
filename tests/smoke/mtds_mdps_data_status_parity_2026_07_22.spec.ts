/**
 * Regression spec — MTDS/MDPS vs instruments-service `DataStatusTab.tsx`
 * parity confirmation pass (plans/active/mtds_data_status_page_parity_2026_07_21.md
 * final `[UI]` todo, executed 2026-07-22).
 *
 * This pass live-verified (dev server + Playwright MCP, VITE_MOCK_API=true)
 * across all three services that share `DataStatusTab.tsx`
 * (instruments-service / market-tick-data-service /
 * market-data-processing-service) and found the "parity" claim from earlier
 * todos in this plan is TRUE for two of the three surfaces and FALSE for the
 * third:
 *
 *  - Symbol search box + click-through (universal search bar,
 *    `afe3262`/`319a32e`): genuinely at parity — renders and click-through
 *    resolves an availability panel on all three services. Previously only
 *    covered by `symbol_search_clickthrough.spec.ts` for
 *    market-tick-data-service; this spec extends the same assertion to
 *    instruments-service and market-data-processing-service.
 *  - Coverage grid (Honest Coverage / Instrument Coverage Summary / "Data
 *    Coverage" TURBO panel / asset-group breakdown): structurally
 *    consistent across all three services — same shared component, same
 *    render tree.
 *  - MVP toggle: **NOT at parity — a real, confirmed gap**, distinct from
 *    (and not fixed by) this session's earlier "Wire UAC is_mvp into MTDS
 *    coverage" / "/turbo scope gap" todos (`deployment-api@724910e`,
 *    `@511084b`). Those shipped a `scope` query param on the
 *    *backend* `/manifest` and `/turbo` routes, but NEITHER of
 *    `deployment-ui`'s frontend callers (`getDataStatusManifest`,
 *    `getDataStatusTurbo` in `src/api/client.ts`) ever sends a `scope`
 *    param — confirmed by reading both function bodies in full: neither
 *    the params interface nor the `URLSearchParams` construction mentions
 *    `scope` anywhere. The shipped backend wiring has ZERO UI-reachable
 *    consumer on the shared coverage grid, for any of the three services.
 *
 *    The only MVP-scope-aware UI elements that exist today are three
 *    narrower, pre-existing affordances, each hitting its OWN endpoint
 *    (not `/manifest` or `/turbo`), and each gated to a DIFFERENT subset
 *    of services:
 *      1. `VenueCoverageTable`'s "MVP / Could exist / All" pill toggle
 *         (`getVenueYearCoverage` -> `/data-status/venue-year-coverage`) —
 *         rendered on a SEPARATE "Venue Coverage" tab that `App.tsx` gates
 *         to `selectedService === "market-tick-data-service"` ONLY. Absent
 *         for instruments-service AND market-data-processing-service.
 *      2. `CatalogueExplorer`'s "MVP only" checkbox
 *         (`data-testid="catalogue-explorer-mvp-toggle"`, ->
 *         `/data-status/catalogue`) — `CatalogueExplorer` itself is
 *         rendered only when `serviceName === "instruments-service"`
 *         (`DataStatusTab.tsx`). Absent for market-tick-data-service AND
 *         market-data-processing-service.
 *      3. The per-shard drill-down modal's "MVP only" checkbox
 *         (`InstrumentsModalStandard` in `DataStatusDrilldown.tsx`, ->
 *         `fetchInstrumentsForShard` `mvp_only` param) — genuinely shared
 *         via `HierarchicalShardDrilldown`, but it is a per-shard-cell
 *         modal, not a page-level coverage-grid toggle, and does not
 *         narrow the headline "Data Coverage" / "Honest Coverage" numbers.
 *
 *    Net effect: market-data-processing-service has ZERO MVP-scope UI
 *    affordance of any kind today (confirmed: zero occurrences of "MVP"
 *    anywhere on its `/data-status` page in this spec's fixtures).
 *    instruments-service and market-tick-data-service each have exactly
 *    ONE, but they are two DIFFERENT, non-interchangeable affordances,
 *    neither of which scopes the shared "Data Coverage" TURBO panel that
 *    this plan's Bug C fix and MVP-wiring todos were about.
 *
 * This spec locks in the CURRENT state (both the working parity and the
 * confirmed gap) so a future change doesn't silently regress the working
 * parts, and so the gap doesn't silently disappear from view. See the new
 * plan todo (`mtds_data_status_page_parity_2026_07_21.md`) for the
 * follow-up to actually wire `scope` through `getDataStatusManifest`/
 * `getDataStatusTurbo` and surface a page-level MVP toggle consistently.
 */

import { expect, test } from "@playwright/test";

// This repo's webServer (playwright.config.ts) runs with VITE_MOCK_API=true —
// the app's own client-side mock layer (src/lib/mock-api.ts) already serves
// realistic data for every service, so no manual page.route() interception
// is needed (or wanted — it would shadow the app's own mock responses).

const SERVICES = ["instruments-service", "market-tick-data-service", "market-data-processing-service"] as const;

test.describe("DataStatusTab cross-service parity — symbol search + coverage grid (PASS)", () => {
  for (const service of SERVICES) {
    test(`${service}: symbol search renders and click-through resolves an availability panel`, async ({ page }) => {
      await page.goto(`/service/${service}/data-status`);
      await page.waitForLoadState("networkidle");

      const searchInput = page.getByTestId("symbol-search-input");
      await searchInput.waitFor({ timeout: 10000 });
      await searchInput.fill("BTC");

      const results = page.getByTestId("symbol-search-result");
      await expect(results.first()).toBeVisible({ timeout: 10000 });

      const cefiResult = results.filter({ hasText: "CEFI" }).first();
      await expect(cefiResult).toBeVisible();
      await cefiResult.click();

      const instrumentPanel = page.getByTestId("symbol-search-instrument-panel");
      await expect(instrumentPanel).toBeVisible({ timeout: 10000 });
      await expect(instrumentPanel).toContainText("Overall Availability");
    });

    test(`${service}: coverage grid ("Data Coverage" TURBO panel) renders`, async ({ page }) => {
      await page.goto(`/service/${service}/data-status`);
      await page.waitForLoadState("networkidle");

      await expect(page.getByText("Data Coverage").first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/\d+ \/ \d+ shards/).first()).toBeVisible({ timeout: 10000 });
    });
  }
});

test.describe("DataStatusTab cross-service parity — MVP toggle (CONFIRMED GAP, not fixed by this spec)", () => {
  test("instruments-service: MVP toggle exists ONLY inside Catalogue Explorer, not on the coverage grid", async ({
    page,
  }) => {
    await page.goto("/service/instruments-service/data-status");
    await page.waitForLoadState("networkidle");

    // Catalogue Explorer's own "MVP only" checkbox — IS-only affordance.
    await expect(page.getByTestId("catalogue-explorer-mvp-toggle")).toBeVisible({ timeout: 10000 });

    // No "Venue Coverage" tab (MTDS-only) and no scope pill on this page.
    await expect(page.getByTestId("venue-coverage-tab-trigger")).toHaveCount(0);
    await expect(page.getByTestId("coverage-scope-toggle")).toHaveCount(0);
  });

  test("market-tick-data-service: MVP toggle exists ONLY on the separate Venue Coverage tab, not Catalogue Explorer", async ({
    page,
  }) => {
    await page.goto("/service/market-tick-data-service/data-status");
    await page.waitForLoadState("networkidle");

    // No Catalogue Explorer MVP checkbox on MTDS's Data Status tab.
    await expect(page.getByTestId("catalogue-explorer-mvp-toggle")).toHaveCount(0);

    // The Venue Coverage tab exists and its scope pill is MVP/Could
    // exist/All — but it's a SEPARATE tab from Data Status, hitting a
    // separate endpoint, not a toggle on the coverage grid itself.
    const venueCoverageTab = page.getByTestId("venue-coverage-tab-trigger");
    await expect(venueCoverageTab).toBeVisible();
    await venueCoverageTab.click();
    await expect(page.getByTestId("coverage-scope-toggle")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("scope-toggle-mvp")).toBeVisible();
  });

  test("market-data-processing-service: NO MVP-scope UI affordance exists anywhere on the page (confirmed gap)", async ({
    page,
  }) => {
    await page.goto("/service/market-data-processing-service/data-status");
    await page.waitForLoadState("networkidle");

    // Neither of the two per-service MVP affordances is reachable here.
    await expect(page.getByTestId("catalogue-explorer-mvp-toggle")).toHaveCount(0);
    await expect(page.getByTestId("venue-coverage-tab-trigger")).toHaveCount(0);
    await expect(page.getByTestId("coverage-scope-toggle")).toHaveCount(0);

    // Nor does literal "MVP" text appear anywhere on the page — this is a
    // documented, real gap (see the spec-file docstring above), not a
    // missing test selector. If this assertion ever fails because MDPS
    // gained an MVP affordance, update this spec's docstring + the PASS
    // block above rather than just deleting the assertion.
    await expect(page.getByText("MVP", { exact: true })).toHaveCount(0);
  });
});
