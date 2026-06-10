/**
 * Smoke + regression: URL ↔ view synchronization — one page, synchronized tabs
 * (operator 2026-06-10: "not jumping from one screen to another").
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md / monitoring master (single devops pane).
 */

import { expect, test } from "@playwright/test";

test.describe("URL ↔ view sync", () => {
  test("selecting a service puts it in the URL; tab clicks update the URL", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("service-item-market-tick-data-service").click();
    await expect(page).toHaveURL(/\/service\/market-tick-data-service\/deploy$/);
    await page.getByRole("tab", { name: "Data Status" }).click();
    await expect(page).toHaveURL(/\/service\/market-tick-data-service\/data-status$/);
  });

  test("deep link to /service/{name}/{tab} restores the exact view", async ({ page }) => {
    await page.goto("/service/market-tick-data-service/ci");
    await expect(page.getByTestId("service-ci-tab")).toBeVisible();
    await expect(page.getByTestId("service-ci-tab").getByTestId("repo-detail")).toBeVisible();
  });

  test("landing paths clear the service selection (no URL/view desync)", async ({ page }) => {
    // The reported bug: URL said /repos while the screen showed a service view.
    await page.goto("/service/market-tick-data-service/deploy");
    await page.getByTestId("nav-repos-ci").click();
    await expect(page).toHaveURL(/\/repos$/);
    await expect(page.getByTestId("landing-repos-ci-tab")).toBeVisible();
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
  });

  test("epics tab is URL-synced like its siblings", async ({ page }) => {
    // Deep-link first (the durable property): /epics selects the Epics tab.
    await page.goto("/epics");
    await expect(page.getByRole("tab", { name: "Epics" })).toHaveAttribute("aria-selected", "true");
    // Then the click direction: tablist is stable once the trigger is attached + visible.
    await page.goto("/");
    const epics = page.getByRole("tab", { name: "Epics" });
    await expect(epics).toBeVisible();
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    await epics.click();
    await expect(epics).toHaveAttribute("aria-selected", "true", { timeout: 15000 });
    await page.waitForURL(/\/epics$/, { timeout: 15000 });
  });

  test("browser back returns from service view to the landing tab", async ({ page }) => {
    await page.goto("/repos");
    await page.getByTestId("repo-dropdown").selectOption("execution-service");
    await page.goto("/service/execution-service/builds");
    await page.goBack();
    await expect(page).toHaveURL(/\/repos$/);
    await expect(page.getByTestId("landing-repos-ci-tab")).toBeVisible();
  });
});
