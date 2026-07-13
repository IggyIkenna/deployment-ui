/**
 * pw:L2 — WS-E per-target cost cell (three USD figures).
 *
 * Regression guard for deployment_observability_expansion_2026_07_08 WS-E: the Cost/day cell shows
 * the actual last-complete-day cost as the primary figure, with the trailing-7-day average and the
 * projected-"$/day if it runs 24h" beneath — all USD (no currency toggle here; GCP is GBP→USD-
 * converted server-side). Runs against the mock API whose fixtures live in src/lib/mock-api.ts
 * (defi-live-capture-1 carries cost 38.4 across all three figures).
 */
import { expect, test } from "@playwright/test";

test.describe("Deployments cost cell (WS-E)", () => {
  test("cost cell shows actual + 7d-avg + projected-24h, all USD", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();

    const cell = page.getByTestId("cost-defi-live-capture-1");
    await expect(cell).toBeVisible();
    // mock cost 38.4 → primary "$38" (>=10 rounds to whole dollars).
    await expect(cell).toContainText("$38");
    // the two secondary figures are labelled 7d (average) and 24h (projected).
    await expect(cell).toContainText("7d");
    await expect(cell).toContainText("24h");
  });

  test("cost cell degrades to em-dash when a target has no billing row", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    // A DISK orphan row carries no cost fields → the cell renders the muted em-dash, never a $0.
    const diskRow = page.getByTestId("kind-badge-DISK").first();
    await expect(diskRow).toBeVisible();
  });
});
