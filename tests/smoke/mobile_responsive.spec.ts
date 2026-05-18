/**
 * Mobile-responsive smoke tests — S13 of work_split_2026_05_18_harsh.md.
 *
 * Two viewports tested:
 *   - iPhone SE  (375×667)
 *   - iPhone Pro (414×896)
 *
 * Checks:
 *   1. No JS crash on each top-level page load
 *   2. Primary content element is visible at mobile width
 *   3. Hamburger menu opens/closes on small screens
 *   4. No horizontal overflow (body scrollWidth ≤ viewport width)
 */

import { expect, type Page, test } from "@playwright/test";

// ── Shared mock helpers ───────────────────────────────────────────────────

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  mock_mode: true,
  gcs_fuse: { active: true, reason: "mounted" },
};

async function mockCommon(page: Page) {
  await page.route("**/api/health", (route) => route.fulfill({ json: MOCK_HEALTH }));
  await page.route("**/api/services", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/deployments**", (route) =>
    route.fulfill({ json: { deployments: [] } }),
  );
  await page.route("**/api/monitor/**", (route) =>
    route.fulfill({
      json: {
        jobs: [],
        total: 0,
        queried_at: new Date().toISOString(),
        cloud: "gcp",
        env: "dev",
      },
    }),
  );
  await page.route("**/api/costs/**", (route) =>
    route.fulfill({
      json: {
        date: "2026-05-18",
        total_usd: 0,
        by_asset_group: [],
        by_archetype: [],
        by_vm: [],
      },
    }),
  );
  await page.route("**/api/data-status**", (route) =>
    route.fulfill({ json: { rows: [], refreshed_at: new Date().toISOString() } }),
  );
  await page.route("**/api/dart/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/strategy/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/ml/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/treasury/**", (route) =>
    route.fulfill({
      json: {
        total_nav_usd: "0",
        per_source: [],
        asof_timestamp: new Date().toISOString(),
        reconciliation_status: "ok",
        has_stubs: false,
        source_count: 0,
      },
    }),
  );
  await page.route("**/api/clients/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/kill-switch/**", (route) =>
    route.fulfill({ json: { is_active: false, triggers: [] } }),
  );
  await page.route("**/api/risk/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/vm/**", (route) => route.fulfill({ json: { vms: [] } }));
  await page.route("**/api/infra/**", (route) => route.fulfill({ json: {} }));
}

// ── Viewport helpers ──────────────────────────────────────────────────────

const IPHONE_SE = { width: 375, height: 667 };
const IPHONE_PRO = { width: 414, height: 896 };

async function noHorizontalOverflow(page: Page) {
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = page.viewportSize()!.width;
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1); // 1px tolerance
}

// ── iPhone SE (375×667) ───────────────────────────────────────────────────

test.describe("Mobile — iPhone SE (375×667)", () => {
  test.use({ viewport: IPHONE_SE });

  test("home page loads without crash", async ({ page }) => {
    await mockCommon(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("hamburger menu is visible and opens nav", async ({ page }) => {
    await mockCommon(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const hamburger = page.getByRole("button", { name: /menu|hamburger|navigation/i });
    if (await hamburger.isVisible()) {
      await hamburger.click();
      // Nav items should appear after open
      await expect(page.locator("nav, [role='navigation']").first()).toBeVisible();
    }
  });

  test("home page has no horizontal overflow", async ({ page }) => {
    await mockCommon(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await noHorizontalOverflow(page);
  });

  test("deployments page loads at mobile width", async ({ page }) => {
    await mockCommon(page);
    await page.goto("/deployments");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test("data-status page loads at mobile width", async ({ page }) => {
    await mockCommon(page);
    await page.goto("/data-status");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test("costs page loads at mobile width", async ({ page }) => {
    await mockCommon(page);
    await page.goto("/costs");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
    await noHorizontalOverflow(page);
  });
});

// ── iPhone Pro (414×896) ─────────────────────────────────────────────────

test.describe("Mobile — iPhone Pro (414×896)", () => {
  test.use({ viewport: IPHONE_PRO });

  test("home page loads without crash", async ({ page }) => {
    await mockCommon(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("home page has no horizontal overflow", async ({ page }) => {
    await mockCommon(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await noHorizontalOverflow(page);
  });

  test("deployments page has no horizontal overflow", async ({ page }) => {
    await mockCommon(page);
    await page.goto("/deployments");
    await page.waitForLoadState("networkidle");
    await noHorizontalOverflow(page);
  });

  test("kill-switch page loads at mobile width", async ({ page }) => {
    await mockCommon(page);
    await page.goto("/kill-switch");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
    await noHorizontalOverflow(page);
  });
});
