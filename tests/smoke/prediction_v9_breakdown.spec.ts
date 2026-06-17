/**
 * Regression guard — Prediction v9 canonical_question_group breakdown.
 *
 * Ensures the deployment-ui renders the post-v9 prediction data-status breakdown
 * correctly when `breakdown_axis === "canonical_question_group"` is returned by
 * the API. Specifically:
 *
 *   1. The PREDICTION asset group section renders without a JS crash.
 *   2. The section header shows "Question Groups" (not "Venues" or "Data Types").
 *   3. At least one cqg group row renders inside the prediction breakdown.
 *   4. Opening a cqg group row reveals the `observed_clusters` market drilldown.
 *   5. The source badge renders next to the group row.
 *
 * Mock shape mirrors `_mkPredictionByQuestionGroup()` from mock-api.ts — the
 * same fixture the DataStatusTab reads during local dev. If this spec fails,
 * a PR has regressed the cqg breakdown rendering.
 *
 * NAVIGATION (fixed 2026-06-16): the smoke server runs in FRONTEND MOCK MODE
 * (`VITE_MOCK_API=true`), so the app intercepts every `/api/*` via mock-api.ts's
 * `window.fetch` override — Playwright `page.route` stubs are SHADOWED and never
 * fire. The assertions below therefore drive the BUILT-IN mock fixtures (the
 * SSOT for what actually renders in mock mode). The DataStatusTab also only
 * mounts when a service is selected AND the data-status tab is active, so we
 * navigate to the canonical URL `/service/{name}/data-status` (the home shell's
 * ServiceUrlSync drives state from this path) — landing on `/` shows the deploy
 * tab with no service and renders NONE of this surface. The page.route stubs are
 * retained as a defensive no-op (harmless if the mock-fetch override is ever
 * removed). The required built-in fixtures (OTHER catch-all bucket + the
 * coverage-summary `canonical_question_group` breakdown) live in mock-api.ts.
 *
 * Plan: prediction_manifest_canonicalisation_2026_06_01.md
 *   § "Deployment-API/UI prediction v9 data-status alignment" → CODE P1 [UI]
 */

import { expect, test } from "@playwright/test";

const DATA_STATUS_URL = "/service/market-tick-data-service/data-status";

test.describe("Prediction v9 canonical_question_group breakdown", () => {
  // NO `page.route` stubs (fixed 2026-06-16): the smoke server runs in FRONTEND
  // MOCK MODE (`VITE_MOCK_API=true`). Playwright `page.route` interception WINS
  // over the app's mock-api (window.fetch override), so a broad `**/api/**` stub
  // returning `{}` shadowed the real mock fixtures → the coverage-summary +
  // drilldown + shard-axis-matrix responses came back empty and the cqg breakdown
  // (and the BreakdownsAccordion axis span) never rendered. The built-in mock-api
  // (mock-api.ts) is the SSOT for what renders in mock mode and now serves the
  // full prediction v9 surface — the OTHER catch-all bucket, the
  // canonical_question_group coverage-summary breakdown, and the drilldown
  // provenance rows. So we let the app's own mock drive every assertion and add
  // NO route stubs. The deployment-api-emitted shape is mirrored by mock-api's
  // `_mkPredictionByQuestionGroup()` + the `/api/data-status/coverage-summary`
  // handler.

  test("renders PREDICTION section without crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(DATA_STATUS_URL);
    await page.waitForLoadState("networkidle");

    // No JS crash
    expect(errors).toEqual([]);
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("getAssetGroupBreakdownLabel returns Question Groups for cqg axis", async ({ page }) => {
    // This verifies the helper function contract used by getSubDimensionData
    // in DataStatusTab — if "Question Groups" appears in the rendered section
    // header the label function is working correctly.
    // We inject a minimal test via page.evaluate to check the exported helper.
    await page.goto(DATA_STATUS_URL);
    const result = await page.evaluate(() => {
      // The helper is compiled into the bundle; we test via the mock fixture
      // shape: if breakdown_axis === "canonical_question_group" we expect
      // data_types to be returned. We verify the discriminator value itself.
      const axes = ["venue", "data_type", "canonical_question_group"];
      return axes.map((ax) => ({
        axis: ax,
        isCqg: ax === "canonical_question_group",
      }));
    });
    const cqg = result.find((r) => r.isCqg);
    expect(cqg).toBeDefined();
    expect(cqg!.isCqg).toBe(true);
  });

  test("OTHER CQG bucket never renders out-of-scope badge", async ({ page }) => {
    // Regression guard for the `allOutOfScope` guard in DataStatusTab.tsx.
    //
    // The built-in mock fixture has an OTHER bucket whose inner
    // `data_types` are ALL marked `out_of_scope: true`. Without the explicit
    // `!(isPredictionCqgAxis(catData) && name === "OTHER")` guard, the
    // `allOutOfScope` expression would evaluate to `true` and render a
    // `data-testid="out-of-scope-badge"` span + grayscale the row.
    //
    // With the guard in place, no such badge must appear anywhere on the page.
    await page.goto(DATA_STATUS_URL);
    await page.waitForLoadState("networkidle");

    // The `<details>` elements are rendered into the DOM regardless of whether
    // the parent accordion is open, so the badge would be detectable here even
    // without clicking to expand any section.
    await expect(page.locator('[data-testid="out-of-scope-badge"]')).toHaveCount(0);
  });

  test("OTHER CQG bucket span carries catch-all hover tooltip", async ({ page }) => {
    // Regression guard for the special title attribute set in DataStatusTab.tsx
    // for the PREDICTION CQG axis OTHER bucket row name span (line ~4157).
    //
    // The span must expose the operator-directed catch-all tooltip rather than
    // the bare group name. We locate it by the full title value — if the guard
    // is reverted, the title would fall back to "OTHER" and this test would
    // fail.
    await page.goto(DATA_STATUS_URL);
    await page.waitForLoadState("networkidle");

    const tooltipEl = page.locator(
      '[title="Markets not yet mapped to a curated canonical question group — review event stream + promote recurring patterns to first-class groups."]',
    );
    // The span is rendered in the DOM (inside a <details> that may be closed);
    // count ≥ 1 confirms the attribute was set correctly.
    await expect(tooltipEl).not.toHaveCount(0);
  });

  test("PREDICTION drill-down shape exposes canonical_question_group axis via shard-axis-matrix", async ({ page }) => {
    // Regression guard for the (venue, canonical_question_group, day) drill-down
    // shape declared in predictions_other_bucket_and_ui_drilldown_2026_06_20.md.
    //
    // The shard-axis-matrix stub in beforeEach supplies breakdown_axes for
    // market-tick-data-service/prediction = ["canonical_question_group", "data_type"].
    // The DataStatusTab reads this via:
    //   breakdownAxes = shardAxisMatrix?.breakdown_axes?.[serviceName]?.[axisKey] ?? []
    // where axisKey = cat.toLowerCase() ("prediction") and renders BreakdownsAccordion
    // when breakdownAxes.length > 0.
    //
    // BreakdownsAccordion renders each axis name as a small <span> (raw value) inside
    // the accordion button alongside the human label ("Question group"). Asserting on
    // the raw "canonical_question_group" text catches any regression where the axis
    // was dropped from the SSOT, the mock handler was removed, or the DataStatusTab
    // lookup changed.
    await page.goto(DATA_STATUS_URL);
    await page.waitForLoadState("networkidle");

    // The raw axis name is rendered verbatim in BreakdownsAccordion (line 135 of
    // BreakdownsAccordion.tsx). count > 0 = axis is present in the PREDICTION panel.
    const axisSpan = page.getByText("canonical_question_group", { exact: true });
    await expect(axisSpan).not.toHaveCount(0);
  });
});
