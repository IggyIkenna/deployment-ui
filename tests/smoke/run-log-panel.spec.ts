/**
 * Smoke: RunLogPanel on DeploymentDetail — the actual run.log viewer (WS-4 decision 3),
 * separate from the lifecycle-events panel below it. Regression guard for
 * deployment_ui_vm_log_viewer_2026_07_20.md [UI] P0.
 *
 * Guards: size + capped tail render for a VM with a resolvable log, the archive-fallback
 * banner shows when the live path missed its 14-day TTL, the honest "no log available"
 * state for a VM with no resolvable log (never a silent blank panel), and the download
 * button opens a signed URL without routing the object through the API.
 */
import { expect, test } from "@playwright/test";

test.describe("RunLogPanel — run.log viewer on DeploymentDetail", () => {
  test("a VM with a resolvable live log shows size + capped tail", async ({ page }) => {
    await page.goto("/deployments/cefi-backfill-20260620");
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();
    await expect(page.getByTestId("run-log-panel")).toBeVisible();
    await expect(page.getByTestId("run-log-size")).toContainText("KB");
    await expect(page.getByTestId("run-log-tail")).toContainText("cefi-backfill-20260620 run.log line 1");
    await expect(page.getByTestId("run-log-tail-label")).toContainText("last 12 lines of");
    await expect(page.getByTestId("run-log-archive-notice")).toHaveCount(0);
    await expect(page.getByTestId("run-log-download")).toBeEnabled();
  });

  test("the archive-fallback state shows the honest 14-day-TTL banner", async ({ page }) => {
    await page.goto("/deployments/sports-backfill-20260621");
    await expect(page.getByTestId("run-log-panel")).toBeVisible();
    await expect(page.getByTestId("run-log-archive-notice")).toBeVisible();
    await expect(page.getByTestId("run-log-archive-notice")).toContainText("14-day TTL");
    await expect(page.getByTestId("run-log-tail")).toContainText("run.log line 1");
  });

  test("a VM with no resolvable log shows the honest 'no log available' state, never a blank panel", async ({
    page,
  }) => {
    await page.goto("/deployments/mtds-perp-funding-backfill");
    await expect(page.getByTestId("run-log-panel")).toBeVisible();
    await expect(page.getByTestId("run-log-empty")).toBeVisible();
    await expect(page.getByTestId("run-log-tail")).toHaveCount(0);
    await expect(page.getByTestId("run-log-download")).toBeDisabled();
  });

  test("download opens the signed URL directly (no server-side stream)", async ({ page, context }) => {
    await page.goto("/deployments/cefi-backfill-20260620");
    await expect(page.getByTestId("run-log-download")).toBeEnabled();
    const [popup] = await Promise.all([context.waitForEvent("page"), page.getByTestId("run-log-download").click()]);
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    expect(popup.url()).toContain("storage.googleapis.com");
    expect(popup.url()).toContain("run.log");
    await popup.close();
  });
});
