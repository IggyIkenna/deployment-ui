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

  test("CI status chip annotates WHICH branch is failing (branch_ci)", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    // execution-service is FAILING with main red → chip reads "FAILING (main)" (recovering shape).
    await expect(page.getByTestId("repo-row-execution-service")).toContainText("FAILING (main)");
    // strategy-service is STAGING_GREEN with LDR red → chip reads "STAGING_GREEN (LDR)" (actively broken).
    await expect(page.getByTestId("repo-row-strategy-service")).toContainText("STAGING_GREEN (LDR)");
    // a clean repo shows the bare status, no branch suffix.
    await expect(page.getByTestId("repo-row-unified-trading-library")).not.toContainText("(");
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
    // Click the repo-NAME cell (not a SHA/CI link — those deep-link to GitHub and
    // stopPropagation, so a row-center click lands on a link, not the row select).
    await page.getByTestId("repo-row-greeks-service").getByText("greeks-service", { exact: true }).click();
    await expect(page.getByTestId("repo-detail")).toBeVisible();
    await expect(page.getByTestId("repo-detail")).toContainText("greeks-service");
  });

  test("Repos CI is a landing tab in the home shell, not a separate page", async ({ page }) => {
    // Regression: operator add 2026-06-10 — /repos must render as a sibling tab of
    // Overview/Epics inside the deployment-ui home shell, not a standalone full-page app.
    await page.goto("/");
    // Sibling landing tabs prove this is the unified home shell, not a separate UI.
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Epics" })).toBeVisible();
    await page.getByTestId("landing-repos-ci-tab-trigger").click();
    await expect(page).toHaveURL(/\/repos$/);
    const tab = page.getByTestId("landing-repos-ci-tab");
    await expect(tab).toBeVisible();
    await expect(tab.getByTestId("repo-ci-page")).toBeVisible();
    await expect(tab.getByTestId("repo-ci-table")).toBeVisible();
    // Overview tab is still a reachable sibling — confirms tab integration, not a route swap.
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
  });

  test("deep-link to /repos opens the Repos CI landing tab in the home shell", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("landing-repos-ci-tab")).toBeVisible();
    await expect(page.getByTestId("repo-ci-page")).toBeVisible();
    // The home shell's sibling tabs are present (proves shell, not standalone page).
    await expect(page.getByRole("tab", { name: "Epics" })).toBeVisible();
  });

  test("per-service CI tab renders the same drill-down in service context", async ({ page }) => {
    await page.goto("/");
    // Select a service from the home-view sidebar, then open its CI tab. The sidebar
    // item carries a stable testid (the overview table is not auto-fetched), so this
    // is robust under the mock API.
    await page.getByTestId("service-item-market-tick-data-service").click();
    await page.getByTestId("service-ci-tab-trigger").click();
    const tab = page.getByTestId("service-ci-tab");
    await expect(tab).toBeVisible();
    await expect(tab.getByTestId("repo-detail")).toBeVisible();
    await expect(tab.getByTestId("repo-detail")).toContainText("market-tick-data-service");
  });

  // Operator click-through rule (2026-06-10): SHA/CI atoms deep-link to GitHub.
  test("branch SHAs link to their GitHub commit pages", async ({ page }) => {
    await page.goto("/repos");
    const row = page.getByTestId("repo-row-unified-trading-library");
    const shaLink = row.getByRole("link", { name: "abc1234" });
    await expect(shaLink).toHaveAttribute("href", /github\.com\/IggyIkenna\/unified-trading-library\/commit\/abc1234/);
  });

  // Operator errors[] visibility (2026-06-10): degraded repos are shown, not silent.
  test("degraded-repos strip surfaces a per-repo GitHub-5xx degradation", async ({ page }) => {
    await page.goto("/repos");
    const degraded = page.getByTestId("repo-ci-degraded");
    await expect(degraded).toBeVisible();
    await expect(degraded).toContainText("ml-service");
  });

  // Operator cross-link rule (2026-06-10): repo drill-down deep-links the existing surfaces.
  test("repo drill-down cross-links to GitHub / data-status / fleet", async ({ page }) => {
    await page.goto("/repos");
    await page.getByTestId("repo-dropdown").selectOption("execution-service");
    const links = page.getByTestId("repo-detail-crosslinks");
    await expect(links).toBeVisible();
    await expect(links.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/IggyIkenna/execution-service",
    );
    await expect(page.getByTestId("repo-detail-fleet-link")).toHaveAttribute("href", "/fleet");
  });
});
