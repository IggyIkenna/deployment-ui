import { test, expect } from "@playwright/test";

/**
 * Regression guard for the OS-forced light-theme fix (index.css light-palette block,
 * ~line 1047, and the cost-breakdown resizer hover icon, ~line 148).
 *
 * The app ships a dark trading-dashboard design (every visual baseline + this whole
 * Playwright suite defaults `colorScheme: "dark"`, see playwright.config.ts). Before
 * the fix, the light palette was gated on `@media (prefers-color-scheme: light)`
 * applied to `:root` — so a user whose OS/browser color scheme is set to LIGHT
 * silently got the light palette on every page, with `.theme-light` present in the
 * selector but no component/toggle anywhere in the app ever applying that class —
 * i.e. no way to force the intended dark default (operator-verified 2026-07-20 via
 * Playwright `page.emulateMedia({ colorScheme: 'light' })`: `--color-bg-primary`
 * resolved to `#ffffff` instead of the dark `#0a0a0b`).
 *
 * The fix makes the light palette OPT-IN ONLY via an explicit `.theme-light` class
 * (currently unreachable — no toggle exists yet — which is intentional: dark stays
 * the default until a real theme toggle ships) and removes the `@media` gate
 * entirely, so the OS color-scheme preference can no longer flip the app's theme.
 *
 * This spec pins BOTH directions: (1) a light-OS browser context with no explicit
 * theme class still renders the dark palette (the regression this guards), and
 * (2) explicitly applying `.theme-light` still opts into the light palette (so the
 * escape hatch a future toggle will use isn't accidentally deleted).
 */
test.describe("theme default is dark regardless of OS color-scheme preference", () => {
  test.use({ colorScheme: "light" });

  test("a light-OS browser context with no .theme-light class renders the dark palette", async ({ page }) => {
    await page.goto("/cockpit");

    const bgPrimary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim(),
    );
    expect(bgPrimary).toBe("#0a0a0b");

    // Cross-check against the actual painted background, not just the CSS variable.
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe("rgb(10, 10, 11)");
  });

  test("explicitly applying .theme-light still opts into the light palette", async ({ page }) => {
    await page.goto("/cockpit");

    const lightBgPrimary = await page.evaluate(() => {
      document.documentElement.classList.add("theme-light");
      const value = getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim();
      document.documentElement.classList.remove("theme-light");
      return value;
    });
    expect(lightBgPrimary).toBe("#ffffff");
  });
});
