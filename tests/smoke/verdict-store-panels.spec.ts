/**
 * Smoke: the two Firestore verdict-store panels (version-coherence + change-freeze) render
 * against the mock API.
 *
 * Plan: unified-trading-pm/plans/active/monitoring_control_plane_master_2026_06_10.md
 * (version-coherence panel + G5 change-freeze panel). Both panels are READ-ONLY proxies of
 * unified-trading-pm's Firestore verdict-store — never re-derive the verdict in the UI.
 */

import { expect, test } from "@playwright/test";

test.describe("Version-coherence panel", () => {
  test("renders every verdict class with the correct chip", async ({ page }) => {
    await page.goto("/repos");
    await expect(page).toHaveURL(/\/ci$/);
    const panel = page.getByTestId("version-coherence-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Version coherence");

    // Mock source badge — "mock" (mirrors the deployment-api mock-mode contract).
    await expect(page.getByTestId("version-coherence-source")).toContainText("mock");

    // The 3 non-OK repos from the mock fixture are listed (OK repos are summarized, not rowed).
    await expect(page.getByTestId("version-coherence-row-instruments-service")).toBeVisible();
    await expect(page.getByTestId("version-coherence-verdict-instruments-service")).toContainText("VERSION_SPLIT");

    await expect(page.getByTestId("version-coherence-row-deployment-api")).toBeVisible();
    await expect(page.getByTestId("version-coherence-verdict-deployment-api")).toContainText("VESTIGIAL_SCALAR_DRIFT");

    await expect(page.getByTestId("version-coherence-row-strategy-service")).toBeVisible();
    await expect(page.getByTestId("version-coherence-verdict-strategy-service")).toContainText(
      "DEP_FLOOR_UNSATISFIABLE",
    );

    // unified-trading-library is OK in the fixture — it must NOT get its own flagged row (only
    // the non-OK repos appear in the flagged list).
    await expect(page.getByTestId("version-coherence-row-unified-trading-library")).toHaveCount(0);
  });
});

test.describe("Change-freeze banner", () => {
  test("renders the active freeze window with its reason when PROD_DEPLOY is BLOCKED", async ({ page }) => {
    await page.goto("/repos");
    const banner = page.getByTestId("change-freeze-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Change freeze active");
    await expect(page.getByTestId("change-freeze-blocked-PROD_DEPLOY")).toContainText("prod deploy");
    await expect(page.getByTestId("change-freeze-blocked-PROD_DEPLOY")).toContainText("US market open volatility");
    // AUTONOMOUS is CLEAR in the fixture — it must not appear in the blocked list.
    await expect(page.getByTestId("change-freeze-blocked-AUTONOMOUS")).toHaveCount(0);
  });
});
