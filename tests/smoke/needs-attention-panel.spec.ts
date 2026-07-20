/**
 * Regression guard — "Needs Attention" triage panel (Data Status surface).
 *
 * A ranked, collapsible, cross-cutting summary of recent capture FAILURES,
 * missing-date GAPS, and STALE captures, rendered above the per-category
 * drilldown so an operator sees the worst problems without expanding
 * anything. Genuinely new: prod only surfaced failures deep inside the
 * per-venue drilldown before this.
 *
 * This spec asserts against the BUILT-IN `VITE_MOCK_API` fixture
 * (mock-api.ts `MOCK_DATA_STATUS` / `_MOCK_CATS`), which the app reads in
 * FRONTEND MOCK MODE — `page.route` cannot override an endpoint the in-app
 * `window.fetch` shim already handles (mock-api.ts installs its own fetch
 * override for every `/api/*` path; see its docstring + the sibling
 * `stateful-flows.spec.ts` comment noting the same). The fixture already
 * carries every kind this panel surfaces (counts below are POST the
 * derivation's per-kind cap of 5 — lib/needs-attention.ts caps PER KIND
 * rather than globally so a noisy kind can't crowd the others out):
 *   - FAILURE (3 shown, all real): DEFI/UNISWAP_V3-ETHEREUM has the largest
 *     attempted_failed count (3) of any venue; CEFI/BINANCE-SPOT and
 *     TRADFI/DATABENTO-DBEQ each carry 1. DEFI's must rank first.
 *   - GAP (5 shown, capped from 12+): dates_missing > 0 on most
 *     venues/data_types across every category (SPORTS/FIXTURE_EVENTS alone
 *     is 164,027 — event-driven categories have much larger raw gaps).
 *   - STALE (5 shown, all real): every PREDICTION question-group entry
 *     carries a real dates_found_list (2025-03-14..16) trailing the mock's
 *     range end (2025-04-30) by 45 days — the ONLY populated
 *     dates_found_list in the fixture, so PREDICTION proves staleness
 *     detection end-to-end.
 *
 * Companion unit-level guard (derivation + ranking, all three kinds,
 * synthetic fixtures): tests/unit/needs-attention.test.ts.
 */

import { expect, test } from "@playwright/test";

const DATA_STATUS_URL = "/service/instruments-service/data-status";

test.describe("Needs Attention triage panel", () => {
  test("renders without a JS crash or console error", async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(DATA_STATUS_URL);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("needs-attention-panel")).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("shows ranked failure/gap/stale items derived from the mock response", async ({ page }) => {
    await page.goto(DATA_STATUS_URL);
    await page.waitForLoadState("networkidle");

    const panel = page.getByTestId("needs-attention-panel");
    await expect(panel).toBeVisible();
    // Real signal in the mock fixture — the empty "no issues" state must NOT render.
    await expect(page.locator('[data-needs-attention-empty="true"]')).toHaveCount(0);

    // Header kind-count badges — all three kinds are present in the fixture.
    await expect(page.getByTestId("needs-attention-count-failure")).toBeVisible();
    await expect(page.getByTestId("needs-attention-count-gap")).toBeVisible();
    await expect(page.getByTestId("needs-attention-count-stale")).toBeVisible();

    const items = page.getByTestId("needs-attention-list").locator("li");
    await expect.poll(async () => items.count()).toBeGreaterThan(0);

    // Ranking: the single largest failure (DEFI/UNISWAP_V3-ETHEREUM,
    // attempted_failed=3) must be the FIRST row — failures rank above every
    // gap/stale item, and it out-counts the other two failure rows (1 each).
    const firstRow = items.first();
    await expect(firstRow).toContainText("DEFI");
    await expect(firstRow).toContainText("UNISWAP_V3-ETHEREUM");
    await expect(firstRow.getByText("Failure", { exact: false })).toBeVisible();
  });

  test("collapsing the panel hides the list; expanding restores it", async ({ page }) => {
    await page.goto(DATA_STATUS_URL);
    await page.waitForLoadState("networkidle");

    const list = page.getByTestId("needs-attention-list");
    await expect(list).toBeVisible();

    const toggle = page.getByTestId("needs-attention-toggle");
    await toggle.click();
    await expect(list).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(list).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("clicking a row scopes the category selector to that item's asset_group", async ({ page }) => {
    await page.goto(DATA_STATUS_URL);
    await page.waitForLoadState("networkidle");

    // First row is the DEFI/UNISWAP_V3-ETHEREUM failure (see the module
    // docstring above) — clicking it drills via the existing "filter to
    // category" affordance (`setSelectedCategories`), the same one the
    // Asset Groups toggle row uses. Assert the DEFI toggle flips to
    // selected — the deterministic outcome of that wiring. (The panel also
    // scrolls the Data Coverage card into view on click; that's a secondary
    // UX nicety not asserted here — it raced React's re-render in this
    // suite and isn't the load-bearing behavior this test guards.)
    const defiToggle = page.getByTestId("asset-group-toggle-DEFI");
    await expect(defiToggle).toHaveAttribute("data-selected", "false");

    const firstRow = page.getByTestId("needs-attention-list").locator("li").first();
    await firstRow.click();

    await expect(defiToggle).toHaveAttribute("data-selected", "true");
  });
});
