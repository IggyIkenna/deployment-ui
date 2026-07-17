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
  ["deploy", "/cockpit?tab=deploy", "cockpit-deploy"],
  ["deployments", "/cockpit?tab=deployments", "cockpit-deployments"],
  ["fleet", "/cockpit?tab=fleet", "cockpit-fleet"],
  ["consolidators", "/cockpit?tab=consolidators", "cockpit-page"],
  ["repos", "/cockpit?tab=ci", "cockpit-ci"],
  ["alerts", "/cockpit?tab=alerts", "cockpit-alerts"],
  ["launch", "/cockpit?tab=launch", "cockpit-launch"],
  ["chaos", "/cockpit?tab=chaos", "cockpit-chaos"],
  ["safety", "/cockpit?tab=safety", "cockpit-safety"],
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
  // The landing shell's own tab bar is the proof the home shell mounted (not the cockpit).
  await expect(page.getByTestId("landing-repos-ci-tab-trigger")).toBeVisible({ timeout: 15_000 });
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

test("redundant routes are quarantined in a labelled group, not mixed into the nav", async ({ page }) => {
  await page.goto("/cockpit");
  await openNav(page);

  const legacy = page.getByTestId("nav-menu-legacy");
  await expect(legacy).toBeVisible();
  await expect(legacy).toContainText(/pending removal/i);
  // The folded standalones live ONLY here — never as a canonical entry.
  await expect(page.getByTestId("nav-menu-item-dup-repos")).toBeVisible();
  await expect(page.getByTestId("nav-menu-item-dup-chaos")).toBeVisible();
});

test("the always-visible top bar carries the same 15 entries as the dropdown", async ({ page }) => {
  await page.goto("/cockpit");
  await expect(page.getByTestId("top-nav-bar")).toBeVisible();

  // 10 cockpit tabs + the 5 screens with no cockpit twin = the dropdown's 15.
  await expect(page.locator('[data-testid^="cockpit-tab-"]')).toHaveCount(10);
  await expect(page.locator('[data-testid^="cockpit-navlink-"]')).toHaveCount(5);

  for (const id of ["home", "epics", "vm-deployments", "data-status", "costs"]) {
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
  await expect(page).toHaveURL(/\/cockpit\?tab=fleet/);
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

test("/infra renders Fleet Infra even when a service was previously selected", async ({ page }) => {
  // Regression: ServiceUrlSync.LANDING_PATHS omitted "/infra", so navigating to it with a
  // service selected kept the stale per-service view on screen (nav audit 2026-07-17).
  await page.goto("/home");
  await page.getByTestId("landing-repos-ci-tab-trigger").waitFor({ timeout: 15_000 });

  await page.goto("/infra");
  await expect(page.getByTestId("landing-fleet-infra-tab")).toBeVisible({ timeout: 15_000 });
});
