/**
 * L2 (Infrastructure Verify) — Fixtures browser window-note relabel
 * (sports_satellite_ao_dispatch_batch5_2026_07_26.md).
 *
 * `fixtures_browser.py` dropped its `_MAX_WINDOW_SPAN_DAYS=120` day-walk cap
 * when it switched to the single rolled-up `prod/catalog.parquet` full-history
 * source (deployment-api@dbbf64c) — the catalogue now covers 2019-01-01→present
 * with no range-length limit. `FixturesBrowser.tsx`'s window note previously
 * warned "the API reads only the first 120" days for a wide range; that
 * warning is now false and was removed in favor of a note that states the
 * real full-history coverage.
 *
 * Regression: a wide (multi-year) date range must render the full-history
 * coverage note and must NOT show the stale 120-day cap warning.
 *
 * Source: plans/active/sports_fixtures_browser_single_catalogue_source_2026_07_24.md
 */

import { expect, test } from "@playwright/test";

const SERVICE = "instruments-service";

test("fixtures browser window note states full-history coverage, not a 120-day cap, for a wide date range", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const fiveXx: number[] = [];
  page.on("response", (resp) => {
    if (resp.status() >= 500) fiveXx.push(resp.status());
  });

  // Deep-link straight to the service's Data Status tab (see
  // data-status-fixtures-catalogue-round3.spec.ts for why this beats the
  // sidebar-click flow).
  await page.goto(`/service/${SERVICE}/data-status`);
  await page.waitForLoadState("networkidle");

  const note = page.getByTestId("fixtures-browser-window-note");
  await expect(note).toBeVisible();

  await page.getByLabel(/From date/i).fill("2020-01-01");
  await page.getByLabel(/To date/i).fill("2026-01-01");
  await page.waitForLoadState("networkidle");

  await expect(note).toContainText("covers full history, 2019-01-01→present");
  await expect(note).not.toContainText("reads only the first");
  await expect(note).not.toContainText("MAX_SPAN_DAYS");

  expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  expect(fiveXx).toHaveLength(0);
});
