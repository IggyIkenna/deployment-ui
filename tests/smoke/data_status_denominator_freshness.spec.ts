/**
 * Regression spec (pw:L2) for denominator freshness trust annotation.
 * Plan: ui_satellite_ao_dispatch_batch4_2026_08_17.md.
 */
import { expect, test } from "@playwright/test";

test("Data Status coverage headline shows denominator computation age", async ({ page }) => {
  await page.goto("/service/instruments-service/data-status");
  await page.waitForLoadState("networkidle");

  const freshness = page.getByTestId("coverage-denominator-freshness").filter({
    hasText: /denominator last computed \d+m ago/,
  });
  await expect(freshness).toBeVisible({ timeout: 10000 });
  await expect(freshness).toContainText(/denominator last computed \d+m ago/);
  await expect(freshness).not.toContainText("stale");
});
