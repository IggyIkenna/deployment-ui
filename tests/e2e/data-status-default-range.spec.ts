/**
 * Data-status tab default range — deployment_ui_ux_caching_walkthrough decision #2.
 *
 * The Data Status tab (manifest/drilldown views) used to default its initial range to
 * full history (start_date=2018-01-01 → today) — the heaviest scan the manifest
 * builder runs, on every page load. Operator decision (2026-07-14, superseding the
 * prior 2026-06-14 "2018-01-01 canonical default" instruction): default to a bounded
 * 90-day window; full history stays reachable via the "All" start-date preset (an
 * explicit user action), never the silent default.
 *
 * Asserts:
 *   1. The INITIAL manifest request (fired automatically on mount for manifest-mode
 *      services) carries a bounded start_date (today-90d), not 2018-01-01.
 *   2. The "All" preset is still present, sets the Start Date field to 2018-01-01,
 *      and — once the operator explicitly clicks "Check Status" — the follow-up
 *      request DOES carry start_date=2018-01-01 (full history remains reachable).
 */

import { expect, test } from "@playwright/test";

type MockRequestsWindow = Window & { __mockRequests?: string[] };

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

test.describe("data-status tab default range", () => {
  test("initial manifest request uses the bounded 90-day default, not full history", async ({ page }) => {
    await page.addInitScript(() => {
      (window as MockRequestsWindow).__mockRequests = [];
    });

    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await page.getByText("instruments", { exact: true }).first().click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Data Status" }).click();

    // The manifest-mode auto-fetch-on-mount effect fires the request without any
    // user action — wait for it to show up in the mock request log.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as MockRequestsWindow).__mockRequests?.some((u) => u.includes("/api/data-status/manifest")) ??
            false,
        ),
      )
      .toBe(true);

    const manifestUrl = await page.evaluate(
      () => (window as MockRequestsWindow).__mockRequests?.find((u) => u.includes("/api/data-status/manifest")) ?? null,
    );
    expect(manifestUrl).not.toBeNull();
    const params = new URL(manifestUrl as string, "http://mock").searchParams;
    const startDate = params.get("start_date");

    expect(startDate, "must NOT silently default to full history").not.toBe("2018-01-01");
    // Bounded window: today-90d, within a couple of days of tolerance for the
    // day the test happens to run on either side of midnight.
    const expected = daysAgoIso(90);
    expect(startDate).toBe(expected);

    // The Start Date input itself reflects the same bounded default.
    await expect(page.getByLabel("Start Date")).toHaveValue(expected);
  });

  test("full history remains reachable via the explicit 'All' preset, never the silent default", async ({ page }) => {
    await page.addInitScript(() => {
      (window as MockRequestsWindow).__mockRequests = [];
    });

    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await page.getByText("instruments", { exact: true }).first().click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Data Status" }).click();
    await expect(page.getByLabel("Start Date")).toBeVisible();

    // Reset the log so we only look at what happens after this point.
    await page.evaluate(() => {
      (window as MockRequestsWindow).__mockRequests = [];
    });

    const allPreset = page.getByTestId("data-status-start-preset-all");
    await expect(allPreset).toBeVisible();
    await allPreset.click();
    await expect(page.getByLabel("Start Date")).toHaveValue("2018-01-01");

    // Selecting "All" alone must NOT auto-fire a full-history request — it only
    // becomes a real request once the operator explicitly confirms.
    const requestsAfterPresetOnly = await page.evaluate(
      () => (window as MockRequestsWindow).__mockRequests?.filter((u) => u.includes("/api/data-status/manifest")) ?? [],
    );
    expect(requestsAfterPresetOnly.some((u) => u.includes("start_date=2018-01-01"))).toBe(false);

    await page.getByRole("button", { name: "Check Status" }).click();

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as MockRequestsWindow).__mockRequests?.some(
              (u) => u.includes("/api/data-status/manifest") && u.includes("start_date=2018-01-01"),
            ) ?? false,
        ),
      )
      .toBe(true);
  });
});
