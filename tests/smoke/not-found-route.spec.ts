/**
 * L2 route smoke for the real 404 route (unified-trading-pm/plans/active/issues/
 * deployment_ui_nav_consolidation_2026_07_17.md, "Add a real 404 route" todo).
 *
 * Before this, the `*` catch-all unconditionally rendered the per-service home shell
 * for ANY unmatched URL — a typo'd or dead link silently showed "something" instead of
 * failing visibly. This is what let `/infra` render the wrong screen for weeks.
 *
 * The catch-all is legitimately shared with the home shell's own surfaces (`/home`,
 * `/service/:name(/:tab)`, regex-sniffed by ServiceUrlSync) — this spec pins BOTH sides:
 * a genuinely unknown URL gets the 404 page, while the home shell's real surfaces still
 * render normally through the same route. No page.route mocks needed — the app runs
 * against the built-in mock-api layer (VITE_MOCK_API=true, see playwright.config.ts),
 * same as tests/smoke/url-sync.spec.ts.
 */
import { expect, test } from "@playwright/test";

test.describe("real 404 route", () => {
  test("an unknown URL renders the 404 page, not the home shell", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/this-route-does-not-exist");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("not-found-page")).toBeVisible();
    await expect(page.getByTestId("services-overview")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a stale/dead nav-shaped URL (the /infra incident's shape) 404s instead of silently rendering", async ({
    page,
  }) => {
    await page.goto("/infra");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("not-found-page")).toBeVisible();
  });

  test("the 404 page's 'Back to Cockpit' link navigates to a real screen", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await page.getByRole("link", { name: "Back to Cockpit" }).click();

    await expect(page).toHaveURL(/\/cockpit/);
    await expect(page.getByTestId("cockpit-page")).toBeVisible();
  });

  test("/home (a real home-shell surface) still renders the shell, not the 404", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("services-overview")).toBeVisible();
    await expect(page.getByTestId("not-found-page")).toHaveCount(0);
  });

  test("/service/:name/:tab (a real home-shell deep link) still renders the shell, not the 404", async ({ page }) => {
    await page.goto("/service/market-tick-data-service/ci");

    await expect(page.getByTestId("not-found-page")).toHaveCount(0);
    await expect(page.getByTestId("service-ci-tab")).toBeVisible();
  });
});
