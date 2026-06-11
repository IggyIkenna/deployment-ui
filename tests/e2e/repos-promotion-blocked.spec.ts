/**
 * Regression guard: the promotion-blocked panel (G1 — alert-parity for the staging→main
 * genuine-failure CRITICAL page + newly-quarantined WARNING) and the B3 commit-count in the
 * LDR→main delta cell (operator adds 2026-06-11 — guards reverting these features).
 * Plan: monitoring_control_plane_master_2026_06_10.md (G1 + B3).
 */

import { expect, test } from "@playwright/test";

test.describe("Repos CI — promotion-blocked panel (G1)", () => {
  test("always-visible panel lists quarantined + failing repos", async ({ page }) => {
    await page.goto("/repos");
    const panel = page.getByTestId("promotion-blocked-panel");
    await expect(panel).toBeVisible();
    // greeks-service quarantined (CRITICAL); execution-service failing-not-quarantined (WARNING).
    const greeks = panel.getByTestId("promotion-blocked-greeks-service");
    await expect(greeks).toBeVisible();
    await expect(greeks).toContainText("quarantined");
    await expect(greeks).toContainText("escalated");
    const exec = panel.getByTestId("promotion-blocked-execution-service");
    await expect(exec).toBeVisible();
    await expect(exec).toContainText("1 fail");
  });
});

test.describe("Repos CI — B3 commit count in LDR→main delta", () => {
  test("delta cell shows files-ahead (content truth) AND commit count", async ({ page }) => {
    await page.goto("/repos");
    const row = page.getByTestId("repo-row-unified-trading-library");
    await expect(row).toBeVisible();
    // Mock LDR→main delta = 4 files / 3 commits ahead → "4 files ahead · 3 commits".
    await expect(row).toContainText("4 files ahead · 3 commits");
  });
});

test.describe("Repos CI — B1 Image column build visibility", () => {
  test("Image cell shows build time + a click-through to the build log", async ({ page }) => {
    await page.goto("/repos");
    const row = page.getByTestId("repo-row-unified-trading-library");
    const cell = row.getByTestId("image-cell");
    await expect(cell).toBeVisible();
    // Build time rendered (B1 — when it last built), deterministic MM-DD HH:MM.
    await expect(cell.getByTestId("image-build-time")).toHaveText("06-11 07:30");
    // Log click-through to the GCP Cloud Build / AWS CodeBuild console.
    const link = cell.getByTestId("image-log-link");
    await expect(link).toHaveAttribute("href", /cloud-build|codebuild/);
  });
});
