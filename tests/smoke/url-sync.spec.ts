/**
 * Smoke + regression: URL ↔ view synchronization — one page, synchronized tabs
 * (operator 2026-06-10: "not jumping from one screen to another").
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md / monitoring master (single devops pane).
 */

import { expect, test } from "@playwright/test";

test.describe("URL ↔ view sync", () => {
  test("selecting a service puts it in the URL; tab clicks update the URL", async ({ page }) => {
    await page.goto("/home");
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

  test("leaving a service view for another surface clears the selection (no URL/view desync)", async ({ page }) => {
    // The reported bug: URL said /repos while the screen showed a service view. /repos now
    // REDIRECTS to the cockpit CI tab (the LandingTabs bar was deleted 2026-07-17), so the
    // durable property is the same one: the service view must not survive the navigation.
    await page.goto("/service/market-tick-data-service/deploy");
    await page.goto("/repos");
    await expect(page).toHaveURL(/\/ci$/);
    await expect(page.getByTestId("cockpit-ci")).toBeVisible();
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    // The service shell must be GONE, not merely covered.
    await expect(page.getByTestId("service-ci-tab")).toHaveCount(0);
  });

  test("epics is reachable from the top bar and by deep-link", async ({ page }) => {
    // Epics was a LandingTabs tab; that bar is gone (2026-07-17) and /epics is its own page,
    // reached from the top bar like every other screen.
    await page.goto("/epics");
    await expect(page.getByTestId("cockpit-navlink-epics")).toHaveAttribute("aria-current", "page");

    await page.goto("/home");
    await expect(page.getByTestId("services-overview")).toBeVisible();
    await page.getByTestId("cockpit-navlink-epics").click();
    await page.waitForURL(/\/epics$/, { timeout: 15000 });
  });

  test("browser back returns from a service view to the CI surface", async ({ page }) => {
    // /repos redirects to the cockpit CI tab, so Back lands on the redirect TARGET (the
    // redirect uses `replace`, so it never traps you in a bounce loop — that is the property
    // this pins).
    await page.goto("/repos");
    await expect(page).toHaveURL(/\/ci$/);
    await page.getByTestId("repo-dropdown").selectOption("execution-service");
    await page.goto("/service/execution-service/builds");
    await page.goBack();
    await expect(page).toHaveURL(/\/ci$/);
    await expect(page.getByTestId("cockpit-ci")).toBeVisible();
  });
});
