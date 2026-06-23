/**
 * Smoke + regression: Alerts page — unified alert lifecycle traceability.
 *
 * The /alerts page now consumes GET /api/alerts (unified ledger, all alert classes)
 * rather than the CI-only /api/repo-ci/alerts. INFRA P1 (alert_quality_overhaul_2026_06_18.md)
 * will add non-CI alert kinds; this spec covers the CI subset (current mock data) + the
 * domain chip and unified-endpoint wiring.
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md (unified ledger UI P1).
 */

import { expect, test } from "@playwright/test";

test.describe("Alerts page", () => {
  test("cockpit Alerts tile routes to /alerts which renders as a home-shell tab", async ({ page }) => {
    await page.goto("/cockpit");
    await page.getByTestId("cockpit-tile-alerts").click();
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

  test("unified endpoint: domain chip appears on every stream and timeline entry", async ({ page }) => {
    await page.goto("/alerts");
    // Every stream row must have a domain chip.
    const streamChips = page.getByTestId("alert-streams").locator('[data-testid="alert-domain-chip"]');
    await expect(streamChips.first()).toBeVisible();
    // CI alerts are labelled "CI" by the kindLabel() helper.
    await expect(streamChips.first()).toContainText("CI");
    // Timeline entries also carry domain chips.
    const timelineChip = page.getByTestId("alert-entry-0").getByTestId("alert-domain-chip");
    await expect(timelineChip).toBeVisible();
    await expect(timelineChip).toContainText("CI");
  });

  test("unified endpoint: source badge shown after load", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByTestId("alerts-source-badge")).toBeVisible();
    // Mock mode returns source="mock" which maps to the green badge.
    await expect(page.getByTestId("alerts-source-badge")).toContainText("MOCK");
  });

  test("page heading reflects unified traceability (not CI-only)", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByTestId("alerts-page").locator("h1")).toContainText("unified traceability");
  });
});
