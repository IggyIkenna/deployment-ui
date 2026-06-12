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

test.describe("Header — env-tier badge", () => {
  test("shows DEV badge on localhost (green text)", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The badge renders the uppercase tier from resolveEnvTier()
    const badge = page.getByRole("button", { name: /Environment: dev/i });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("DEV");
  });

  test("DEV badge has green color class", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const badge = page.getByRole("button", { name: /Environment: dev/i });
    await expect(badge).toHaveClass(/text-green-400/);
  });

  test("clicking env badge opens tooltip with env/api/cloud rows", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const badge = page.getByRole("button", { name: /Environment: dev/i });
    await badge.click();

    // Tooltip should show env/api/cloud info
    await expect(page.getByText("Environment")).toBeVisible();
    await expect(page.getByText(/env:/)).toBeVisible();
    await expect(page.getByText(/api:/)).toBeVisible();
    await expect(page.getByText(/cloud:/)).toBeVisible();
  });

  test("tooltip shows 'dev' as env value", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const badge = page.getByRole("button", { name: /Environment: dev/i });
    await badge.click();

    // Scope to the tooltip popover (absolute positioned div)
    const tooltip = page.locator("div.absolute.right-0.top-full");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("dev");
  });

  test("tooltip shows localhost in api URL", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const badge = page.getByRole("button", { name: /Environment: dev/i });
    await badge.click();

    await expect(page.getByText(/localhost.*\/api/)).toBeVisible();
  });

  test("tooltip dismisses on blur", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const badge = page.getByRole("button", { name: /Environment: dev/i });
    await badge.click();
    await expect(page.getByText("Environment")).toBeVisible();

    // Click elsewhere to blur
    await page.locator("body").click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300); // onBlur timeout is 150ms
    await expect(page.getByText("Environment")).not.toBeVisible();
  });
});

// ── Mobile hamburger menu ────────────────────────────────────────────────

test.describe("Header — mobile hamburger menu", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("hamburger button visible on narrow viewport", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="mobile-menu-btn"]')).toBeVisible();
  });

  test("clicking hamburger opens mobile nav", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator('[data-testid="mobile-menu-btn"]').click();
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
  });

  test("mobile nav contains VM Deployments link", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator('[data-testid="mobile-menu-btn"]').click();
    await expect(page.getByRole("link", { name: /VM Deployments/i })).toBeVisible();
  });

  test("clicking a mobile nav link closes the menu", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator('[data-testid="mobile-menu-btn"]').click();
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();

    await page.getByRole("link", { name: /VM Deployments/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="mobile-nav"]')).not.toBeVisible();
  });
});

// ── Nav link routing ────────────────────────────────────────────────────

test.describe("Header — nav link routing", () => {
  test("ML link navigates to /research/ml-experiments", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /^ML$/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/research\/ml-experiments/);
  });

  test("Strategy link navigates to /research/strategy-backtests", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /^Strategy$/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/research\/strategy-backtests/);
  });

  test("Exec BT link navigates to /research/execution-backtests", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /Exec BT/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/research\/execution-backtests/);
  });

  test("Live Ops link navigates to /ops/live-deployments", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /Live Ops/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/ops\/live-deployments/);
  });
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
