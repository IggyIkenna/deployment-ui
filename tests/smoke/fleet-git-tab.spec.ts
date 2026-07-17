/**
 * Smoke + regression: Fleet Git-Health tab (single-pane AO integration, operator v2).
 * Plan: fleet_git_health_orchestrator_2026_06_10.md Phase 2 +
 * monitoring_control_plane_master_2026_06_10.md (operator v2 + click-through rule).
 *
 * Guards: the tab renders the proxied fleet data (summary chips, per-host slots,
 * drift badge) AND the "Open in Agent-Orchestrator" deep-link (git-health
 * click-through → AO UI). Reverting either trips this spec.
 */

import { expect, test } from "@playwright/test";

test.describe("Fleet Git-Health tab", () => {
  test("the top bar's Fleet tab renders the proxied fleet-git data", async ({ page }) => {
    // Fleet Git was a LandingTabs tab; that bar is gone (2026-07-17). The git view is a
    // section INSIDE the cockpit Fleet tab now, and /fleet redirects there.
    await page.goto("/cockpit");
    await page.getByTestId("cockpit-tab-fleet").click();
    await expect(page).toHaveURL(/\/fleet$/);
    await expect(page.getByTestId("cockpit-fleet-git")).toBeVisible();
    await expect(page.getByTestId("fleet-git-page")).toBeVisible();
    await expect(page.getByTestId("fleet-summary")).toBeVisible();
    // The laptop host card + both slots render.
    await expect(page.getByTestId("fleet-host-laptop")).toBeVisible();
    await expect(page.getByTestId("fleet-slot-3")).toBeVisible();
    // The drift-violating repo shows a DRIFT marker (slot 3 / execution-service).
    await expect(page.getByTestId("fleet-slot-3")).toContainText("DRIFT");
  });

  test("deep-link to /fleet opens the Fleet Git tab directly", async ({ page }) => {
    await page.goto("/fleet");
    await expect(page.getByTestId("fleet-git-page")).toBeVisible();
  });

  test("git-health click-through links to the Agent-Orchestrator UI", async ({ page }) => {
    await page.goto("/fleet");
    const link = page.getByTestId("fleet-open-orchestrator").first();
    await expect(link).toBeVisible();
    // Operator rule: git-health click-through goes to the AO UI fleet page.
    await expect(link).toHaveAttribute("href", /agent-orchestrator.*\/fleet-git$/);
  });
});
