/**
 * L2 (Infrastructure Verify) — Catalogue Explorer human-readable Name column
 * (KRX equities deliverable, 2026-07-20).
 *
 * Regression for the operator ask: KRX (Korean) equities show as raw 6-digit
 * exchange codes (`KRX:EQUITY:005930`) with no readable label. The catalogue now
 * carries a first-class `name` column (instruments-service roll-up
 * `_add_instrument_name` from the UAC `KRX_EQUITY_NAMES` SSOT → deployment-api
 * `/data-status/catalogue` row → this UI). This spec proves the Catalogue Explorer
 * renders that name ("Samsung Electronics") next to the coded id, and shows an
 * honest em-dash for an instrument with no display name.
 *
 * MOCKING MECHANISM (read before touching — same as
 * `data-status-fixtures-catalogue-round3.spec.ts`): the dev server runs with
 * `VITE_MOCK_API=true`, so `src/lib/mock-api.ts#installDeploymentMockHandlers()`
 * monkey-patches `window.fetch` in-process for every `/api/` URL. `page.route()`
 * NEVER sees these requests. This spec relies entirely on the built-in mock
 * fixtures, whose `/api/data-status/catalogue` handler already includes a KRX row
 * (`KRX:EQUITY:005930` → "Samsung Electronics") plus name-less crypto rows — no
 * test-side fetch override needed.
 *
 * Asserts the Name column renders with no console errors / no 5xx (L2 contract).
 * Plan: krx_name + tradfi_catalogue deliverables 2026-07-20.
 */

import { expect, test } from "@playwright/test";

const SERVICE = "instruments-service";

test("Catalogue Explorer renders the human-readable Name column for a KRX equity", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const fiveXx: number[] = [];
  page.on("response", (resp) => {
    if (resp.status() >= 500) fiveXx.push(resp.status());
  });

  // Deep-link straight to the service's Data Status tab (see the round3 spec for
  // why the sidebar-text-click flow is retired).
  await page.goto(`/service/${SERVICE}/data-status`);
  await page.waitForLoadState("networkidle");

  // The Name column header is present.
  const table = page.getByTestId("catalogue-explorer-table");
  await expect(table).toBeVisible();
  await expect(table.locator("thead th", { hasText: "Name" })).toBeVisible();

  // The KRX 6-digit code carries its issuer name in the Name cell, next to the
  // coded instrument_id (which stays the canonical id).
  await expect(page.getByTestId("catalogue-explorer-row-KRX:EQUITY:005930")).toBeVisible();
  await expect(page.getByTestId("catalogue-explorer-name-KRX:EQUITY:005930")).toHaveText("Samsung Electronics");

  // A crypto instrument whose id is already human-readable renders an honest
  // em-dash rather than a fabricated name.
  await expect(page.getByTestId("catalogue-explorer-name-BINANCE-SPOT-BTCUSDT")).toHaveText("—");

  expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  expect(fiveXx).toHaveLength(0);
});
