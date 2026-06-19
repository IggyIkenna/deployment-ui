/**
 * Smoke + regression: Alerts page — Slack-alert lifecycle traceability
 * (operator requirement 2026-06-10: every alert traceable; current + previous state).
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md (alert-history mirror v1).
 * Updated 2026-06-19: page now consumes /api/alerts (unified ledger) not /api/repo-ci/alerts.
 */

import { expect, test } from "@playwright/test";

test.describe("Alerts page", () => {
  test("nav routes to /alerts which renders as a home-shell tab", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-alerts").click();
    await expect(page).toHaveURL(/\/alerts$/);
    await expect(page.getByTestId("landing-alerts-tab")).toBeVisible();
    await expect(page.getByTestId("alerts-page")).toBeVisible();
    await expect(page.getByTestId("alert-streams")).toBeVisible();
    await expect(page.getByTestId("alert-timeline")).toBeVisible();
  });

  test("alerts tab trigger sits beside Overview/Epics/Repos CI (single pane)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-alerts-tab-trigger").click();
    await expect(page).toHaveURL(/\/alerts$/);
    await expect(page.getByTestId("alerts-page")).toBeVisible();
  });

  test("page calls the unified /api/alerts endpoint (not /api/repo-ci/alerts)", async ({ page }) => {
    // Regression guard: ensures the page reads from the unified alert ledger.
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));
    await page.goto("/alerts");
    await expect(page.getByTestId("alerts-page")).toBeVisible();
    // Wait a tick for the fetch to fire.
    await page.waitForTimeout(500);
    const hasUnified = requests.some((u) => u.includes("/api/alerts") && !u.includes("/repo-ci/alerts"));
    expect(hasUnified, "page must call /api/alerts, not /api/repo-ci/alerts").toBe(true);
    const hasLegacy = requests.some((u) => u.includes("/api/repo-ci/alerts"));
    expect(hasLegacy, "page must NOT call /api/repo-ci/alerts").toBe(false);
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
