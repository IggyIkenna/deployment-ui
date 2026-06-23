/**
 * Smoke: GitHub rate-budget tracker on the Repos-CI page (/repos, RepoCiContent header).
 *
 * The whole fleet shares ONE GitHub PAT (5000/hr REST budget); when low, every
 * GitHub caller 403s. This guard asserts the tracker renders on the Repos-CI page
 * (the dedicated repos+CI dashboard) and reflects a healthy (green REST) vs low
 * (amber GraphQL) budget from GET /api/repos/gh-rate-limit (core=4200/5000,
 * graphql=600/5000).
 *
 * Plan: gh_rate_budget_reduction_2026_06_10.md (pw:L2 gate).
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
// tracker's tone mapping is observable in the smoke run. The `app` block is the
// GitHub App ("uts-ci-poller") pool — a SEPARATE 5000/hr budget — so the smoke
// run asserts BOTH the PAT and App rows render side by side.
const MOCK_GH_RATE = {
  fetched_at: "2026-06-11T12:00Z",
  resources: {
    core: { limit: 5000, remaining: 4200, used: 800, reset: 1_780_000_000 },
    graphql: { limit: 5000, remaining: 600, used: 4400, reset: 1_780_000_000 },
    search: { limit: 30, remaining: 30, used: 0, reset: 1_780_000_000 },
  },
  app: {
    resources: {
      core: { limit: 5000, remaining: 4950, used: 50, reset: 1_780_000_000 },
      graphql: { limit: 5000, remaining: 5000, used: 0, reset: 1_780_000_000 },
    },
  },
};

async function mockRepoRoutes(page: Page) {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({ json: MOCK_HEALTH });
  });
  await page.route("**/api/services", async (route) => {
    await route.fulfill({ json: MOCK_SERVICES });
  });
  // The dev server runs VITE_MOCK_API=true, so mock-api.ts supplies a complete
  // repo-ci overview — don't shadow it. GhRateBudget does a RAW fetch, so we
  // intercept just the rate-limit endpoint to pin the asserted budget values.
  await page.route("**/api/repos/gh-rate-limit", async (route) => {
    await route.fulfill({ json: MOCK_GH_RATE });
  });
}

async function navigateToReposCi(page: Page) {
  // The Repos-CI page is the "Repos CI" LandingTabs tab (URL-synced to /repos).
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("landing-repos-ci-tab-trigger").click();
  await expect(page.getByTestId("repo-ci-page")).toBeVisible();
}

test.describe("GitHub rate-budget tracker smoke", () => {
  test.beforeEach(async ({ page }) => {
    await mockRepoRoutes(page);
  });

  test("tracker renders on the Repos-CI page with REST + GraphQL pools", async ({ page }) => {
    await navigateToReposCi(page);
    const budget = page.getByTestId("gh-rate-budget");
    await expect(budget).toBeVisible();
    await expect(page.getByTestId("gh-rate-budget-pool-core")).toContainText("4200/5000");
    await expect(page.getByTestId("gh-rate-budget-pool-graphql")).toContainText("600/5000");
  });

  test("renders BOTH the PAT and the App pool (separate budget) side by side", async ({ page }) => {
    await navigateToReposCi(page);
    // PAT row (the shared user token, fleet-wide 403 source).
    await expect(page.getByTestId("gh-rate-budget-pat")).toBeVisible();
    await expect(page.getByTestId("gh-rate-budget-pool-core")).toContainText("4200/5000");
    // App row (uts-ci-poller installation-token pool — separate 5000/hr budget).
    await expect(page.getByTestId("gh-rate-budget-app")).toBeVisible();
    await expect(page.getByTestId("gh-rate-budget-app-pool-core")).toContainText("4950/5000");
    await expect(page.getByTestId("gh-rate-budget-app-pool-graphql")).toContainText("5000/5000");
  });

  test("a low budget pool reflects a non-green tone (operator can SEE it is low)", async ({ page }) => {
    await navigateToReposCi(page);
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
