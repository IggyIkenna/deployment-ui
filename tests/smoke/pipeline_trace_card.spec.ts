/**
 * Regression spec — Pipeline Trace card (GAP G-TRACE).
 *
 * This app runs in "Frontend Mock Mode" unconditionally in dev/CI
 * (`installDeploymentMockHandlers`, src/lib/mock-api.ts) — it patches the
 * client's own request path to return canned fixtures directly, WITHOUT ever
 * making a real network request. `page.route()` (Playwright's CDP-level
 * network interception) therefore CANNOT observe or override these calls —
 * confirmed empirically: a `page.route("**\/api/data-status/pipeline-trace**")`
 * override here never received a request, and `page.route("**\/api/services**")`
 * was silently ignored too (the sidebar rendered the app's own real ~22-service
 * mock list, not a 1-service override). So this spec drives the two UI states
 * via the mock-api.ts fixture's own real behavior (parameterized on the
 * instrument string — BTC-USDT is fully captured, anything else mirrors the
 * real observed partial-stuck shape) rather than trying to inject fixtures.
 *
 * Asserts:
 *   1. The card renders unconditionally on the data-status view (not scoped to
 *      one service tab — it is a cross-service tool).
 *   2. All 8 pipeline hops render in pipeline order (IS, MTDS, MDPS, 3x
 *      features, strategy, execution), each with its own status badge.
 *   3. `stuck_at` renders as a distinct "Stuck at: <service>" badge naming the
 *      first non-captured hop — not just a generic error state.
 *   4. When every hop is captured, the "All hops captured" badge renders
 *      instead (no stuck_at badge).
 *
 * Regression guard: 2026-08-04 — GAP G-TRACE first ships
 * (infra_satellite_ao_dispatch_batch1_2026_07_26.md).
 */

import { expect, test, type Page } from "@playwright/test";

async function navigateToDataStatus(page: Page) {
  // Direct route (HomeShell.tsx registers `/service/:serviceName/:tab`) — more
  // robust than clicking through the sidebar, whose visible label is a
  // prettified transform of the service name ("market tick data"), not the
  // raw "market-tick-data-service" string.
  await page.goto("/service/market-tick-data-service/data-status");
  await page.waitForLoadState("networkidle");
}

async function runTrace(page: Page, instrument: string) {
  await page.getByTestId("pipeline-trace-instrument-input").fill(instrument);
  await page.getByTestId("pipeline-trace-date-input").fill("2026-08-04");
  await expect(page.getByTestId("pipeline-trace-run")).toBeEnabled();
  await page.getByTestId("pipeline-trace-run").click();
  await expect(page.getByTestId("pipeline-trace-result")).toBeVisible();
}

test.describe("Pipeline Trace card (GAP G-TRACE) regression", () => {
  test("card renders unconditionally with empty state before any trace is run", async ({ page }) => {
    await navigateToDataStatus(page);

    await expect(page.getByTestId("pipeline-trace-card")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("pipeline-trace-empty")).toBeVisible();
    await expect(page.getByTestId("pipeline-trace-run")).toBeDisabled();
  });

  test("stuck_at renders the first non-captured hop, not a generic error", async ({ page }) => {
    await navigateToDataStatus(page);
    await runTrace(page, "BINANCE-FUTURES:PERPETUAL:AAVE-USDC@LIN");

    await expect(page.getByTestId("pipeline-trace-stuck-at")).toHaveText("Stuck at: instruments-service");
    await expect(page.getByTestId("pipeline-trace-stuck-at-none")).toHaveCount(0);

    // All 8 hops render, in pipeline order.
    const hopRows = page.getByTestId("pipeline-trace-hops").locator("li");
    await expect(hopRows).toHaveCount(8);
    const services = await hopRows.locator("span.font-mono").allTextContents();
    expect(services).toEqual([
      "instruments-service",
      "market-tick-data-service",
      "market-data-processing-service",
      "features-onchain-service",
      "features-delta-one-service",
      "features-volatility-service",
      "strategy-service",
      "execution-service",
    ]);

    // The stuck hop itself is badged never_attempted; MTDS/MDPS (which the
    // fixture reports as genuinely captured) are not swept into the same
    // state — a downstream stall doesn't retroactively mark upstream hops.
    await expect(page.getByTestId("pipeline-trace-hop-instruments-service")).toContainText("never_attempted");
    await expect(page.getByTestId("pipeline-trace-hop-market-tick-data-service")).toContainText("captured");
    await expect(page.getByTestId("pipeline-trace-hop-market-data-processing-service")).toContainText("captured");
    await expect(page.getByTestId("pipeline-trace-hop-execution-service")).toContainText("never_attempted");
  });

  test("all hops captured renders the all-clear badge, not a stuck_at badge", async ({ page }) => {
    await navigateToDataStatus(page);
    await runTrace(page, "BINANCE-FUTURES:PERPETUAL:BTC-USDT@LIN");

    await expect(page.getByTestId("pipeline-trace-stuck-at-none")).toHaveText("All hops captured");
    await expect(page.getByTestId("pipeline-trace-stuck-at")).toHaveCount(0);

    const hopRows = page.getByTestId("pipeline-trace-hops").locator("li");
    await expect(hopRows).toHaveCount(8);
    for (const service of [
      "instruments-service",
      "market-tick-data-service",
      "market-data-processing-service",
      "features-onchain-service",
      "features-delta-one-service",
      "features-volatility-service",
      "strategy-service",
      "execution-service",
    ]) {
      await expect(page.getByTestId(`pipeline-trace-hop-${service}`)).toContainText("captured");
    }
  });
});
