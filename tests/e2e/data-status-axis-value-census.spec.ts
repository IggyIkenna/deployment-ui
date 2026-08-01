/**
 * L2 (Infrastructure Verify) — Axis Value Census (Track-6 restoration,
 * `cefi_consolidated_closeout_2026_07_18.md` "Re-add the 'data status'
 * enumeration to deployment-ui/api").
 *
 * Regression spec for the new non-canonical-naming / duplication detector
 * panel on the instruments-service Data Status tab: it lists every DISTINCT
 * RAW value + row count present in the manifest per axis (venue /
 * instrument_type / data_type / chain), reading `GET
 * /data-status/axis-value-census` — deliberately un-canonicalised, so two raw
 * spellings of one real value (`spot` / `SPOT_PAIR` / `spot_pair`) render as
 * THREE separate rows rather than being merged.
 *
 * Mocking mechanism: the app's dev server runs with `VITE_MOCK_API=true`
 * (see `data-status-fixtures-catalogue-round3.spec.ts`'s docstring for the
 * full explanation of why `page.route()` never sees these requests) —
 * `src/lib/mock-api.ts#installDeploymentMockHandlers()` monkey-patches
 * `window.fetch` and serves a dedicated `/api/data-status/axis-value-census`
 * fixture carrying exactly this kind of raw duplication, so this spec exercises
 * the real, unmodified `AxisValueCensus` component end-to-end with no
 * `page.route()` workaround needed.
 */

import { expect, test } from "@playwright/test";

const SERVICE = "instruments-service";

test("Axis Value Census renders raw distinct values (incl. duplicates) with no console errors / 5xx", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const fiveXx: number[] = [];
  page.on("response", (resp) => {
    if (resp.status() >= 500) fiveXx.push(resp.status());
  });

  // Deep-link straight to the service's Data Status tab (see
  // `HomeShell.tsx`'s `/service/{name}/{tab}` route) rather than the
  // sidebar-click flow — mirrors the round-3 spec's precedent.
  await page.goto(`/service/${SERVICE}/data-status`);
  await page.waitForLoadState("networkidle");

  const card = page.getByTestId("axis-value-census-card");
  await expect(card).toBeVisible();

  // The three raw spellings of one real instrument_type all render as
  // SEPARATE rows — the whole point of this panel.
  await expect(page.getByTestId("axis-value-census-row-instrument_type-SPOT_PAIR")).toBeVisible();
  await expect(page.getByTestId("axis-value-census-row-instrument_type-spot")).toBeVisible();
  await expect(page.getByTestId("axis-value-census-row-instrument_type-spot_pair")).toBeVisible();

  // All three carry the "possible duplicate" flag (they fold to the same
  // canonical label); the genuinely-single OPTION entry does not.
  await expect(page.getByTestId("axis-value-census-dup-flag-instrument_type-SPOT_PAIR")).toBeVisible();
  await expect(page.getByTestId("axis-value-census-dup-flag-instrument_type-spot")).toBeVisible();
  await expect(page.getByTestId("axis-value-census-dup-flag-instrument_type-spot_pair")).toBeVisible();
  await expect(page.getByTestId("axis-value-census-dup-flag-instrument_type-OPTION")).toHaveCount(0);

  expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  expect(fiveXx).toHaveLength(0);
});
