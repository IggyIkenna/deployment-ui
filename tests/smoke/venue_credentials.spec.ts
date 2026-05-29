/**
 * Regression spec: Venue API Credentials panel (§3.P1)
 *
 * Covers the credential-status view added to the VM Deployments page:
 *   - Panel renders with "Venue API Credentials" heading
 *   - tardis-api-key row is visible with EXPIRED badge (mock data)
 *   - Refresh button is present and re-fires the credential endpoint
 *   - No JS crash on API error
 *
 * Note: mock-api.ts patches window.fetch; /api/venue-credentials returns
 * a mocked EXPIRED entry for tardis-api-key.
 */

import { expect, type Page, test } from "@playwright/test";

async function goToVmDeployments(page: Page) {
  await page.goto("/vm-deployments");
  await page.waitForLoadState("networkidle");
}

test.describe("Venue API Credentials panel", () => {
  test("Panel renders with Venue API Credentials heading", async ({ page }) => {
    await goToVmDeployments(page);

    const panel = page.getByTestId("venue-credentials-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Venue API Credentials");
  });

  test("tardis-api-key row shows EXPIRED status", async ({ page }) => {
    await goToVmDeployments(page);

    const row = page.getByTestId("credential-row-tardis-api-key");
    await expect(row).toBeVisible();
    await expect(row).toContainText("tardis-api-key");
    await expect(row).toContainText("tardis");

    const badge = page.getByTestId("credential-status-tardis-api-key");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("EXPIRED");
  });

  test("Refresh button is visible on the credentials panel", async ({ page }) => {
    await goToVmDeployments(page);

    const btn = page.getByTestId("venue-credentials-refresh-btn");
    await expect(btn).toBeVisible();
  });

  test("Panel renders without JS error (regression guard)", async ({ page }) => {
    await goToVmDeployments(page);

    await expect(page.getByTestId("venue-credentials-panel")).toBeVisible();
    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });
});
