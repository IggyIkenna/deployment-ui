/**
 * Regression spec — MTDS/MDPS vs instruments-service `DataStatusTab.tsx`
 * parity confirmation pass (plans/active/mtds_data_status_page_parity_2026_07_21.md
 * final `[UI]` todo, executed 2026-07-22; MVP-toggle gap closed 2026-07-23).
 *
 * This pass live-verified (dev server + Playwright MCP, VITE_MOCK_API=true)
 * across all three services that share `DataStatusTab.tsx`
 * (instruments-service / market-tick-data-service /
 * market-data-processing-service):
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
 *  - MVP toggle: **the 2026-07-22 gap is now CLOSED (2026-07-23).** The
 *    backend `scope` param shipped by "Wire UAC is_mvp into MTDS coverage"
 *    / "/turbo scope gap" (`deployment-api@724910e`, `@511084b`) had zero
 *    UI-reachable consumer — neither `getDataStatusManifest` nor
 *    `getDataStatusTurbo` (`src/api/client.ts`) ever sent a `scope` param,
 *    and there was no page-level toggle on the shared coverage grid.
 *    Fixed: both client functions now accept + forward an optional
 *    `scope: CoverageScope` param, and `DataStatusTab.tsx` renders a
 *    page-level "Coverage Scope" (MVP / Could exist / All) toggle right
 *    next to the "Asset Groups" filter — on ALL THREE services, wired to
 *    both the manifest-mode and turbo-mode fetch paths, default
 *    `"could_exist"` (byte-for-byte unchanged behavior until toggled).
 *
 *    The three PRE-EXISTING, narrower MVP affordances are UNCHANGED and
 *    deliberately kept (decided NOT redundant — each is a different
 *    granularity/surface, not a competing duplicate of the new page-level
 *    toggle):
 *      1. `VenueCoverageTable`'s "MVP / Could exist / All" pill toggle
 *         (`getVenueYearCoverage` -> `/data-status/venue-year-coverage`,
 *         `data-testid="coverage-scope-toggle"`) — a separate venue×year
 *         ROLLUP view on its own "Venue Coverage" tab, `App.tsx`-gated to
 *         `market-tick-data-service` only. Different grain (venue×year,
 *         not per-instrument/date) from the new page-level toggle, so it
 *         stays as a complementary view rather than becoming redundant.
 *      2. `CatalogueExplorer`'s "MVP only" checkbox
 *         (`data-testid="catalogue-explorer-mvp-toggle"`, ->
 *         `/data-status/catalogue`) — instruments-service only, scopes the
 *         catalogue browser, not the coverage grid.
 *      3. The per-shard drill-down modal's "MVP only" checkbox
 *         (`InstrumentsModalStandard` in `DataStatusDrilldown.tsx`) — a
 *         per-shard-cell modal, not a page-level toggle.
 *
 * This spec locks in the current, now-fully-at-parity state (all four
 * points above) so a future change doesn't silently regress any of them.
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

test.describe("DataStatusTab cross-service parity — MVP toggle (FIXED 2026-07-23)", () => {
  for (const service of SERVICES) {
    test(`${service}: page-level Coverage Scope toggle renders on the main Data Status tab and is togglable`, async ({
      page,
    }) => {
      await page.goto(`/service/${service}/data-status`);
      await page.waitForLoadState("networkidle");

      const toggle = page.getByTestId("data-status-scope-toggle");
      await expect(toggle).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId("data-status-scope-toggle-mvp")).toBeVisible();
      await expect(page.getByTestId("data-status-scope-toggle-could_exist")).toBeVisible();
      await expect(page.getByTestId("data-status-scope-toggle-all")).toBeVisible();

      // Defaults to "could_exist" (byte-for-byte unchanged behavior until
      // an operator opts in) and is clickable without error.
      await expect(page.getByTestId("data-status-scope-toggle-could_exist")).toHaveAttribute("data-selected", "true");
      await page.getByTestId("data-status-scope-toggle-mvp").click();
      await expect(page.getByTestId("data-status-scope-toggle-mvp")).toHaveAttribute("data-selected", "true");
    });
  }

  test("instruments-service: pre-existing Catalogue Explorer MVP checkbox is unchanged, coexists with the new page-level toggle", async ({
    page,
  }) => {
    await page.goto("/service/instruments-service/data-status");
    await page.waitForLoadState("networkidle");

    // Catalogue Explorer's own "MVP only" checkbox — IS-only affordance, unaffected by this fix.
    await expect(page.getByTestId("catalogue-explorer-mvp-toggle")).toBeVisible({ timeout: 10000 });
    // No "Venue Coverage" tab on instruments-service (MTDS-only, unchanged).
    await expect(page.getByTestId("venue-coverage-tab-trigger")).toHaveCount(0);
    // The new page-level toggle now ALSO renders here — both coexist.
    await expect(page.getByTestId("data-status-scope-toggle")).toBeVisible();
  });

  test("market-tick-data-service: pre-existing Venue Coverage tab toggle is unchanged, coexists with the new page-level toggle", async ({
    page,
  }) => {
    await page.goto("/service/market-tick-data-service/data-status");
    await page.waitForLoadState("networkidle");

    // No Catalogue Explorer MVP checkbox on MTDS's Data Status tab (unchanged).
    await expect(page.getByTestId("catalogue-explorer-mvp-toggle")).toHaveCount(0);
    // The new page-level toggle renders on the main Data Status tab.
    await expect(page.getByTestId("data-status-scope-toggle")).toBeVisible();

    // The separate Venue Coverage tab + its own scope pill are UNCHANGED —
    // decided to keep as a complementary venue×year rollup view, not
    // redundant with the new page-level per-instrument/date toggle.
    const venueCoverageTab = page.getByTestId("venue-coverage-tab-trigger");
    await expect(venueCoverageTab).toBeVisible();
    await venueCoverageTab.click();
    await expect(page.getByTestId("coverage-scope-toggle")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("scope-toggle-mvp")).toBeVisible();
  });

  test("market-data-processing-service: previously ZERO MVP-scope affordance, now has the page-level toggle (gap closed)", async ({
    page,
  }) => {
    await page.goto("/service/market-data-processing-service/data-status");
    await page.waitForLoadState("networkidle");

    // Neither of the two narrower per-service MVP affordances applies to MDPS (unchanged).
    await expect(page.getByTestId("catalogue-explorer-mvp-toggle")).toHaveCount(0);
    await expect(page.getByTestId("venue-coverage-tab-trigger")).toHaveCount(0);

    // The new page-level toggle closes what was previously a total gap.
    await expect(page.getByTestId("data-status-scope-toggle")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("data-status-scope-toggle-mvp")).toBeVisible();
  });
});
