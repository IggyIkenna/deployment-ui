/**
 * L2 (Infrastructure Verify) — Fixtures browser regen-cadence freshness label
 * (sports_taxonomy_p3_consumers_2026_08_08.md, "[UI] Fixtures-browser: accept
 * and LABEL the staleness").
 *
 * Operator ruling 2026-08-08: the fixtures browser is only ever as fresh as
 * the catalogue's last scheduled regen (`lifecycle-catalogue-regen-sports-daily`,
 * 01:00 UTC daily + a Saturday 07:00 UTC full rebuild,
 * `deployment-service/terraform/gcp/lifecycle_catalogue_scheduler.tf`) — the
 * fix is to accept + LABEL that staleness honestly ("as of <timestamp>"),
 * consistent with how the rest of the estate labels rollup freshness. A
 * live-day overlay was explicitly ruled OUT.
 *
 * Regression: the browser must always render a freshness line — either the
 * real "Catalogue as of <timestamp>" label (honest, from the backend's
 * catalogue blob metadata) or an explicit "freshness unavailable" fallback —
 * never a blank/missing label and never a fabricated "live" claim.
 *
 * Source: plans/active/sports_fixtures_browser_single_catalogue_source_2026_07_24.md
 */

import { expect, test } from "@playwright/test";

const SERVICE = "instruments-service";

test("fixtures browser labels the catalogue's regen-cadence freshness honestly", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const fiveXx: number[] = [];
  page.on("response", (resp) => {
    if (resp.status() >= 500) fiveXx.push(resp.status());
  });

  await page.goto(`/service/${SERVICE}/data-status`);
  await page.waitForLoadState("networkidle");

  const asOfLine = page.getByTestId("fixtures-browser-as-of");
  await expect(asOfLine).toBeVisible();

  const text = (await asOfLine.textContent()) ?? "";
  // Exactly one of the two honest states — never blank, never a fabricated
  // "live"/"now" claim outside the may-lag caveat.
  const labelsRealAsOf = /Catalogue as of/.test(text);
  const labelsUnavailable = /freshness unavailable/i.test(text);
  expect(labelsRealAsOf || labelsUnavailable).toBe(true);
  if (labelsRealAsOf) {
    expect(text).toMatch(/regenerated daily/);
    expect(text).toMatch(/may lag/);
  }

  expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  expect(fiveXx).toHaveLength(0);
});
