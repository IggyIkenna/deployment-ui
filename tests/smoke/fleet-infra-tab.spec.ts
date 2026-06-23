/**
 * Smoke tests for the Fleet Infra tab (6th LandingTab, route /infra).
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md — [UI] P2 regression guard.
 */

import { expect, test } from "@playwright/test";

test("nav tab routes to /infra and renders infra tile grid", async ({ page }) => {
  await page.goto("/home");
  await page.getByTestId("landing-fleet-infra-tab-trigger").click();
  await expect(page).toHaveURL(/\/infra$/);
  await expect(page.getByTestId("fleet-infra-page")).toBeVisible();
  await expect(page.getByTestId("infra-tiles")).toBeVisible();
});

test("deep-link to /infra opens the Infra tab directly", async ({ page }) => {
  await page.goto("/infra");
  await expect(page.getByTestId("fleet-infra-page")).toBeVisible();
  await expect(page.getByTestId("landing-fleet-infra-tab-trigger")).toHaveAttribute("aria-selected", "true");
});

test("infra tile vms-running shows host count from mock fleet data", async ({ page }) => {
  await page.goto("/infra");
  await expect(page.getByTestId("infra-tile-vms-running")).toBeVisible();
  // mock returns hosts=1, so tile value should be "1"
  await expect(page.getByTestId("infra-tile-vms-running")).toContainText("1");
});

test("infra tile central-vm shows UP when orchestrator is available in mock", async ({ page }) => {
  await page.goto("/infra");
  await expect(page.getByTestId("infra-tile-central-vm")).toBeVisible();
  // mockFleetGitHealth available=true
  await expect(page.getByTestId("infra-tile-central-vm")).toContainText("UP");
});

test("infra tile fleet-git reflects dirty/drift state from mock", async ({ page }) => {
  await page.goto("/infra");
  await expect(page.getByTestId("infra-tile-fleet-git")).toBeVisible();
  // mockFleetGitHealth summary.dirty=1 → tile value "DIRTY"
  await expect(page.getByTestId("infra-tile-fleet-git")).toContainText("DIRTY");
});

test("infra tile ci-status reflects stuck-PR count from mock", async ({ page }) => {
  await page.goto("/infra");
  await expect(page.getByTestId("infra-tile-ci-status")).toBeVisible();
  // mockRepoCiOverview has multiple stuck PRs → tile shows "STUCK"
  await expect(page.getByTestId("infra-tile-ci-status")).toContainText("STUCK");
});

test("clicking fleet-git tile navigates to /fleet", async ({ page }) => {
  await page.goto("/infra");
  await page.getByTestId("infra-tile-fleet-git").click();
  await expect(page).toHaveURL(/\/fleet$/);
});

test("clicking ci-status tile navigates to /repos", async ({ page }) => {
  await page.goto("/infra");
  await page.getByTestId("infra-tile-ci-status").click();
  await expect(page).toHaveURL(/\/repos$/);
});
