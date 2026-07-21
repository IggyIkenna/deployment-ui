/**
 * Regression spec — SportsFeatureCoverageCard (Phase 8.A, features_sports_honest_coverage_2026_05_05.plan.md).
 *
 * This spec runs against the app's in-app frontend mock layer (`src/lib/mock-api.ts`,
 * active whenever `VITE_MOCK_API=true` — always true for this suite's dedicated
 * webServer, see playwright.config.ts). That mock intercepts `fetch()` client-side
 * before any request reaches the network, so `page.route("**\/api/**", ...)` overrides
 * are NOT observed here (documented precedent: mock-api.ts:960-961, "the page.route fix
 * in stateful-flows.spec.ts is dead under VITE_MOCK_API — the in-app mock wins"). The
 * FIXTURE_FEATURES / ODDS_FEATURES / DERIVED_FEATURES entries this spec asserts on were
 * added to `_mkSportsByDataType()` in the same commit as this spec, so the numbers below
 * are the fixture's real static values, not injected per-test data.
 *
 * Guards:
 *   1. The card renders on the features-sports-service Data Status tab, reading the
 *      Phase-3 `sports_honest_coverage()` axis shape (found_shards/expected_shards +
 *      per-league `leagues`) via the turbo endpoint's `data_types` map.
 *   2. Each rollup shows a completion percentage derived from `found_shards`/`expected_shards`.
 *   3. Expanding a rollup reveals its per-league breakdown, including a missing-dates
 *      count for a league with a real gap (LA_LIGA under FIXTURE_FEATURES).
 *   4. The card never claims per-calculator or drift data it doesn't have — the
 *      "not wired yet" note is always present (`sports-feature-per-calculator-pending`).
 *
 * Plan: plans/active/issues/features_sports_deployment_ui_coverage_tab_and_registry_playbook_2026_07_21.md
 *   todo 1 [UI] — deployment-ui coverage tab/panel for sports feature coverage.
 */

import { expect, test } from "@playwright/test";

test.describe("SportsFeatureCoverageCard regression", () => {
  test("renders per-rollup honest coverage on the features-sports-service Data Status tab", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/service/features-sports-service/data-status");
    await page.waitForLoadState("networkidle");

    const card = page.getByTestId("sports-feature-coverage-card");
    await expect(card).toBeVisible({ timeout: 10000 });

    // All 3 rollups render with a completion percentage derived from found/expected shards
    // (the fixture values added to `_mkSportsByDataType()` in mock-api.ts).
    await expect(page.getByTestId("sports-feature-pct-FIXTURE_FEATURES")).toHaveText("93.8%");
    await expect(page.getByTestId("sports-feature-pct-ODDS_FEATURES")).toHaveText("90.6%");
    await expect(page.getByTestId("sports-feature-pct-DERIVED_FEATURES")).toHaveText("89.3%");

    // Never claims per-calculator / drift data it doesn't have.
    await expect(page.getByTestId("sports-feature-per-calculator-pending")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("expanding a rollup reveals its per-league honest breakdown", async ({ page }) => {
    await page.goto("/service/features-sports-service/data-status");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("sports-feature-rollup-toggle-FIXTURE_FEATURES").click();

    const leagueRows = page.getByTestId("sports-feature-league-row");
    await expect(leagueRows).toHaveCount(2);
    await expect(page.getByText("140/160 fixture_dates")).toBeVisible();
    await expect(page.getByText("(2 missing)")).toBeVisible();
  });

  test("does not render on a different service's Data Status tab", async ({ page }) => {
    await page.goto("/service/market-tick-data-service/data-status");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("sports-feature-coverage-card")).not.toBeVisible();
  });
});
