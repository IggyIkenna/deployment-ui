/**
 * L2 route smoke for the deduplicated nav menu (2026-07-17 nav audit).
 *
 * The menu previously mixed chromes — some entries pointed at a cockpit tab, others at the
 * standalone page rendering the SAME component — so the same screen appeared twice under two
 * labels. The rewrite made every canonical entry point at one destination and quarantined the
 * redundant standalone routes into a `legacy` group.
 *
 * This is the L2 contract for that change: EVERY canonical nav entry must actually navigate
 * and mount its screen without console errors. A nav entry pointing at a dead/typo'd URL is
 * invisible in unit tests (the `*` catch-all silently renders Overview for any unknown path)
 * — only a real navigation catches it.
 *
 * Regression pinned: nav-menu-item-* → real screen; /infra no longer stuck on the service view.
 */

import { expect, test } from "@playwright/test";

/** Canonical entries: [nav item id, expected URL, a testid that proves the screen mounted]. */
const CANONICAL: [string, string, string][] = [
  ["cockpit", "/cockpit", "cockpit-page"],
  ["deploy", "/deploy", "cockpit-deploy"],
  ["deployments", "/deployments", "cockpit-deployments"],
  ["fleet", "/fleet", "cockpit-fleet"],
  ["consolidators", "/consolidators", "cockpit-consolidators"],
  ["repos", "/ci", "cockpit-ci"],
  ["alerts", "/alerts", "cockpit-alerts"],
  ["launch", "/launch", "cockpit-launch"],
  ["chaos", "/chaos", "cockpit-chaos"],
  ["safety", "/safety-ops", "cockpit-safety"],
];

async function openNav(page: import("@playwright/test").Page) {
  await page.getByTestId("nav-cockpit").click();
  await expect(page.getByTestId("nav-menu")).toBeVisible();
}

test.describe("nav menu — canonical entries all navigate to a real screen", () => {
  for (const [id, expectedUrl, mountedTestId] of CANONICAL) {
    test(`nav item "${id}" → ${expectedUrl}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto("/cockpit");
      await openNav(page);
      await page.getByTestId(`nav-menu-item-${id}`).click();

      // The menu closes on click, the URL matches, and the target screen actually mounts.
      await expect(page.getByTestId("nav-menu")).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(expectedUrl.replace("?", "\\?")));
      await expect(page.getByTestId(mountedTestId)).toBeVisible({ timeout: 15_000 });
      expect(errors).toEqual([]);
    });
  }
});

test("nav item 'home' reaches the service picker", async ({ page }) => {
  await page.goto("/cockpit");
  await openNav(page);
  await page.getByTestId("nav-menu-item-home").click();
  await expect(page).toHaveURL(/\/home/);
  // The service picker is the proof the home shell mounted (not the cockpit). It used to be
  // the LandingTabs bar; that bar was deleted 2026-07-17 as a duplicate of the top bar.
  await expect(page.getByTestId("services-overview")).toBeVisible({ timeout: 15_000 });
});

test("nav lists each destination exactly once (no duplicate hrefs)", async ({ page }) => {
  await page.goto("/cockpit");
  await openNav(page);

  const hrefs = await page
    .locator('[data-testid^="nav-menu-item-"]:not([data-testid^="nav-menu-item-dup-"])')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(0);
  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test("the legacy duplicate-route quarantine is gone — one plain route per screen", async ({ page }) => {
  // 2026-07-17: the UI moved to one plain-URL scheme; `?tab=` and the whole "pending removal"
  // quarantine group (and its routes) were deleted. Neither the group nor any dup- entry exists.
  await page.goto("/cockpit");
  await openNav(page);

  await expect(page.getByTestId("nav-menu-legacy")).toHaveCount(0);
  for (const id of ["dup-deployments", "dup-live-ops", "dup-chaos", "dup-repos", "dup-fleet-git"]) {
    await expect(page.getByTestId(`nav-menu-item-${id}`)).toHaveCount(0);
  }
});

test("the always-visible top bar carries the same 17 entries as the dropdown", async ({ page }) => {
  await page.goto("/cockpit");
  await expect(page.getByTestId("top-nav-bar")).toBeVisible();

  // 10 cockpit tabs + the 7 screens with no cockpit twin = the dropdown's 17. (Was 15/5 with a
  // stale "vm-deployments" in this list — that route is now fully retired, off canonical nav
  // entirely; "artifacts" + "venue-config" are canonical instead; "vm-resource-comparison"
  // added 2026-07-27, deployment_durable_operational_data_bigquery_2026_07_21.md.)
  await expect(page.locator('[data-testid^="cockpit-tab-"]')).toHaveCount(10);
  await expect(page.locator('[data-testid^="cockpit-navlink-"]')).toHaveCount(7);

  for (const id of ["home", "epics", "data-status", "costs", "artifacts", "venue-config", "vm-resource-comparison"]) {
    await expect(page.getByTestId(`cockpit-navlink-${id}`)).toBeVisible();
  }
});

test("the top bar stays visible OFF the cockpit — the point of lifting it out", async ({ page }) => {
  // Regression: as a cockpit TabsList, the bar vanished on exactly the 4 entries that
  // navigate away (Services / Epics / VMs / Costs), so it could never be the primary nav.
  await page.goto("/ops/costs");
  await expect(page.getByTestId("top-nav-bar")).toBeVisible();
  await expect(page.locator('[data-testid^="cockpit-tab-"]')).toHaveCount(10);

  // ...and a cockpit tab is still one click away from a non-cockpit route.
  await page.getByTestId("cockpit-tab-fleet").click();
  await expect(page).toHaveURL(/\/fleet/);
  await expect(page.getByTestId("cockpit-fleet")).toBeVisible({ timeout: 15_000 });
});

test("a top-bar route link navigates to its own route", async ({ page }) => {
  await page.goto("/cockpit");
  await page.getByTestId("cockpit-navlink-costs").click();
  await expect(page).toHaveURL(/\/ops\/costs/);
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
  // 2026-07-17: /alerts and /fleet are now canonical PLAIN routes (no redirect). Only /repos and
  // /infra survive as bookmark-compat redirects — /repos → /ci, /infra → /fleet (the Fleet route
  // is now git-health-only; FleetInfra was removed 2026-07-21). No nav entry points at them.
  for (const [from, dest, mounted] of [
    ["/repos", "/ci", "cockpit-ci"],
    ["/infra", "/fleet", "cockpit-fleet"],
  ]) {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`\\${dest}$`));
    await expect(page.getByTestId(mounted)).toBeVisible({ timeout: 15_000 });
  }
});

test("a redirect fires even when a service was previously selected", async ({ page }) => {
  // Regression: ServiceUrlSync used to own these paths and could keep the stale per-service
  // view on screen instead of the target (that was the /infra bug, nav audit 2026-07-17).
  await page.goto("/home");
  await expect(page.getByTestId("services-overview")).toBeVisible({ timeout: 15_000 });

  await page.goto("/infra");
  await expect(page).toHaveURL(/\/fleet/);
  await expect(page.getByTestId("cockpit-fleet")).toBeVisible({ timeout: 15_000 });
});
