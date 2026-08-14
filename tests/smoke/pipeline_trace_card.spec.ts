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
 *   5. Type-ahead instrument search (2026-08-14): typing a partial string
 *      into the Instrument field shows a dropdown of matches spanning
 *      multiple asset groups (mirrors DataStatusTab.tsx's "Symbol search"
 *      box, same `/data-status/instruments/search` endpoint/mock fixture);
 *      clicking a result populates the field with its `canonical_id`, sets
 *      the Asset group select, and auto-runs the trace; an operator who
 *      already has the exact canonical ID can still type/paste it and press
 *      Enter to submit directly, bypassing the dropdown entirely.
 *
 * Regression guard: 2026-08-04 — GAP G-TRACE first ships
 * (infra_satellite_ao_dispatch_batch1_2026_07_26.md); 2026-08-14 — type-ahead
 * instrument search added on top of the plain text field.
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

  test("typing a partial instrument string shows type-ahead results across asset groups", async ({ page }) => {
    await navigateToDataStatus(page);

    const instrumentInput = page.getByTestId("pipeline-trace-instrument-input");
    await instrumentInput.fill("btc");

    // Fixture set (src/lib/mock-api.ts `/api/data-status/instruments/search`)
    // has "btc" matching two CEFI rows (BINANCE-FUTURES perp, BINANCE-SPOT
    // pair) and one PREDICTION row ("WILL-BTC-100K-2026") — asserting both
    // asset groups appear proves the search is NOT scoped to whatever the
    // Asset group select currently holds (it defaults to "cefi").
    const results = page.getByTestId("pipeline-trace-instrument-result");
    await expect(results).toHaveCount(3, { timeout: 10000 });
    await expect(results.filter({ hasText: "CEFI" })).toHaveCount(2);
    await expect(results.filter({ hasText: "PREDICTION" })).toHaveCount(1);
  });

  test("clicking a type-ahead result populates the field, sets asset group, and auto-runs the trace", async ({
    page,
  }) => {
    await navigateToDataStatus(page);

    // Date filled first — the click handler only auto-fires the trace once a
    // date is present (mirrors runTrace()'s own canSubmit gate).
    await page.getByTestId("pipeline-trace-date-input").fill("2026-08-04");

    const instrumentInput = page.getByTestId("pipeline-trace-instrument-input");
    await instrumentInput.fill("btc");

    const results = page.getByTestId("pipeline-trace-instrument-result");
    const cefiPerp = results.filter({ hasText: "BINANCE-FUTURES:PERPETUAL:BTC-USDT" });
    await expect(cefiPerp).toBeVisible({ timeout: 10000 });
    await cefiPerp.click();

    // The field is populated with the match's canonical_id, and the Asset
    // group select follows it (lower-cased to match the select's option
    // values) — the operator never had to know either up front.
    await expect(instrumentInput).toHaveValue("BINANCE-FUTURES:PERPETUAL:BTC-USDT");
    await expect(page.getByTestId("pipeline-trace-asset-group-select")).toHaveValue("cefi");

    // The dropdown collapses on selection rather than lingering over the
    // result area below.
    await expect(page.getByTestId("pipeline-trace-instrument-results")).toHaveCount(0);

    // Selecting the result triggered the trace itself (no separate click on
    // the Trace button) — this canonical_id contains "BTC-USDT", so the mock
    // fixture reports every hop captured.
    await expect(page.getByTestId("pipeline-trace-result")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("pipeline-trace-stuck-at-none")).toHaveText("All hops captured");
  });

  test("pasting an exact canonical ID and pressing Enter submits without going through the dropdown", async ({
    page,
  }) => {
    await navigateToDataStatus(page);

    const instrumentInput = page.getByTestId("pipeline-trace-instrument-input");
    // Not present in the search-fixture dataset — proves this path never
    // depends on a dropdown match existing at all.
    await instrumentInput.fill("BINANCE-FUTURES:PERPETUAL:AAVE-USDC@LIN");
    await page.getByTestId("pipeline-trace-date-input").fill("2026-08-04");

    await instrumentInput.press("Enter");

    await expect(page.getByTestId("pipeline-trace-result")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("pipeline-trace-stuck-at")).toHaveText("Stuck at: instruments-service");
    await expect(page.getByTestId("pipeline-trace-instrument-results")).toHaveCount(0);
  });
});
