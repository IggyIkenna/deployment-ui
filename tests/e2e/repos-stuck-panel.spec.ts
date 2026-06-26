/**
 * Regression guard: the stuck triage panel renders ALL stuck classes + stuck-in-SIT +
 * the live SIT-run panel (operator adds 2026-06-10 — guards reverting these features).
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md Phase 3.
 */

import { expect, test } from "@playwright/test";

test.describe("Repos CI — stuck panel regression", () => {
  test("all five stuck-PR classes render in the triage queue", async ({ page }) => {
    await page.goto("/repos");
    const panel = page.getByTestId("stuck-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("stuck-class-conflicting")).toBeVisible();
    await expect(panel.getByTestId("stuck-class-v2_never_reported")).toBeVisible();
    await expect(panel.getByTestId("stuck-class-skip_ci_jammed")).toBeVisible();
    // failing_check can appear on multiple PRs simultaneously (e.g. unified-trading-pm#547 +
    // execution-service#89); .first() avoids a strict-mode violation while still guarding render.
    await expect(panel.getByTestId("stuck-class-failing_check").first()).toBeVisible();
    await expect(panel.getByTestId("stuck-class-automerge_stuck")).toBeVisible();
  });

  test("stuck-in-SIT repos render as first-class triage entries", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("stuck-in-sit-greeks-service")).toBeVisible();
    await expect(page.getByTestId("stuck-class-stuck_in_sit")).toBeVisible();
  });

  test("live SIT-run panel shows per-repo job breakdown (alert-parity)", async ({ page }) => {
    await page.goto("/repos");
    const jobs = page.getByTestId("sit-run-jobs");
    await expect(jobs).toBeVisible();
    // Pass / fail / in-progress all visible simultaneously — continuous state, not a failure alert.
    await expect(jobs.getByText("sit / unified-trading-library")).toBeVisible();
    await expect(jobs.getByText("sit / greeks-service")).toBeVisible();
    await expect(jobs.getByText("sit / execution-service")).toBeVisible();
  });

  test("stuck PR entries link out and carry repo#number + age", async ({ page }) => {
    await page.goto("/repos");
    const entry = page.getByTestId("stuck-pr-market-tick-data-service-41");
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("market-tick-data-service#41");
    await expect(entry).toContainText("1h 35m");
  });
});
