/**
 * Regression spec — cross-category Symbol Search click-through
 * (universal MTDS search bar, plans/active/mtds_data_status_page_parity_2026_07_21.md).
 *
 * The "Symbol search" box (`DataStatusTab.tsx`) already existed and already
 * returned results across cefi/tradfi/defi/sports/prediction — the gap was
 * that clicking a result row did nothing. This spec locks in the two
 * click-through branches added to close that gap:
 *
 *  - A non-SPORTS hit (cefi/tradfi/defi/prediction) constructs an
 *    `InstrumentSearchResult` from the match's own `venue`/`instrument_type`
 *    (stripping that exact prefix off the single-colon
 *    `VENUE:TYPE:SYMBOL` `canonical_id` — NOT the `::`-delimited
 *    `instrument_key` format the separate manual "Instrument-Level Search"
 *    dropdown uses) and renders an inline availability panel.
 *  - A SPORTS hit (bare `league_id` canonical_id) fetches that league's
 *    found/missing dates over the page's current date range and renders an
 *    inline day-list panel; picking a found day composes the existing
 *    `<FixtureBreakdown>` per-fixture drilldown underneath it.
 *
 * Both panels are new, independent state — deliberately NOT the pre-existing
 * `selectedInstrument`/`instrumentAvailability` pair the manual dropdown
 * flow owns (that pair is wiped by an effect keyed on
 * `[instrumentSearchMode, selectedCategories]` whenever either changes for
 * an unrelated reason, and that flow's own render block is additionally
 * gated to `selectedCategories.length === 1` on MTDS/MDPS only) — so this
 * spec also implicitly guards that neither panel touches the macro
 * asset-group-breakdown drilldown lower on the page (additive, not a
 * replacement).
 */

import { expect, test } from "@playwright/test";

// This repo's webServer (playwright.config.ts) runs with VITE_MOCK_API=true —
// the app's own client-side mock layer (src/lib/mock-api.ts) already serves
// realistic data for every service, so no manual page.route() interception
// is needed (or wanted — it would shadow the app's own mock responses).

test.describe("Symbol search click-through", () => {
  test("non-SPORTS hit renders an inline instrument availability panel", async ({ page }) => {
    await page.goto("/service/market-tick-data-service/data-status");
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

    // The macro asset-group breakdown below is untouched — still present.
    await expect(page.getByText("Asset group breakdown")).toBeVisible();

    // Dismiss collapses the panel.
    await page.getByTestId("symbol-search-instrument-dismiss").click();
    await expect(instrumentPanel).not.toBeVisible();
  });

  test("SPORTS hit renders day-level availability, composes FixtureBreakdown on a found day", async ({ page }) => {
    await page.goto("/service/market-tick-data-service/data-status");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByTestId("symbol-search-input");
    await searchInput.waitFor({ timeout: 10000 });
    await searchInput.fill("EPL");

    const results = page.getByTestId("symbol-search-result");
    const sportsResult = results.filter({ hasText: "SPORTS" }).first();
    await expect(sportsResult).toBeVisible({ timeout: 10000 });
    await sportsResult.click();

    const leaguePanel = page.getByTestId("symbol-search-league-panel");
    await expect(leaguePanel).toBeVisible({ timeout: 10000 });
    await expect(leaguePanel).toContainText("found");
    await expect(leaguePanel).toContainText("missing");

    // The macro asset-group breakdown below is untouched — still present.
    await expect(page.getByText("Asset group breakdown")).toBeVisible();

    const foundDayButtons = leaguePanel.locator('[data-testid^="symbol-search-league-day-"]');
    await expect(foundDayButtons.first()).toBeVisible();
    await foundDayButtons.first().click();

    const fixtureBreakdown = page.getByTestId("fixture-breakdown");
    await expect(fixtureBreakdown).toBeVisible({ timeout: 10000 });

    // Read-only composition — no per-fixture download buttons.
    await expect(page.getByTestId(/^fixture-download-/)).toHaveCount(0);

    // Clicking the same day again collapses the breakdown.
    await foundDayButtons.first().click();
    await expect(fixtureBreakdown).not.toBeVisible();

    // Dismiss collapses the whole league panel.
    await page.getByTestId("symbol-search-league-dismiss").click();
    await expect(leaguePanel).not.toBeVisible();
  });
});
