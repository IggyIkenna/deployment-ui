/**
 * L2 (Infrastructure Verify) — Distinct Values panel (RAW distinct-values
 * enumeration, `cefi_consolidated_closeout_2026_07_18` "Re-add the 'data
 * status' enumeration to deployment-ui/api").
 *
 * Regression spec for the new distinct-values surface on the instruments-service
 * Data Status tab. It consumes `GET /data-status/distinct-values/{asset_group}`
 * and, per asset_group, renders four axis lists (venues / instrument_types /
 * data_types / chains) straight off the honest-coverage rollup — deliberately
 * un-collapsed. Every value carries the backend's `is_canonical` verdict; a
 * NON-canonical value (e.g. `AAVE`, `lending`, `dex_pools`, `HYPERLIQUID`)
 * shows a "non-canonical" badge so an operator can eyeball drift/duplication.
 *
 * Mocking mechanism: the app's dev server runs with `VITE_MOCK_API=true` (see
 * `data-status-fixtures-catalogue-round3.spec.ts`'s docstring for why
 * `page.route()` never sees these requests) —
 * `src/lib/mock-api.ts#installDeploymentMockHandlers()` monkey-patches
 * `window.fetch` and serves a dedicated `/api/data-status/distinct-values`
 * fixture carrying exactly this kind of canonical/non-canonical mix, so this
 * spec exercises the real, unmodified `DistinctValuesPanel` component
 * end-to-end with no `page.route()` workaround needed.
 */

import { expect, test } from "@playwright/test";

const SERVICE = "instruments-service";

test("Distinct Values renders all four axes with non-canonical badges, no console errors / 5xx", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const fiveXx: number[] = [];
  page.on("response", (resp) => {
    if (resp.status() >= 500) fiveXx.push(resp.status());
  });

  // Deep-link straight to the service's Data Status tab (see `HomeShell.tsx`'s
  // `/service/{name}/{tab}` route) rather than the sidebar-click flow.
  await page.goto(`/service/${SERVICE}/data-status`);
  await page.waitForLoadState("networkidle");

  const card = page.getByTestId("distinct-values-card");
  await expect(card).toBeVisible();

  // All four axes render.
  await expect(page.getByTestId("distinct-values-axis-venues")).toBeVisible();
  await expect(page.getByTestId("distinct-values-axis-instrument_types")).toBeVisible();
  await expect(page.getByTestId("distinct-values-axis-data_types")).toBeVisible();
  await expect(page.getByTestId("distinct-values-axis-chains")).toBeVisible();

  // Canonical + non-canonical spellings render as SEPARATE rows.
  await expect(page.getByTestId("distinct-values-row-instrument_types-LENDING")).toBeVisible();
  await expect(page.getByTestId("distinct-values-row-instrument_types-lending")).toBeVisible();

  // A non-canonical value shows its "non-canonical" badge on every axis...
  await expect(page.getByTestId("distinct-values-noncanon-venues-AAVE")).toBeVisible();
  await expect(page.getByTestId("distinct-values-noncanon-instrument_types-lending")).toBeVisible();
  await expect(page.getByTestId("distinct-values-noncanon-data_types-dex_pools")).toBeVisible();
  await expect(page.getByTestId("distinct-values-noncanon-chains-HYPERLIQUID")).toBeVisible();

  // ...while a canonical value does NOT.
  await expect(page.getByTestId("distinct-values-noncanon-instrument_types-LENDING")).toHaveCount(0);
  await expect(page.getByTestId("distinct-values-noncanon-chains-ETHEREUM")).toHaveCount(0);

  // Per-axis non-canonical count badge is visible where drift exists.
  await expect(page.getByTestId("distinct-values-noncanon-count-venues")).toBeVisible();

  expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  expect(fiveXx).toHaveLength(0);
});
