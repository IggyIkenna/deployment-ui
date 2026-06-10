/**
 * Smoke: GitHub rate-budget tracker on the repos surface (RepoCoverageTab header).
 *
 * The whole fleet shares ONE GitHub PAT (5000/hr REST budget); when low, every
 * GitHub caller 403s. This guard asserts the tracker renders on the repos/coverage
 * tab and reflects a healthy (green REST) vs low (amber/red GraphQL) budget from
 * GET /api/repos/gh-rate-limit (mock seeds core=4200/5000, graphql=600/5000).
 *
 * Plan: gh_rate_budget_tracker_deployment_ui_2026_06_11.md (pw:L2 gate).
 */

import { expect, Page, test } from "@playwright/test";

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  gcs_fuse: { active: true, reason: "mounted" },
};

const MOCK_SERVICES = [
  {
    name: "deployment-api",
    description: "Deployment orchestration API",
    dimensions: [],
    docker_image: "gcr.io/project/deployment-api:latest",
    cloud_run_job_name: "deployment-api",
  },
];

// Healthy REST pool (84% -> green) + low GraphQL pool (12% -> amber) so the
// tracker's tone mapping is observable in the smoke run.
const MOCK_GH_RATE = {
  fetched_at: "2026-06-11T12:00Z",
  resources: {
    core: { limit: 5000, remaining: 4200, used: 800, reset: 1_780_000_000 },
    graphql: { limit: 5000, remaining: 600, used: 4400, reset: 1_780_000_000 },
    search: { limit: 30, remaining: 30, used: 0, reset: 1_780_000_000 },
  },
};

async function mockRepoRoutes(page: Page) {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({ json: MOCK_HEALTH });
  });
  await page.route("**/api/services", async (route) => {
    await route.fulfill({ json: MOCK_SERVICES });
  });
  await page.route("**/api/repos/coverage", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/repos/gh-rate-limit", async (route) => {
    await route.fulfill({ json: MOCK_GH_RATE });
  });
}

async function navigateToRepoCoverageTab(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByText("deployment api").first().click();
  await page.getByRole("tab", { name: "Coverage", exact: true }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("GitHub rate-budget tracker smoke", () => {
  test.beforeEach(async ({ page }) => {
    await mockRepoRoutes(page);
  });

  test("tracker renders on the repos/coverage tab with REST + GraphQL pools", async ({ page }) => {
    await navigateToRepoCoverageTab(page);
    const budget = page.getByTestId("gh-rate-budget");
    await expect(budget).toBeVisible();
    await expect(page.getByTestId("gh-rate-budget-pool-core")).toContainText("4200/5000");
    await expect(page.getByTestId("gh-rate-budget-pool-graphql")).toContainText("600/5000");
  });

  test("a low budget pool reflects a non-green tone (operator can SEE it is low)", async ({ page }) => {
    await navigateToRepoCoverageTab(page);
    // GraphQL is at 12% -> amber; REST is at 84% -> green. Assert the remaining/limit
    // atoms carry distinct inline colours (the tone mapper is exercised end-to-end).
    const restColor = await page
      .getByTestId("gh-rate-budget-pool-core")
      .locator(".font-mono")
      .evaluate((el) => (el as HTMLElement).style.color);
    const graphqlColor = await page
      .getByTestId("gh-rate-budget-pool-graphql")
      .locator(".font-mono")
      .evaluate((el) => (el as HTMLElement).style.color);
    expect(restColor).not.toBe("");
    expect(graphqlColor).not.toBe("");
    expect(restColor).not.toBe(graphqlColor);
  });
});
