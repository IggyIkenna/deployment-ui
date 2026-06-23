/**
 * Safety Ops tab — deployment-ui mirror smoke tests.
 *
 * Plan: plans/active/deployment_ui_safety_ops_tab_2026_05_23.md Phase 3 P0.9-P0.10
 * Regression guard for: /safety-ops route + nav link + 3 panels (layer0, verdicts, audit-ack queue).
 */

import { expect, type Page, test } from "@playwright/test";

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
  await page.route("**/api/safety-ops/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/dart/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/ops/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/deployments**", (route) => route.fulfill({ json: { deployments: [] } }));
}

// ── Nav link ─────────────────────────────────────────────────────────────────

test.describe("Safety Ops — nav link", () => {
  test("Safety Ops link visible in desktop header", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const link = page.getByRole("link", { name: /Safety Ops/i }).first();
    await expect(link).toBeVisible();
  });

  test("Safety Ops link navigates to /safety-ops", async ({ page }) => {
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("link", { name: /Safety Ops/i })
      .first()
      .click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/safety-ops/);
  });

  test("Safety Ops appears in mobile nav", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockBase(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await page.locator('[data-testid="mobile-menu-btn"]').click();
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
    await expect(page.getByRole("link", { name: /Safety Ops/i })).toBeVisible();
  });
});

// ── Page render ──────────────────────────────────────────────────────────────

test.describe("Safety Ops — page render", () => {
  test("page renders without JS error", async ({ page }) => {
    await mockBase(page);
    await page.goto("/safety-ops");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Unknown Error|Uncaught TypeError/i)).not.toBeVisible();
  });

  test("heading visible", async ({ page }) => {
    await mockBase(page);
    await page.goto("/safety-ops");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="safety-ops-heading"]')).toBeVisible();
    await expect(page.locator('[data-testid="safety-ops-heading"]')).toContainText("Safety Ops");
  });
});

// ── Three panels ─────────────────────────────────────────────────────────────

test.describe("Safety Ops — three panels", () => {
  test("Layer-0 actions panel visible", async ({ page }) => {
    await mockBase(page);
    await page.goto("/safety-ops");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="layer0-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="layer0-panel"]')).toContainText("Layer-0 Actions");
  });

  test("LLM audit verdicts panel visible", async ({ page }) => {
    await mockBase(page);
    await page.goto("/safety-ops");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="llm-verdicts-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="llm-verdicts-panel"]')).toContainText("LLM Audit Verdicts");
  });

  test("audit-ack queue panel visible", async ({ page }) => {
    await mockBase(page);
    await page.goto("/safety-ops");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="audit-ack-queue-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-ack-queue-panel"]')).toContainText("Audit-Ack Queue");
  });

  test("layer0 actions include cancel_open_orders button", async ({ page }) => {
    await mockBase(page);
    await page.goto("/safety-ops");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="layer0-action-cancel_open_orders"]')).toBeVisible();
  });

  test("op-ack and audit-ack buttons visible in queue", async ({ page }) => {
    await mockBase(page);
    await page.goto("/safety-ops");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="op-ack-button"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="audit-ack-button"]').first()).toBeVisible();
  });
});
