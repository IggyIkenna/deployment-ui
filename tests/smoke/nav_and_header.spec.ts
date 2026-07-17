/**
 * Smoke tests — Header env-tier badge, mobile nav, and per-page renders.
 *
 * S4 of work_split_2026_05_18_harsh.md:
 * - Env-tier badge (h3 shipped 2026-05-18): shows DEV on localhost, tooltip, colors
 * - Mobile hamburger menu open/close
 * - Nav link routing to each top-level page
 * - Per-page render smoke (no JS crash) for DART, Research, Live Ops, etc.
 */

import { expect, type Page, test } from "@playwright/test";

// ── Minimal mock setup ────────────────────────────────────────────────────

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  mock_mode: false,
  gcs_fuse: { active: true, reason: "mounted" },
};

async function mockBase(page: Page) {
  await page.route("**/api/health", (route) => route.fulfill({ json: MOCK_HEALTH }));
  await page.route("**/api/services", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/monitor/**", (route) =>
    route.fulfill({ json: { jobs: [], total: 0, queried_at: new Date().toISOString(), cloud: "gcp", env: "dev" } }),
  );
  await page.route("**/api/dart/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/ml/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/strategy/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/research/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/ops/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/deployments**", (route) => route.fulfill({ json: { deployments: [] } }));
  await page.route("**/api/costs/**", (route) =>
    route.fulfill({ json: { date: "2026-05-18", total_usd: 0, by_asset_group: [], by_archetype: [], by_vm: [] } }),
  );
}

// ── Env-tier badge ────────────────────────────────────────────────────────

test.describe("Header — status menu (env tier + utilities)", () => {
  // The env badge, cloud toggle, Clear Cache, API status, storage badge and version were
  // always-on chips in the top bar until 2026-07-17; they now live behind the StatusMenu
  // chip so the bar can carry the page nav. The chip itself keeps the two signals you must
  // not have to click for: the health dot and LIVE-vs-MOCK.

  async function openStatus(page: import("@playwright/test").Page) {
    await page.getByTestId("status-menu-trigger").click();
    await expect(page.getByTestId("status-menu")).toBeVisible();
  }

  test("the collapsed chip still surfaces the data mode without a click", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    // Playwright runs the UI with VITE_MOCK_API=true — mock must never be hidden.
    await expect(page.getByTestId("status-menu-trigger")).toContainText("MOCK");
  });

  test("shows DEV badge on localhost (green text)", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await openStatus(page);

    const badge = page.getByTestId("env-tier-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("DEV");
  });

  test("DEV badge has green color class", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await openStatus(page);

    await expect(page.getByTestId("env-tier-badge")).toHaveClass(/text-green-400/);
  });

  test("status menu shows env/api/cloud rows", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await openStatus(page);

    const menu = page.getByTestId("status-menu");
    await expect(menu.getByText("Environment")).toBeVisible();
    await expect(menu.getByText(/env:/)).toBeVisible();
    await expect(menu.getByText(/api:/)).toBeVisible();
    await expect(menu.getByText(/cloud:/)).toBeVisible();
  });

  test("status menu shows 'dev' as env value + localhost in the api URL", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await openStatus(page);

    const menu = page.getByTestId("status-menu");
    await expect(menu).toContainText("dev");
    await expect(menu.getByText(/localhost.*\/api/)).toBeVisible();
  });

  test("status menu carries the utilities the top bar used to show", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await openStatus(page);

    // Nothing was dropped in the move — just relocated one click away.
    await expect(page.getByTestId("cloud-toggle-gcp")).toBeVisible();
    await expect(page.getByTestId("cloud-toggle-aws")).toBeVisible();
    await expect(page.getByText("Clear Cache")).toBeVisible();
  });

  test("status menu dismisses on outside click and on Escape", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await openStatus(page);
    await page.locator("body").click({ position: { x: 10, y: 400 } });
    await expect(page.getByTestId("status-menu")).toHaveCount(0);

    await openStatus(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("status-menu")).toHaveCount(0);
  });
});

// ── Mobile hamburger menu ────────────────────────────────────────────────

test.describe("Header — mobile hamburger menu", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("hamburger button visible on narrow viewport", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="mobile-menu-btn"]')).toBeVisible();
  });

  test("clicking hamburger opens mobile nav", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await page.locator('[data-testid="mobile-menu-btn"]').click();
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
  });

  test("mobile nav contains the Cockpit link (top bar is utility-only)", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await page.locator('[data-testid="mobile-menu-btn"]').click();
    await expect(page.getByRole("link", { name: /Cockpit/i })).toBeVisible();
  });

  test("clicking a mobile nav link closes the menu", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await page.locator('[data-testid="mobile-menu-btn"]').click();
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();

    await page.getByRole("link", { name: /Cockpit/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="mobile-nav"]')).not.toBeVisible();
  });
});

// ── Nav link routing ────────────────────────────────────────────────────

// The former top-bar links (ML/Strategy/Exec-BT/Live-Ops) moved into the cockpit's
// Consoles section (top bar is utility-only now). These verify the cockpit routes to them.
test.describe("Cockpit consoles — route to the folded surfaces", () => {
  const CONSOLES = [
    { id: "ml", url: /\/research\/ml-experiments/ },
    { id: "strategy", url: /\/research\/strategy-backtests/ },
    { id: "exec-bt", url: /\/research\/execution-backtests/ },
    { id: "live-ops", url: /\/ops\/live-deployments/ },
  ];
  for (const c of CONSOLES) {
    test(`cockpit console "${c.id}" routes correctly`, async ({ page }) => {
      await mockBase(page);
      await page.goto("/cockpit");
      await page.waitForLoadState("networkidle");

      await page.getByTestId(`cockpit-console-${c.id}`).click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(c.url);
    });
  }
});

// ── Per-page no-crash smoke ───────────────────────────────────────────────

test.describe("Page renders — no crash smoke", () => {
  test("ML experiments page renders without JS error", async ({ page }) => {
    await mockBase(page);
    await page.goto("/research/ml-experiments");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });

  test("Strategy backtests page renders without JS error", async ({ page }) => {
    await mockBase(page);
    await page.goto("/research/strategy-backtests");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });

  test("Execution backtests page renders without JS error", async ({ page }) => {
    await mockBase(page);
    await page.goto("/research/execution-backtests");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });

  test("Live deployments page renders without JS error", async ({ page }) => {
    await mockBase(page);
    await page.goto("/ops/live-deployments");
    // This page streams (event/log feeds) so `networkidle` never settles — wait on the
    // page heading as the deterministic render signal instead (a crash → error boundary,
    // no heading).
    await expect(page.getByRole("heading", { name: "Live Deployments" })).toBeVisible();

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });

  test("VM Deployments page renders without JS error", async ({ page }) => {
    await mockBase(page);
    await page.goto("/vm-deployments");
    // This page polls the deployment registry so `networkidle` never settles — wait on the
    // page heading as the deterministic render signal instead.
    await expect(page.getByRole("heading", { name: "VM Deployments" })).toBeVisible();

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });

  test("Chaos page renders without JS error", async ({ page }) => {
    await mockBase(page);
    await page.goto("/chaos");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });
});
