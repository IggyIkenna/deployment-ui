/**
 * Progressive / skeleton loading states — deployment_ui_ux_caching_walkthrough
 * decision #3.
 *
 * The standalone Deployments page (and the Cockpit "deployments" tab, which embeds
 * the same DeploymentsContent + LiveDeploymentsContent components) used to render a
 * bare "Loading…" line while the inventory/summary/vm-deployments calls were in
 * flight — those calls have historically taken 30-90s in production, so the page
 * read as broken. Both surfaces now render a Skeleton placeholder (matching the
 * existing `src/components/ui/skeleton.tsx` pattern used elsewhere, e.g.
 * MonitorTab's CloudSwitchingSkeleton) instead of a blank/empty page.
 *
 * Widens the mock API's artificial per-request delay via the test-only
 * `window.__mockDelayMs` hook (mock-api.ts) so the otherwise sub-100ms loading
 * window is reliably observable instead of flaking on a race.
 */

import { expect, test } from "@playwright/test";

type DelayWindow = Window & { __mockDelayMs?: number };

async function widenMockDelay(page: import("@playwright/test").Page, ms: number) {
  await page.addInitScript((d) => {
    (window as DelayWindow).__mockDelayMs = d;
  }, ms);
}

test.describe("progressive loading skeletons", () => {
  test("standalone Deployments page shows skeletons (not a blank page) before data arrives", async ({ page }) => {
    await widenMockDelay(page, 1500);

    await page.goto("/deployments");

    // While the inventory/summary fetch is in flight, the skeleton placeholders
    // are visible — the page shows progress, not a blank screen.
    await expect(page.getByTestId("umbrella-summary-skeleton")).toBeVisible();
    await expect(page.getByTestId("deployment-matrix-skeleton")).toBeVisible();
    // The old bare-text loading indicator is gone.
    await expect(page.getByText("No deployments match the current filters.")).toHaveCount(0);

    // Once the (delayed) mock response resolves, real content replaces the skeleton.
    await expect(page.getByTestId("umbrella-summary")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    await expect(page.getByTestId("umbrella-summary-skeleton")).toHaveCount(0);
    await expect(page.getByTestId("deployment-matrix-skeleton")).toHaveCount(0);
  });

  test("Cockpit 'deployments' tab shows skeletons for BOTH the merged inventory and the live-ops VM list", async ({
    page,
  }) => {
    await widenMockDelay(page, 1500);

    await page.goto("/deployments");
    await expect(page.getByTestId("cockpit-deployments")).toBeVisible();

    // Merged inventory (DeploymentsContent, embedded).
    await expect(page.getByTestId("umbrella-summary-skeleton")).toBeVisible();
    await expect(page.getByTestId("deployment-matrix-skeleton")).toBeVisible();
    // Folded live-ops VM list (LiveDeploymentsContent) — its own independent call.
    await expect(page.getByTestId("live-deployments-skeleton")).toBeVisible();

    // Real content eventually replaces every skeleton.
    await expect(page.getByTestId("umbrella-summary")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("deployment-matrix-skeleton")).toHaveCount(0);
    await expect(page.getByTestId("live-deployments-skeleton")).toHaveCount(0, { timeout: 10_000 });
  });
});
