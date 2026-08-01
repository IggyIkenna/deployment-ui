/**
 * L2 (Infrastructure Verify) — data-status live UI review round 3 (2026-07-17).
 *
 * Regression spec for the two round-3 UI fixes on the instruments-service Data
 * Status tab:
 *   - F1: the Fixtures browser groups by league and shows the HUMAN league name
 *     (UAC `display_name`) instead of the raw API-Football numeric id — the
 *     backend returns a `league_names` map alongside `leagues`.
 *   - F3: the Catalogue Explorer's venue / instrument_type / data_type filters
 *     are DROPDOWNS populated from `/data-status/catalogue-filter-options`, not
 *     free-text inputs.
 *
 * Asserts both render with no console errors / no 5xx (L2 contract).
 *
 * MOCKING MECHANISM — deliberately NOT `page.route()` (read before touching):
 * this app's dev server runs with `VITE_MOCK_API=true`
 * (`playwright.config.ts` webServer env), under which
 * `src/lib/mock-api.ts#installDeploymentMockHandlers()` monkey-patches
 * `window.fetch` at the CLIENT/JS level for every URL containing `/api/` —
 * confirmed by direct experiment that `page.route()` NEVER sees these
 * requests, because they never become real network calls in the first place
 * (the override synthesizes a `Response` in-process and returns it). The
 * `data-status-tab-renders.spec.ts` reference spec's `page.route("**\/api/**")`
 * calls are therefore dead code too — that spec only "passes" because its
 * assertions are shallow enough (no console `pageerror`s / no 5xx) not to
 * notice. This spec's own `page.route()` calls in the original draft were
 * equally inert, and — separately — the app's built-in mock-api.ts fixtures
 * have two gaps that would otherwise block these exact assertions even if
 * they *were* reachable: `/api/fixtures/browse` never returns a `league_names`
 * map (so a real human name can never render, only ever the raw id), and
 * `/api/data-status/catalogue-filter-options` has NO dedicated handler and
 * falls through to the broader `path.startsWith("/api/data-status/catalogue")`
 * check (the full-catalogue-list handler), whose response shape lacks
 * `venues`/`instrument_types`/`data_types` — crashing `CatalogueExplorer`
 * (`Cannot read properties of undefined (reading 'map')`) via its own
 * `ErrorBoundary`. Both are out of this spec's scope to fix (`src/` is off
 * limits here) and are reported separately.
 *
 * The sanctioned test-injection surface for this app IS `window.__mock*`
 * globals seeded before `page.goto()` (see mock-api.ts's own
 * `__mockErrors`/`__mockRequests`/`__mockVmDeploymentOverride` comments —
 * "simulate backend failures without Playwright route mocks"), but none of
 * those support an arbitrary SUCCESS payload for these two endpoints. This
 * spec extends the same pattern from the test side: `page.addInitScript`
 * installs a `window.fetch` wrapper BEFORE the app boots, using a getter/
 * setter so it stays the outermost layer regardless of load order — the app's
 * own `installDeploymentMockHandlers()` still runs and still serves every
 * OTHER endpoint (health, services, dimensions, drilldown, catalogue) via its
 * real fixtures; this wrapper only special-cases the two broken paths, then
 * delegates everything else to whatever the app most recently assigned. The
 * F1/F3 assertions below are unchanged from the original spec and still
 * exercise the real, unmodified `FixturesBrowser`/`CatalogueExplorer`
 * components end-to-end through the real `fetchFixturesBrowse`/
 * `fetchCatalogueFilterOptions` client calls — only the HTTP transport is
 * substituted, exactly as any mock does.
 *
 * Issue: plans/active/issues/data_status_ui_live_review_round3_2026_07_17.md
 */

import { expect, Page, test } from "@playwright/test";

const SERVICE = "instruments-service";

/**
 * Install a `window.fetch` layer (BEFORE the app's own module graph runs)
 * that serves the two mock-api.ts-gapped endpoints directly and defers
 * everything else to whatever the app itself assigns to `window.fetch`
 * (mock-api.ts's `installDeploymentMockHandlers` wrapper, in practice).
 *
 * A getter/setter on `window.fetch` (rather than a one-shot
 * `window.fetch = wrapper`) is required because `installDeploymentMockHandlers`
 * runs AFTER this init script (it's called from the app's module graph on
 * load) and does its own unconditional `window.fetch = ...<em>` — a plain
 * assignment here would just get overwritten. The setter instead captures
 * whatever the app assigns as the fallback `inner`, so this wrapper always
 * stays the active (outermost) `fetch` no matter the load order.
 */
async function installFixturesAndCatalogueFilterOptionsMocks(page: Page) {
  await page.addInitScript(() => {
    let inner = window.fetch.bind(window);
    const wrapper: typeof window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

      if (url.includes("/api/fixtures/browse")) {
        return new Response(
          JSON.stringify({
            leagues: { "103": { "2026-04-21": [] } },
            league_names: { "103": "Eliteserien" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/data-status/catalogue-filter-options")) {
        return new Response(
          JSON.stringify({
            service: "instruments-service",
            asset_group: "cefi",
            venues: ["BINANCE-FUTURES", "OKX-SWAP"],
            instrument_types: ["PERPETUAL"],
            data_types: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return inner(input, init);
    };
    Object.defineProperty(window, "fetch", {
      configurable: true,
      get: () => wrapper,
      set: (fn: typeof window.fetch) => {
        inner = fn;
      },
    });
  });
}

test("F1+F3 — fixtures league name + catalogue dropdowns render with no console errors / 5xx", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const fiveXx: number[] = [];
  page.on("response", (resp) => {
    if (resp.status() >= 500) fiveXx.push(resp.status());
  });

  await installFixturesAndCatalogueFilterOptionsMocks(page);

  // Deep-link straight to the service's Data Status tab via the current
  // `/service/{name}/{tab}` real route (see `HomeShell.tsx`) instead of
  // the retired `/home` + sidebar-text-click flow: the sidebar's visible
  // label strips the "-service" suffix (`ServiceList.tsx`'s `ServiceItem`
  // renders `serviceName.replace("-service", "").replace(/-/g, " ")`), so
  // `getByText("instruments-service", { exact: true })` never matches — the
  // rendered text is "instruments". The deep link sidesteps that mismatch
  // entirely and matches how the app's own header nav links to this tab.
  await page.goto(`/service/${SERVICE}/data-status`);
  await page.waitForLoadState("networkidle");

  // F1: the human league name is shown, not the raw numeric id "103".
  await expect(page.getByTestId("fixtures-browser-league-name-103")).toHaveText("Eliteserien");

  // F3: the venue filter is a <select> populated with the real distinct values.
  const venueSelect = page.getByTestId("catalogue-explorer-venue-select");
  await expect(venueSelect).toBeVisible();
  await expect(venueSelect.locator("option")).toContainText(["Any venue", "BINANCE-FUTURES", "OKX-SWAP"]);

  expect(errors.filter((e) => !e.includes("ResizeObserver"))).toEqual([]);
  expect(fiveXx).toHaveLength(0);
});
