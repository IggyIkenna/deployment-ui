/**
 * Regression spec — MTDS instrument-search + first-day-of-month visibility (Bug A).
 *
 * Both affordances were gated on a dead pre-rename string
 * (`"market-tick-data-handler"`) in `DataStatusTab.tsx` — MTDS was renamed to
 * `"market-tick-data-service"` on 2026-03-10, three months before this UI was
 * written, so the conditionals never matched and the boxes silently never
 * rendered for MTDS (no error, just absent).
 *
 * Regression guard: 2026-07-21 — swapped the dead string to
 * `"market-tick-data-service"` across `DataStatusTab.tsx`, `CLIPreview.tsx`,
 * `ServiceDetails.tsx`, `api/client.ts`. This spec locks in that both boxes
 * render for MTDS going forward.
 */

import { expect, test } from "@playwright/test";

// This repo's webServer (playwright.config.ts) runs with VITE_MOCK_API=true —
// the app's own client-side mock layer (src/lib/mock-api.ts) already serves
// realistic data for every service, so no manual page.route() interception
// is needed (or wanted — it would shadow the app's own mock responses).

test.describe("MTDS instrument-search + first-day-of-month visibility regression", () => {
  test("first-day-of-month checkbox renders for market-tick-data-service", async ({ page }) => {
    await page.goto("/service/market-tick-data-service/data-status");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("First day of each month only")).toBeVisible({ timeout: 10000 });
  });

  test("Instrument-Level Search checkbox renders for market-tick-data-service once one asset group is selected", async ({
    page,
  }) => {
    await page.goto("/service/market-tick-data-service/data-status");
    await page.waitForLoadState("networkidle");

    // The search block additionally requires exactly one selected asset-group
    // category (`selectedCategories.length === 1`) — select CEFI.
    const cefiToggle = page.getByTestId("asset-group-toggle-CEFI");
    await cefiToggle.waitFor({ timeout: 10000 });
    await cefiToggle.click();

    await expect(page.getByRole("checkbox", { name: "Instrument-Level Search" })).toBeVisible({ timeout: 10000 });
  });
});
