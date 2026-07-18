/**
 * L2 (Infrastructure Verify) — F9 (operator 2026-07-18): the sports league
 * filter must match the HUMAN league name (case-insensitive SUBSTRING on the
 * raw catalogue id OR its resolved UAC display_name) — previously an exact
 * match on the raw numeric/canonical id only, so typing a human league name
 * (e.g. "Allsvenskan") returned 0 rows. Upcoming Fixtures must also render
 * human league names as its group header (raw id as a muted subtitle,
 * honest-absence raw-id fallback), mirroring the Fixtures Browser's F1
 * treatment.
 *
 * Uses the app's own `mock-api.ts` handlers (`VITE_MOCK_API=true`, set by
 * `playwright.config.ts`'s webServer env) — no custom `window.fetch` wrapper
 * needed: `/api/fixtures/upcoming` now has a real mock-api.ts handler (added
 * alongside this fix) carrying a non-EPL league (Allsvenskan, API-Football
 * catalogue id "113") with its `league_names` map, and `/api/fixtures/browse`'s
 * existing EPL/MLS mock rows exercise the substring-on-human-name match.
 *
 * Issue: plans/active/data_status_page_ux_and_canonicalisation_2026_07_16.md (F9)
 */

import { expect, test } from "@playwright/test";

const SERVICE = "instruments-service";

test("F9 — Upcoming Fixtures renders the human league name, raw id as subtitle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const fiveXx: number[] = [];
  page.on("response", (resp) => {
    if (resp.status() >= 500) fiveXx.push(resp.status());
  });

  await page.goto(`/service/${SERVICE}/data-status`);
  await page.waitForLoadState("networkidle");

  // "113" (Allsvenskan's API-Football catalogue id, mock-api.ts) resolves to
  // a human name in the group header, with the raw id kept as a subtitle.
  const header = page.getByTestId("upcoming-fixtures-league-name-113");
  await expect(header).toBeVisible();
  await expect(header).toContainText("Allsvenskan");
  await expect(header).toContainText("113");

  expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  expect(fiveXx).toHaveLength(0);
});

test("F9 — Fixtures Browser league filter matches on the resolved human name, not only the raw id", async ({
  page,
}) => {
  await page.goto(`/service/${SERVICE}/data-status`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("fixtures-browser-card")).toBeVisible();

  // Typing part of the HUMAN name ("Premier") must still surface the EPL
  // group, whose raw catalogue league_id is "EPL" — proving the filter checks
  // the resolved display_name, not just the raw id (the F9 regression: it used
  // to be an exact, case-sensitive match on the raw id only).
  await page.locator("#fb-league").fill("Premier");
  await expect(page.getByTestId("fixtures-browser-league-EPL")).toBeVisible({ timeout: 10_000 });

  // Case-insensitive substring on the raw id itself keeps working too.
  await page.locator("#fb-league").fill("epl");
  await expect(page.getByTestId("fixtures-browser-league-EPL")).toBeVisible({ timeout: 10_000 });
});
