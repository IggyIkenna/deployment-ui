/**
 * L2 route smoke for the always-visible top nav bar (2026-07-17 nav audit;
 * dropdown-vs-bar RULED 2026-07-28, dropdown deleted).
 *
 * This file was `nav-menu-dedup.spec.ts` — it originally drove the top-left dropdown
 * (NavMenu) to prove every canonical nav entry navigated to a real, deduplicated screen.
 * The operator ruling in plans/active/issues/deployment_ui_nav_consolidation_2026_07_17.md
 * kept the always-visible TopNavBar and deleted the dropdown (it survives every route; the
 * dropdown's earlier cockpit placement vanished on exactly the routes that navigate away).
 * Both rendered the identical NAV_ITEMS_CANONICAL list, so this file is the same regression
 * coverage re-targeted at the bar's `cockpit-tab-*` / `cockpit-navlink-*` testids instead of
 * the deleted `nav-cockpit` / `nav-menu-item-*` ones. The dropdown-only mechanics (open via
 * `nav-cockpit`, dismiss via backdrop/Escape, the `nav-menu` panel itself) have no bar
 * equivalent — the bar has no open/closed state — so that coverage is gone, not ported.
 * The "no duplicate `to`" / "no legacy group" data-contract invariants are pinned at the
 * data layer in NavMenu.test.tsx (unit) regardless of which surface renders them.
 *
 * EVERY canonical nav entry must actually navigate and mount its screen without console
 * errors. A nav entry pointing at a dead/typo'd URL is invisible in unit tests (the `*`
 * catch-all silently renders Overview for any unknown path) — only a real navigation
 * catches it.
 *
 * Regression pinned: cockpit-tab-* / cockpit-navlink-* → real screen; /infra no longer stuck
 * on the service view.
 */

import { expect, test } from "@playwright/test";

/** Canonical former-cockpit-pane entries: [bar tab id, expected URL, mounted-screen testid]. */
const CANONICAL: [string, string, string][] = [
  ["health", "/cockpit", "cockpit-page"],
  ["deploy", "/deploy", "cockpit-deploy"],
  ["deployments", "/deployments", "cockpit-deployments"],
  ["consolidators", "/consolidators", "cockpit-consolidators"],
  ["ci", "/ci", "cockpit-ci"],
  ["alerts", "/alerts", "cockpit-alerts"],
  ["launch", "/launch", "cockpit-launch"],
  ["chaos", "/chaos", "cockpit-chaos"],
  ["safety", "/safety-ops", "cockpit-safety"],
];

test.describe("top nav bar — canonical entries all navigate to a real screen", () => {
  for (const [tabId, expectedUrl, mountedTestId] of CANONICAL) {
    test(`bar tab "${tabId}" → ${expectedUrl}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      // Start off the target route so the click is a real navigation, not a no-op.
      await page.goto("/home");
      await page.getByTestId(`cockpit-tab-${tabId}`).click();

      await expect(page).toHaveURL(new RegExp(expectedUrl.replace("?", "\\?")));
      await expect(page.getByTestId(mountedTestId)).toBeVisible({ timeout: 15_000 });
      expect(errors).toEqual([]);
    });
  }
});

test("bar link 'home' reaches the service picker", async ({ page }) => {
  await page.goto("/cockpit");
  await page.getByTestId("cockpit-navlink-home").click();
  await expect(page).toHaveURL(/\/home/);
  // The service picker is the proof the home shell mounted (not the cockpit). It used to be
  // the LandingTabs bar; that bar was deleted 2026-07-17 as a duplicate of the top bar.
  await expect(page.getByTestId("services-overview")).toBeVisible({ timeout: 15_000 });
});

test("the bar lists each destination exactly once (no duplicate hrefs)", async ({ page }) => {
  await page.goto("/cockpit");
  const hrefs = await page
    .getByTestId("top-nav-bar")
    .locator("a")
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(0);
  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test("the always-visible top bar carries all 16 canonical entries", async ({ page }) => {
  await page.goto("/cockpit");
  await expect(page.getByTestId("top-nav-bar")).toBeVisible();

  // 9 cockpit tabs + the 7 screens with no cockpit twin = 16 canonical entries.
  // ("artifacts" + "venue-config" are canonical; "vm-resource-comparison" added 2026-07-27,
  // deployment_durable_operational_data_bigquery_2026_07_21.md. Fleet tab removed
  // 2026-07-27, deployment_ui_fleet_tab_removal_2026_07_27.md.)
  await expect(page.locator('[data-testid^="cockpit-tab-"]')).toHaveCount(9);
  await expect(page.locator('[data-testid^="cockpit-navlink-"]')).toHaveCount(7);

  for (const id of ["home", "epics", "data-status", "costs", "artifacts", "venue-config", "vm-resource-comparison"]) {
    await expect(page.getByTestId(`cockpit-navlink-${id}`)).toBeVisible();
  }
});

test("the top bar stays visible OFF the cockpit — the point of lifting it out", async ({ page }) => {
  // Regression: as a cockpit TabsList, the bar vanished on exactly the 4 entries that
  // navigate away (Services / Epics / VMs / Costs), so it could never be the primary nav.
  await page.goto("/costs");
  await expect(page.getByTestId("top-nav-bar")).toBeVisible();
  await expect(page.locator('[data-testid^="cockpit-tab-"]')).toHaveCount(9);

  // ...and a cockpit tab is still one click away from a non-cockpit route.
  // Fleet tab was removed 2026-07-27; clicking a remaining tab (Deploy) proves the bar still works.
  await page.getByTestId("cockpit-tab-deploy").click();
  await expect(page).toHaveURL(/\/deploy/);
  await expect(page.getByTestId("cockpit-deploy")).toBeVisible({ timeout: 15_000 });
});

test("a top-bar route link navigates to its own route", async ({ page }) => {
  await page.goto("/cockpit");
  await page.getByTestId("cockpit-navlink-costs").click();
  await expect(page).toHaveURL(/\/costs/);
});

test("Data Status is one click from the top bar and really selects the tab", async ({ page }) => {
  // Data Status is a PER-SERVICE tab, so the nav entry names a default service
  // (instruments-service — the one the cockpit's Data Coverage tile reads). The deep-link
  // must land ON the tab, not just on the service view's default (Deploy) tab — that's the
  // failure mode ServiceUrlSync's state/URL race produces, and it is invisible from the URL.
  await page.goto("/cockpit");
  await page.getByTestId("cockpit-navlink-data-status").click();
  await expect(page).toHaveURL(/\/service\/instruments-service\/data-status/);

  const tab = page.getByRole("tab", { name: "Data Status" });
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await expect(tab).toHaveAttribute("data-state", "active");
});

test("the top bar is the only nav chrome — the cockpit no longer renders its own", async ({ page }) => {
  await page.goto("/cockpit");
  // The old in-page TabsList + "Cockpit" title block are gone; the top bar carries both jobs.
  await expect(page.getByTestId("cockpit-tabbar")).toHaveCount(0);
  await expect(page.getByText("unified deployment & health observability")).toHaveCount(0);
});

test("bookmark-compat redirects forward the old ?tab= URLs to their plain route", async ({ page }) => {
  // 2026-07-17: /alerts is now a canonical PLAIN route (no redirect). Only /repos survives as a
  // bookmark-compat redirect — /repos → /ci. /infra was removed 2026-07-27 (its redirect target
  // /fleet was retired — deployment_ui_fleet_tab_removal_2026_07_27.md). No nav entry points at it.
  for (const [from, dest, mounted] of [["/repos", "/ci", "cockpit-ci"]]) {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`\\${dest}$`));
    await expect(page.getByTestId(mounted)).toBeVisible({ timeout: 15_000 });
  }
});

test("a redirect fires even when a service was previously selected", async ({ page }) => {
  // Regression: ServiceUrlSync used to own these paths and could keep the stale per-service
  // view on screen instead of the target. /infra was removed (its redirect target /fleet was
  // retired 2026-07-27); /repos → /ci is the remaining bookmark-compat redirect to verify.
  await page.goto("/home");
  await expect(page.getByTestId("services-overview")).toBeVisible({ timeout: 15_000 });

  await page.goto("/repos");
  await expect(page).toHaveURL(/\/ci$/);
  await expect(page.getByTestId("cockpit-ci")).toBeVisible({ timeout: 15_000 });
});
