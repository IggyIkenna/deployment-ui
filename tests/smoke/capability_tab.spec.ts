/**
 * Playwright smoke tests for the Capability tab.
 *
 * Regression guard (pw:L2):
 *   - Tab renders next to Data Status
 *   - Matrix view shows the archetype grid
 *   - Gaps panel counts match the manifest (missing_registry=60, etc.)
 *   - Sources view renders the sources table
 *
 * No API mocking needed — the Capability tab is 100% static (JSON bundled at
 * build time); the only external calls are the standard deployment-api routes
 * intercepted here to keep the app's navigation flow happy.
 *
 * Plan: capability_wizard_and_manifest_2026_06_11.md Phase 4
 */

import { expect, Page, test } from "@playwright/test";

// ── Minimal mocks needed to boot the app shell ─────────────────────────────

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  gcs_fuse: { active: true, reason: "mounted" },
};

const MOCK_SERVICES = [
  {
    name: "instruments-service",
    description: "Instrument universe",
    dimensions: [],
    docker_image: "gcr.io/project/instruments-service:latest",
    cloud_run_job_name: "instruments-service",
  },
];

async function mockAppShell(page: Page) {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({ json: MOCK_HEALTH });
  });
  await page.route("**/api/services", async (route) => {
    await route.fulfill({ json: MOCK_SERVICES });
  });
  await page.route("**/api/deployments**", async (route) => {
    await route.fulfill({ json: { deployments: [], total: 0 } });
  });
  await page.route("**/api/services/*/dimensions", async (route) => {
    await route.fulfill({
      json: { service: "instruments-service", dimensions: [], cli_args: {} },
    });
  });
  await page.route("**/api/services/*/checklist/validate", async (route) => {
    await route.fulfill({
      json: {
        service: "instruments-service",
        ready: true,
        readiness_percent: 100,
        total_items: 0,
        completed_items: 0,
        blocking_items: [],
        warnings: [],
        can_proceed_with_acknowledgment: false,
      },
    });
  });
  await page.route("**/api/services/*/checklist", async (route) => {
    await route.fulfill({
      json: {
        service: "instruments-service",
        last_updated: "2026-06-11T00:00:00Z",
        readiness_percent: 100,
        total_items: 0,
        completed_items: 0,
        partial_items: 0,
        pending_items: 0,
        not_applicable_items: 0,
        categories: [],
        blocking_items: [],
      },
    });
  });
  await page.route("**/api/config/region", async (route) => {
    await route.fulfill({
      json: {
        gcs_region: "asia-northeast1",
        storage_region: "asia-northeast1",
        cloud_provider: "gcp",
        zones: [],
      },
    });
  });
  await page.route("**/api/services/*/start-dates", async (route) => {
    await route.fulfill({
      json: { service: "instruments-service", start_dates: {} },
    });
  });
  await page.route("**/api/venues**", async (route) => {
    await route.fulfill({
      json: { categories: {}, category: "", venues: [], data_types: [] },
    });
  });
  await page.route("**/api/services/*/dependencies", async (route) => {
    await route.fulfill({
      json: {
        service: "instruments-service",
        description: "",
        upstream: [],
        outputs: [],
        external_dependencies: [],
        downstream_dependents: [],
      },
    });
  });
  await page.route("**/service-status/*/status", async (route) => {
    await route.fulfill({
      json: {
        service: "instruments-service",
        health: "healthy",
        last_data_update: null,
        last_deployment: null,
        last_build: null,
        last_code_push: null,
        anomalies: [],
        details: {
          deployment: { status: "idle" },
          build: { status: "idle" },
          data: { status: "ok" },
        },
      },
    });
  });
  await page.route("**/api/services/*/data-status**", async (route) => {
    await route.fulfill({
      json: {
        service: "instruments-service",
        start_date: "2026-01-01",
        end_date: "2026-06-11",
        overall_completion: 100,
        overall_complete: 10,
        overall_total: 10,
        overall_excluded: 0,
        categories: {},
      },
    });
  });
  await page.route("**/api/services/overview", async (route) => {
    await route.fulfill({
      json: { services: [], count: 1, healthy: 1, warnings: 0, errors: 0 },
    });
  });
  await page.route("**/cloud-builds/**", async (route) => {
    await route.fulfill({ json: { builds: [], triggers: [], total: 0 } });
  });
  await page.route("**/api/cache/clear", async (route) => {
    await route.fulfill({ json: { cleared: true } });
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe("CapabilityTab", () => {
  test.beforeEach(async ({ page }) => {
    await mockAppShell(page);
  });

  test("Capability tab trigger is visible next to Data Status", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Select instruments-service
    await page.getByText("instruments").first().click();
    await page.waitForLoadState("networkidle");

    // Both Data Status and Capability tabs should be visible
    await expect(page.getByRole("tab", { name: /Data Status/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Capability/i })).toBeVisible();
  });

  test("Capability tab renders Capability Matrix heading", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText("instruments").first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: /Capability/i }).click();

    await expect(page.getByText("Capability Matrix")).toBeVisible({ timeout: 10000 });
  });

  test("Matrix view shows archetype × instrument_type grid", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText("instruments").first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: /Capability/i }).click();

    // The matrix sub-tab should be active by default showing the grid
    await expect(page.getByTestId("capability-matrix-view")).toBeVisible({ timeout: 10000 });
    // Should show the Archetype column header
    await expect(page.getByText("Archetype", { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test("Gaps & Orphans panel shows gap type counts from manifest", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText("instruments").first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: /Capability/i }).click();

    // Switch to Gaps sub-tab
    await page.getByTestId("capability-gaps-tab-trigger").click();

    // Wait for gaps panel to render
    await expect(page.getByTestId("capability-gaps-panel")).toBeVisible({ timeout: 10000 });

    // Verify gap type rows are present (regression guard: row labels)
    await expect(page.getByTestId("gap-row-missing_registry")).toBeVisible();
    await expect(page.getByTestId("gap-row-needs_code_scan")).toBeVisible();
    await expect(page.getByTestId("gap-row-missing_extraction")).toBeVisible();
    await expect(page.getByTestId("gap-row-logical_dead_end")).toBeVisible();

    // Verify the manifest counts (regression: these are the static values from the manifest)
    await expect(page.getByTestId("gap-count-missing_registry")).toHaveText("60");
    await expect(page.getByTestId("gap-count-needs_code_scan")).toHaveText("3");
    await expect(page.getByTestId("gap-count-missing_extraction")).toHaveText("1");
    await expect(page.getByTestId("gap-count-logical_dead_end")).toHaveText("19");
  });

  test("Sources view renders data source table", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText("instruments").first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: /Capability/i }).click();

    // Switch to Sources sub-tab
    await page.getByTestId("capability-sources-tab-trigger").click();

    // Wait for sources table to render
    await expect(page.getByTestId("capability-sources-table")).toBeVisible({ timeout: 10000 });

    // Column headers should be present
    await expect(page.getByText("Source", { exact: true })).toBeVisible();
    await expect(page.getByText("Batch", { exact: true })).toBeVisible();
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
    await expect(page.getByText("Replay", { exact: true })).toBeVisible();
    await expect(page.getByText("Transport", { exact: true })).toBeVisible();
  });

  test("node/edge count shown in header matches manifest", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText("instruments").first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: /Capability/i }).click();

    // Static manifest: 409 nodes / 663 edges
    await expect(page.getByText(/409 nodes \/ 663 edges/)).toBeVisible({ timeout: 10000 });
  });
});
