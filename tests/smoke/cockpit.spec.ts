/**
 * Smoke + regression: Cockpit — the unified deployment & health observability surface.
 *
 * SCAFFOLD STAGE (operator 2026-06-23): the cockpit ships its full page/tab IA with
 * placeholder data first; this spec guards the navigation + structure so a later
 * data-wiring change can't silently drop a tab/tile. It asserts:
 *  - the /cockpit route renders with all 7 tabs
 *  - the Overview tile grid (every monitoring domain present) + the placeholder note
 *  - each tab switches and renders its pane (Live/Batch/Paper dynamics tables, Fleet
 *    reconciliation, Consolidators, Health)
 *  - the Header "Cockpit" nav link routes here
 *
 * The page makes NO /api calls yet (placeholders) — only the app-shell mocks are needed.
 *
 * Plan: unified_deployment_health_cockpit_2026_06_23.md (parent_epic observability_master).
 */

import { expect, type Page, test } from "@playwright/test";

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  mock_mode: false,
  gcs_fuse: { active: true, reason: "mounted" },
};

async function mockBase(page: Page) {
  await page.route("**/api/health", (route) => route.fulfill({ json: MOCK_HEALTH }));
  await page.route("**/api/services", (route) => route.fulfill({ json: [] }));
}

const TAB_IDS = ["overview", "live", "batch", "paper", "fleet", "consolidators", "health"] as const;

test.describe("Cockpit — scaffold IA", () => {
  test("renders the page with all 7 tabs", async ({ page }) => {
    await mockBase(page);
    await page.goto("/cockpit");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("cockpit-page")).toBeVisible();
    for (const id of TAB_IDS) {
      await expect(page.getByTestId(`cockpit-tab-${id}`)).toBeVisible();
    }
  });

  test("Overview shows the full monitoring tile grid + placeholder note", async ({ page }) => {
    await mockBase(page);
    await page.goto("/cockpit");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("cockpit-overview")).toBeVisible();
    // Every monitoring domain the operator asked for is present as a tile.
    for (const id of [
      "live",
      "batch",
      "paper",
      "fleet",
      "consolidators",
      "ci",
      "orchestrator",
      "github",
      "billing",
      "alerts",
    ]) {
      await expect(page.getByTestId(`cockpit-tile-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId("cockpit-placeholder-note").first()).toBeVisible();
  });

  test("each tab switches and renders its pane", async ({ page }) => {
    await mockBase(page);
    await page.goto("/cockpit?tab=fleet");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-fleet")).toBeVisible();
    await expect(page.getByTestId("cockpit-fleet-card-unknown")).toBeVisible();

    await page.getByTestId("cockpit-tab-consolidators").click();
    await expect(page.getByTestId("cockpit-consolidators")).toBeVisible();
    await expect(page.getByTestId("cockpit-consolidator-defi")).toBeVisible();

    await page.getByTestId("cockpit-tab-health").click();
    await expect(page.getByTestId("cockpit-health")).toBeVisible();
    await expect(page.getByTestId("cockpit-health-orchestrator")).toBeVisible();
  });

  test("Header Cockpit nav link routes to /cockpit", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("nav-cockpit").click();
    await expect(page).toHaveURL(/\/cockpit/);
    await expect(page.getByTestId("cockpit-page")).toBeVisible();
  });
});
