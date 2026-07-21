/**
 * Regression spec: Venue Tardis Windows panel (§3.P2)
 *
 * Covers the free-vs-paid date range view on the Venue Config page:
 *   - Panel renders with "Tardis Free vs Paid Date Ranges" heading
 *   - Key status badge is visible (EXPIRED in mock mode)
 *   - Free-tier box visible with rolling-window info
 *   - Paid-tier box shows blocked warning when key is expired
 *   - Refresh button is present
 *   - No JS crash on API error
 *
 * pw:L2 BLOCKED-INFRA: libatk missing in slot env.
 * Spec is written and will execute when infra is available.
 */

import { expect, type Page, test } from "@playwright/test";

async function goToVenueConfig(page: Page) {
  await page.goto("/venue-config");
  await page.waitForLoadState("networkidle");
}

test.describe("VenueTardisWindowsPanel", () => {
  test("Panel renders with correct heading", async ({ page }) => {
    await goToVenueConfig(page);

    const panel = page.getByTestId("venue-tardis-windows-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Tardis Free vs Paid Date Ranges");
  });

  test("Key status badge visible and shows EXPIRED in mock mode", async ({ page }) => {
    await goToVenueConfig(page);

    const badge = page.getByTestId("tardis-key-status-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("EXPIRED");
  });

  test("Free-tier box shows rolling window details", async ({ page }) => {
    await goToVenueConfig(page);

    const freeBox = page.getByTestId("tardis-free-tier-box");
    await expect(freeBox).toBeVisible();
    await expect(freeBox).toContainText("Free tier");
    await expect(freeBox).toContainText("1st of every calendar month");
    await expect(freeBox).toContainText("Rolling window: last 7 days");
  });

  test("Paid-tier box shows blocked warning when key is expired", async ({ page }) => {
    await goToVenueConfig(page);

    const paidBox = page.getByTestId("tardis-paid-tier-box");
    await expect(paidBox).toBeVisible();

    const blockedMsg = page.getByTestId("tardis-paid-tier-blocked-msg");
    await expect(blockedMsg).toBeVisible();
    await expect(blockedMsg).toContainText("expired");
    await expect(blockedMsg).toContainText("key is renewed");
  });

  test("Refresh button is visible on the panel", async ({ page }) => {
    await goToVenueConfig(page);

    const btn = page.getByTestId("venue-tardis-windows-refresh-btn");
    await expect(btn).toBeVisible();
  });

  test("Panel renders without JS error (regression guard)", async ({ page }) => {
    await goToVenueConfig(page);

    await expect(page.getByTestId("venue-tardis-windows-panel")).toBeVisible();
    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });
});
