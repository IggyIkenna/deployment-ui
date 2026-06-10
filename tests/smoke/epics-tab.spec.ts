/**
 * Smoke + regression: Epics tab v2 — live PM epics + plan drilldown (replaces the stale
 * archived-codex asset-class view). Guards epic cards render, drilldown expands to plan
 * rows, and the orphan (no parent_epic) strip surfaces.
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md Phase 2 "Epics tab v2".
 */

import { expect, test } from "@playwright/test";

test.describe("Epics tab v2", () => {
  test("Epics tab renders live PM epic cards (not the stale asset-class view)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Epics" }).click();
    await expect(page.getByTestId("epics-plans-page")).toBeVisible();
    // Live PM epics (by frontmatter name), NOT the archived defi/cefi/tradfi/sports yamls.
    await expect(page.getByTestId("epic-card-observability_master")).toBeVisible();
    await expect(page.getByTestId("epic-card-orchestrator_master")).toBeVisible();
  });

  test("epic card expands to its active-plan drilldown", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Epics" }).click();
    await page.getByTestId("epic-toggle-observability_master").click();
    await expect(page.getByTestId("epic-plan-ci_dashboard_deployment_ui_2026_06_10")).toBeVisible();
  });

  test("orphan plans (no parent_epic) surface as a review-blocking strip", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Epics" }).click();
    const orphans = page.getByTestId("epics-orphans");
    await expect(orphans).toBeVisible();
    await expect(orphans).toContainText("no `parent_epic`");
  });
});
