/**
 * Smoke + regression: Alerts page — Slack-alert lifecycle traceability
 * (operator requirement 2026-06-10: every alert traceable; current + previous state).
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md (alert-history mirror v1).
 */

import { expect, test } from "@playwright/test";

test.describe("Alerts page", () => {
  test("nav routes to /alerts and both panels render", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-alerts").click();
    await expect(page).toHaveURL(/\/alerts$/);
    await expect(page.getByTestId("alerts-page")).toBeVisible();
    await expect(page.getByTestId("alert-streams")).toBeVisible();
    await expect(page.getByTestId("alert-timeline")).toBeVisible();
  });

  test("lifecycle stream shows previous -> current state pair (traceability)", async ({ page }) => {
    await page.goto("/alerts");
    const stream = page.getByTestId("alert-stream-unified-trading-pm-ci-status-update");
    await expect(stream).toBeVisible();
    // The FAILED page is the PREVIOUS state, the recovery is the CURRENT state.
    await expect(stream.getByTestId("stream-previous")).toContainText("CRITICAL");
    await expect(stream.getByTestId("stream-current")).toContainText("INFO");
  });

  test("worst current state sorts first; timeline is newest-first with run links", async ({ page }) => {
    await page.goto("/alerts");
    const firstStream = page.getByTestId("alert-streams").locator('[data-testid^="alert-stream-"]').first();
    await expect(firstStream.getByTestId("stream-current")).toContainText("CRITICAL");
    const firstEntry = page.getByTestId("alert-entry-0");
    await expect(firstEntry).toContainText("quality-gates-v2 FAILED on main");
    await expect(firstEntry.locator("a")).toHaveAttribute("href", /actions\/runs/);
  });
});
