/**
 * Smoke (pw:L2): Artifact Pipeline page (/ops/artifacts) renders against the mock API — all five
 * live tabs' (Pipeline, Deploy timeline, Artifacts, What's running, Health) stat bands + tables +
 * filters, column sort/multi-select filters (Repo / Workload / Service / Area, operator ask
 * 2026-07-23), the date-range picker, and the help dialog.
 * Plan: unified-trading-pm/plans/active/artifact_pipeline_observability_2026_07_17.md (Phase: UI — all five tabs).
 */

import { expect, test } from "@playwright/test";

test.describe("Artifact Pipeline page", () => {
  test("renders the live Pipeline stat band, build rows, and filters", async ({ page }) => {
    await page.goto("/ops/artifacts");
    await expect(page).toHaveURL(/\/ops\/artifacts$/);
    await expect(page.getByTestId("artifact-pipeline-page")).toBeVisible();

    // Defaults to the live What's running tab (operator decision 2026-07-24) — switch to Pipeline
    // to exercise its stat band populated from the mock builds response.
    await page.getByTestId("artifact-tab-pipe").click();
    await expect(page.getByTestId("artifact-pipe-view")).toBeVisible();
    await expect(page.getByTestId("pipe-stat-total")).toContainText("8");
    await expect(page.getByTestId("pipe-stat-failed")).toContainText("1");
    await expect(page.getByTestId("pipe-stat-median")).toContainText("m"); // formatted duration

    // Build rows render, one per build.
    await expect(page.getByTestId("pipe-row").first()).toBeVisible();
    const allRows = await page.getByTestId("pipe-row").count();
    expect(allRows).toBeGreaterThan(1);

    // "Failed only" filter narrows to the single FAILURE row; the stat band stays whole-window.
    await page.getByTestId("pipe-filter-fail").click();
    await expect(page.getByTestId("pipe-row")).toHaveCount(1);
    await expect(page.getByTestId("pipe-row").first()).toContainText("market-tick-data-service");
    await expect(page.getByTestId("pipe-stat-total")).toContainText("8");

    await page.getByTestId("pipe-filter-all").click();
    expect(await page.getByTestId("pipe-row").count()).toBe(allRows);
  });

  test("defaults to the live What's running tab", async ({ page }) => {
    await page.goto("/ops/artifacts");
    await expect(page.getByTestId("artifact-run-view")).toBeVisible();
    await expect(page.getByTestId("run-row").first()).toBeVisible();
    await expect(page.getByTestId("artifact-pipe-view")).toHaveCount(0);
  });

  test("expands a failed build's drawer and switches to another live tab and back", async ({ page }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-pipe").click();
    await page.getByTestId("pipe-filter-fail").click();
    await page.getByTestId("pipe-row").first().click();
    // The drawer's failure detail is unique copy (the heading collides with the filter-bar hint).
    await expect(page.getByText(/COPY failed: no source files/i)).toBeVisible();

    // Switching tabs shows the other live view; coming back restores the pipeline view.
    await page.getByTestId("artifact-tab-run").click();
    await expect(page.getByTestId("artifact-run-view")).toBeVisible();
    await expect(page.getByTestId("artifact-pipe-view")).toHaveCount(0);

    await page.getByTestId("artifact-tab-pipe").click();
    await expect(page.getByTestId("artifact-pipe-view")).toBeVisible();
  });

  test("defaults to a 7-day window; the Deploy timeline tab renders its live stat band and filters", async ({
    page,
  }) => {
    await page.goto("/ops/artifacts");
    // Operator ask 2026-07-23: the page opens on a 7-day window, not 14 — the active pill is
    // filled with the accent color, an inactive one is transparent (rgba(0, 0, 0, 0)).
    const sevenDayPreset = page.getByTestId("artifact-window-7");
    await expect(sevenDayPreset).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await page.getByTestId("artifact-tab-deploy").click();
    await expect(page.getByTestId("artifact-deploy-view")).toBeVisible();
    await expect(page.getByTestId("deploy-stat-total")).toBeVisible();
    await expect(page.getByTestId("deploy-stat-live")).toBeVisible();

    const allRows = await page.getByTestId("deploy-row").count();
    expect(allRows).toBeGreaterThan(0);

    // "Failed / paused" narrows to the never-ready revision; the stat band stays whole-window.
    await page.getByTestId("deploy-filter-fail").click();
    await expect(page.getByTestId("deploy-row")).toHaveCount(1);
    await expect(page.getByTestId("deploy-row").first()).toContainText("deployment-service");

    await page.getByTestId("deploy-filter-all").click();
    expect(await page.getByTestId("deploy-row").count()).toBe(allRows);
  });

  test("the date-range picker drives a refetch and deselects the window presets", async ({ page }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-pipe").click();
    await expect(page.getByTestId("pipe-stat-total")).toBeVisible();

    await page.getByTestId("artifact-range-start").fill("2026-07-01");
    // A hand-picked range takes over — no preset pill reads as selected (transparent) any more.
    await expect(page.getByTestId("artifact-window-7")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    // Picking a preset again clears the custom range and goes back to a `days`-driven window.
    await page.getByTestId("artifact-window-30").click();
    await expect(page.getByTestId("pipe-stat-total")).toBeVisible();
  });

  test("the help dialog explains the page controls and all five live tabs' columns", async ({ page }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-pipe").click();
    await expect(page.getByTestId("pipe-stat-total")).toBeVisible();

    await expect(page.getByText("Artifact Pipeline — quick guide")).toHaveCount(0);
    await page.getByTestId("artifact-help-button").click();
    await expect(page.getByText("Artifact Pipeline — quick guide")).toBeVisible();

    // Every live tab's column glossary is present in the same dialog, not split across several.
    await expect(page.getByText("Pipeline tab — every build")).toBeVisible();
    await expect(page.getByText("Deploy timeline tab — every deploy")).toBeVisible();
    await expect(page.getByText(/expand its full step-by-step timeline/i)).toBeVisible();
    await expect(page.getByText(/never had a successful deploy/i)).toBeVisible();
    await expect(page.getByText("What's running tab — the headline runtime join")).toBeVisible();
    await expect(page.getByText("Artifacts tab — the registry inventory")).toBeVisible();
    await expect(page.getByText(/measured conditions, not a hand-written checklist/i)).toBeVisible();

    // Escape closes it (the Dialog component's own documented behavior).
    await page.keyboard.press("Escape");
    await expect(page.getByText("Artifact Pipeline — quick guide")).toHaveCount(0);
  });

  test("Pipeline: clicking the Repo header sorts rows, and the Repo funnel multi-selects several repos", async ({
    page,
  }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-pipe").click();
    await expect(page.getByTestId("pipe-stat-total")).toBeVisible();
    const allRows = await page.getByTestId("pipe-row").count();

    await page.getByTestId("pipe-th-repo-sort").click();
    await expect(page.getByTestId("pipe-row").first()).toContainText("deployment-api");

    await page.getByTestId("pipe-filter-repo-toggle").click();
    const menu = page.getByTestId("pipe-filter-repo-menu");
    await menu.getByTestId("pipe-filter-repo-opt-deployment-service").locator("input").click();
    await expect(page.getByTestId("pipe-row")).toHaveCount(2);
    for (const row of await page.getByTestId("pipe-row").all()) {
      await expect(row).toContainText("deployment-service");
    }

    await page.getByTestId("pipe-colfilters-clear").click();
    await expect(page.getByTestId("pipe-row")).toHaveCount(allRows);
  });

  test("Pipeline: the Tarball lane filter narrows to real tarball BuildFact rows (Phase 3d)", async ({ page }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-pipe").click();
    await expect(page.getByTestId("pipe-stat-total")).toBeVisible();
    const allRows = await page.getByTestId("pipe-row").count();

    await page.getByTestId("pipe-filter-tarball").click();
    await expect(page.getByTestId("pipe-row")).toHaveCount(1);
    await expect(page.getByTestId("pipe-row").first()).toContainText("features");

    await page.getByTestId("pipe-filter-image").click();
    await expect(page.getByTestId("pipe-row")).toHaveCount(allRows - 1); // every row except the one tarball build

    await page.getByTestId("pipe-filter-all").click();
    await expect(page.getByTestId("pipe-row")).toHaveCount(allRows);
  });

  test("Deploy timeline: the Workload funnel multi-selects a workload, and sort orders by When", async ({ page }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-deploy").click();
    await expect(page.getByTestId("deploy-row").first()).toBeVisible();
    const allRows = await page.getByTestId("deploy-row").count();

    await page.getByTestId("deploy-filter-workload-toggle").click();
    const menu = page.getByTestId("deploy-filter-workload-menu");
    await menu.getByTestId("deploy-filter-workload-opt-deployment-service").locator("input").click();
    await expect(page.getByTestId("deploy-row")).toHaveCount(1);
    await expect(page.getByTestId("deploy-row").first()).toContainText("deployment-service");

    await page.getByTestId("deploy-colfilters-clear").click();
    await expect(page.getByTestId("deploy-row")).toHaveCount(allRows);

    // Ascending "When" sort puts the oldest revision first — the fixture's deployment-service row.
    await page.getByTestId("deploy-th-at-sort").click();
    await expect(page.getByTestId("deploy-row").first()).toContainText("deployment-service");
  });

  test("Artifacts: the registry stat band renders, the Legacy pill filters, and the Repo funnel multi-selects", async ({
    page,
  }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-art").click();
    await expect(page.getByTestId("art-row").first()).toBeVisible();
    const allRows = await page.getByTestId("art-row").count();
    await expect(page.getByTestId("art-stat-total")).toContainText(String(allRows));

    await page.getByTestId("art-filter-legacy").click();
    await expect(page.getByTestId("art-row")).toHaveCount(1);
    await expect(page.getByTestId("art-row").first()).toContainText("retired-legacy-service");
    await page.getByTestId("art-filter-all").click();

    await page.getByTestId("art-filter-repo-toggle").click();
    const menu = page.getByTestId("art-filter-repo-menu");
    await menu.getByTestId("art-filter-repo-opt-deployment-api").locator("input").click();
    await expect(page.getByTestId("art-row")).toHaveCount(1);
    await expect(page.getByTestId("art-row").first()).toContainText("deployment-api");

    await page.getByTestId("art-colfilters-clear").click();
    await expect(page.getByTestId("art-row")).toHaveCount(allRows);
  });

  test("Artifacts: tarball-lane rows render and the Registry funnel isolates them (Phase 3d)", async ({ page }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-art").click();
    await expect(page.getByTestId("art-row").first()).toBeVisible();

    await page.getByTestId("art-filter-registry-col-toggle").click();
    const menu = page.getByTestId("art-filter-registry-col-menu");
    await menu.getByTestId("art-filter-registry-col-opt-gcs-tarball-bucket").locator("input").click();
    await expect(page.getByTestId("art-row")).toHaveCount(1);
    await expect(page.getByTestId("art-row").first()).toContainText("gcs-tarball-bucket");

    await page.getByTestId("art-colfilters-clear").click();
  });

  test("Artifacts: the repo cell's console link opens the right Artifact Registry URL (Phase 3b cross-link)", async ({
    page,
  }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-art").click();
    await expect(page.getByTestId("art-row").first()).toBeVisible();

    const deploymentApiRow = page.getByTestId("art-row").filter({ hasText: "deployment-api" });
    const link = deploymentApiRow.getByTestId("art-console-link");
    await expect(link).toHaveAttribute(
      "href",
      /console\.cloud\.google\.com\/artifacts\/docker\/central-element-323112\/asia-northeast1\/unified-trading-system\/deployment-api/,
    );
  });

  test("What's running: an expanded row cross-links to the registry console and the Deployments view (Phase 3b)", async ({
    page,
  }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-run").click();
    await expect(page.getByTestId("run-row").first()).toBeVisible();

    const pinnedRow = page.getByTestId("run-row").filter({ hasText: "uts-shared-deployment-api" });
    await pinnedRow.click();
    await expect(page.getByTestId("run-console-link")).toHaveAttribute(
      "href",
      /console\.cloud\.google\.com\/artifacts\/docker\/central-element-323112\/asia-northeast1\/unified-trading-system\/deployment-api/,
    );
    await expect(page.getByTestId("run-deployments-link")).toHaveAttribute("href", "/deployments?git_commit=a557471");
  });

  test("What's running: the drift stat band renders, Floating filters, a row expands, and Service multi-selects", async ({
    page,
  }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-run").click();
    await expect(page.getByTestId("run-row").first()).toBeVisible();
    const allRows = await page.getByTestId("run-row").count();
    await expect(page.getByTestId("run-stat-services")).toContainText(String(allRows));

    await page.getByTestId("run-filter-floating").click();
    await expect(page.getByTestId("run-row")).toHaveCount(1);
    await page.getByTestId("run-row").first().click();
    await expect(page.getByText(/no SHA-traceable tag/i)).toBeVisible();
    await page.getByTestId("run-filter-all").click();

    await page.getByTestId("run-filter-service-toggle").click();
    const menu = page.getByTestId("run-filter-service-menu");
    await menu.getByTestId("run-filter-service-opt-greeks-service").locator("input").click();
    await expect(page.getByTestId("run-row")).toHaveCount(1);
    await expect(page.getByTestId("run-row").first()).toContainText("greeks-service");
  });

  test("Health: the severity stat band renders, the High pill filters, and the Area funnel multi-selects", async ({
    page,
  }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("artifact-tab-health").click();
    await expect(page.getByTestId("health-row").first()).toBeVisible();
    const allRows = await page.getByTestId("health-row").count();
    await expect(page.getByTestId("health-stat-defects")).toBeVisible();

    await page.getByTestId("health-filter-high").click();
    await expect(page.getByTestId("health-row")).toHaveCount(1);
    await expect(page.getByTestId("health-row").first()).toContainText("never went ready");
    await page.getByTestId("health-filter-all").click();

    await page.getByTestId("health-filter-area-toggle").click();
    const menu = page.getByTestId("health-filter-area-menu");
    await menu.getByTestId("health-filter-area-opt-running · GCP").locator("input").click();
    await expect(page.getByTestId("health-row")).toHaveCount(2); // the floating + hand-deploy conditions

    await page.getByTestId("health-colfilters-clear").click();
    await expect(page.getByTestId("health-row")).toHaveCount(allRows);
  });
});
