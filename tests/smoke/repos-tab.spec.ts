/**
 * Smoke: Repos CI page renders against the mock API.
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md Phase 3 (pw:L2 gate).
 */

import { expect, test } from "@playwright/test";

test.describe("Repos CI page", () => {
  test("nav entry routes to /repos and the page renders all panels", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-repos-ci").click();
    await expect(page).toHaveURL(/\/repos$/);
    await expect(page.getByTestId("repo-ci-page")).toBeVisible();
    await expect(page.getByTestId("sit-run-panel")).toBeVisible();
    await expect(page.getByTestId("stuck-panel")).toBeVisible();
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
  });

  test("overview table populates rows with SHA columns + chips", async ({ page }) => {
    await page.goto("/repos");
    const table = page.getByTestId("repo-ci-table");
    await expect(table).toBeVisible();
    await expect(page.getByTestId("repo-row-unified-trading-library")).toBeVisible();
    // Branch short-SHAs render (mock fixtures use abc12* heads).
    await expect(page.getByTestId("repo-row-unified-trading-library")).toContainText("abc1234");
    await expect(page.getByTestId("repo-row-unified-trading-library")).toContainText("MAIN_GREEN");
  });

  test("repo dropdown drill-down renders SHA history and PR cards", async ({ page }) => {
    await page.goto("/repos");
    await page.getByTestId("repo-dropdown").selectOption("execution-service");
    const detail = page.getByTestId("repo-detail");
    await expect(detail).toBeVisible();
    // Three promotion branches of SHA history.
    await expect(detail.getByText("live-defi-rollout", { exact: true })).toBeVisible();
    await expect(detail.getByText("staging", { exact: true })).toBeVisible();
    await expect(detail.getByText("main", { exact: true })).toBeVisible();
    // PR cards with stuck classification render.
    await expect(page.getByTestId("repo-detail-prs")).toBeVisible();
  });

  test("clicking a table row selects the repo for drill-down", async ({ page }) => {
    await page.goto("/repos");
    await page.getByTestId("repo-row-greeks-service").click();
    await expect(page.getByTestId("repo-detail")).toBeVisible();
    await expect(page.getByTestId("repo-detail")).toContainText("greeks-service");
  });
});
