/**
 * Smoke tests for the Fleet Infra tab (6th LandingTab, route /infra).
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md — [UI] P2 regression guard.
 */

import { expect, test } from "@playwright/test";

test("the top bar's Fleet tab renders the infra tile grid", async ({ page }) => {
  // Fleet Infra was a LandingTabs tab; that bar is gone (2026-07-17). The infra view is a
  // section INSIDE the cockpit Fleet tab now, and /infra redirects there.
  await page.goto("/cockpit");
  await page.getByTestId("cockpit-tab-fleet").click();
  await expect(page).toHaveURL(/\/cockpit\?tab=fleet$/);
  await expect(page.getByTestId("cockpit-fleet-infra")).toBeVisible();
  await expect(page.getByTestId("fleet-infra-page")).toBeVisible();
  await expect(page.getByTestId("infra-tiles")).toBeVisible();
});

test("deep-link to /infra redirects onto the Fleet tab", async ({ page }) => {
  await page.goto("/infra");
  await expect(page).toHaveURL(/\/cockpit\?tab=fleet$/);
  await expect(page.getByTestId("fleet-infra-page")).toBeVisible();
  await expect(page.getByTestId("cockpit-tab-fleet")).toHaveAttribute("aria-current", "page");
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

test("clicking fleet-git tile lands on the Fleet surface", async ({ page }) => {
  // The tile still links /fleet — which redirects onto the cockpit Fleet tab (2026-07-17).
  await page.goto("/infra");
  await page.getByTestId("infra-tile-fleet-git").click();
  await expect(page).toHaveURL(/\/cockpit\?tab=fleet$/);
  await expect(page.getByTestId("cockpit-fleet-git")).toBeVisible();
});

test("clicking ci-status tile lands on the CI surface", async ({ page }) => {
  // The tile still links /repos — which redirects onto the cockpit CI tab (2026-07-17).
  await page.goto("/infra");
  await page.getByTestId("infra-tile-ci-status").click();
  await expect(page).toHaveURL(/\/cockpit\?tab=ci$/);
  await expect(page.getByTestId("cockpit-ci")).toBeVisible();
});
