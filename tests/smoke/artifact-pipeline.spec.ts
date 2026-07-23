/**
 * Smoke (pw:L2): Artifact Pipeline page (/ops/artifacts) renders against the mock API — the live
 * Pipeline (builds) and Deploy timeline tabs' stat bands + tables + filters, the date-range picker,
 * and the not-yet-wired tabs' placeholder.
 * Plan: unified-trading-pm/plans/active/artifact_pipeline_observability_2026_07_17.md (Phase: UI — Pipeline + Deploys tabs).
 */

import { expect, test } from "@playwright/test";

test.describe("Artifact Pipeline page", () => {
  test("renders the live Pipeline stat band, build rows, and filters", async ({ page }) => {
    await page.goto("/ops/artifacts");
    await expect(page).toHaveURL(/\/ops\/artifacts$/);
    await expect(page.getByTestId("artifact-pipeline-page")).toBeVisible();

    // Defaults to the live Pipeline tab: stat band populated from the mock builds response.
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

  test("expands a failed build's drawer and switches to a placeholder tab and back", async ({ page }) => {
    await page.goto("/ops/artifacts");
    await page.getByTestId("pipe-filter-fail").click();
    await page.getByTestId("pipe-row").first().click();
    // The drawer's failure detail is unique copy (the heading collides with the filter-bar hint).
    await expect(page.getByText(/COPY failed: no source files/i)).toBeVisible();

    // A not-yet-wired tab shows the honest placeholder; the live tab restores the pipeline view.
    await page.getByTestId("artifact-tab-run").click();
    await expect(page.getByTestId("artifact-placeholder")).toBeVisible();
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
    await expect(page.getByTestId("pipe-stat-total")).toBeVisible();

    await page.getByTestId("artifact-range-start").fill("2026-07-01");
    // A hand-picked range takes over — no preset pill reads as selected (transparent) any more.
    await expect(page.getByTestId("artifact-window-7")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    // Picking a preset again clears the custom range and goes back to a `days`-driven window.
    await page.getByTestId("artifact-window-30").click();
    await expect(page.getByTestId("pipe-stat-total")).toBeVisible();
  });
});
