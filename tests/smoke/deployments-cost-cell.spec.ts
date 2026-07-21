/**
 * pw:L2 — WS-E per-target cost cell (three USD figures) + WS-1 partial-day colour treatment.
 *
 * Regression guard for deployment_observability_expansion_2026_07_08 WS-E: the Cost/day cell shows
 * the actual last-complete-day cost as the primary figure, with the trailing-7-day average and the
 * projected-"$/day if it runs 24h" beneath — all USD (no currency toggle here; GCP is GBP→USD-
 * converted server-side). Runs against the mock API whose fixtures live in src/lib/mock-api.ts
 * (defi-live-capture-1 carries cost 38.4 across all three figures, cost_basis "complete").
 *
 * Also guards deployment_ui_cost_per_day_accuracy_2026_07_20 decision 4: when `cost_basis ===
 * "partial"` (the actual figure fell back to a still-accruing day), the actual-cost figure renders
 * in the amber warning tone instead of the normal primary-text tone — colour only, no text label.
 * cefi-live-trading-1 is mocked with cost_basis "partial" for this case.
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

  test("complete-day actual cost renders in the normal primary-text tone, not amber", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    // defi-live-capture-1 is mocked with cost_basis "complete".
    const actual = page.getByTestId("cost-actual-defi-live-capture-1");
    await expect(actual).toBeVisible();
    await expect(actual).toHaveAttribute("data-cost-basis", "complete");
    await expect(actual).not.toHaveClass(/text-amber-400/);
  });

  test("partial-day actual cost renders in the amber warning tone, no text label added", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    // cefi-live-trading-1 is mocked with cost_basis "partial".
    const actual = page.getByTestId("cost-actual-cefi-live-trading-1");
    await expect(actual).toBeVisible();
    await expect(actual).toHaveAttribute("data-cost-basis", "partial");
    await expect(actual).toHaveClass(/text-amber-400/);
    // Colour is the only signal — no added "partial"/"est."/tooltip text in the visible figure.
    await expect(actual).not.toContainText(/partial/i);
  });
});
