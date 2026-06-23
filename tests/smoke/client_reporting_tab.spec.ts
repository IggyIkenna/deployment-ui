import { expect, Page, test } from "@playwright/test";

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_SERVICES = [
  {
    name: "client-reporting-api",
    description: "Client PnL / NAV reporting",
    dimensions: [],
    docker_image: "gcr.io/project/client-reporting-api:latest",
    cloud_run_job_name: "client-reporting-api",
  },
];

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  gcs_fuse: { active: true, reason: "mounted" },
};

const MOCK_NAV = {
  client_id: "demo",
  share_class: "USD",
  mode: "mock",
  snapshots: [
    {
      date: "2026-05-01",
      nav_usd: "1000000.00",
      nav_in_share_class: "1000000.00",
      nav_delta_usd: "0.00",
      timestamp: "2026-05-01T00:00:00Z",
    },
    {
      date: "2026-05-02",
      nav_usd: "1010000.00",
      nav_in_share_class: "1010000.00",
      nav_delta_usd: "10000.00",
      timestamp: "2026-05-02T00:00:00Z",
    },
  ],
};

const MOCK_PNL = {
  client_id: "demo",
  share_class: "USD",
  entries: [
    {
      period_tag: "2026-05-01",
      realized_pnl: "500.00",
      unrealized_pnl: "1200.00",
      total_pnl: "1700.00",
      strategy_alpha_total: "1500.00",
      execution_alpha_total: "200.00",
      timestamp: "2026-05-01T00:00:00Z",
    },
  ],
};

const MOCK_POSITIONS = {
  client_id: "demo",
  positions: [
    {
      archetype_id: "carry_staked_basis",
      strategy_leg_id: "leg-1",
      trade_id: "t-001",
      venue: "binance",
      instrument: "ETH-USDT",
      qty: "1.5",
      mark_price: "3000.00",
      cost_basis: "2900.00",
      realized_pnl: "0.00",
      unrealized_pnl: "150.00",
      share_class: "USD",
      timestamp: "2026-05-12T00:00:00Z",
    },
  ],
};

const MOCK_ATTRIBUTION = {
  client_id: "demo",
  rows: [
    {
      strategy_id: "carry_staked_basis",
      instrument_id: "ETH-USDT",
      date: "2026-05-01",
      factor: "MOMENTUM",
      layer: "STRATEGY",
      amount: 800.0,
      archetype_id: "carry_staked_basis",
      fill_id: null,
      venue: "binance",
      benchmark_price: 3000.0,
    },
  ],
};

// ── Helper: wire all needed routes ──────────────────────────────────────────

async function mockAllApis(page: Page) {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({ json: MOCK_HEALTH });
  });
  await page.route("**/api/services", async (route) => {
    await route.fulfill({ json: MOCK_SERVICES });
  });
  await page.route("**/api/deployments**", async (route) => {
    await route.fulfill({
      json: { deployments: [], total: 0 },
    });
  });
  await page.route("**/api/services/*/dimensions", async (route) => {
    await route.fulfill({
      json: { service: "client-reporting-api", dimensions: [], cli_args: {} },
    });
  });
  await page.route("**/api/services/*/checklist/validate", async (route) => {
    await route.fulfill({
      json: {
        service: "client-reporting-api",
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
        service: "client-reporting-api",
        last_updated: "2026-05-12T00:00:00Z",
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
      json: { service: "client-reporting-api", start_dates: {} },
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
        service: "client-reporting-api",
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
        service: "client-reporting-api",
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
        service: "client-reporting-api",
        start_date: "2026-01-01",
        end_date: "2026-05-12",
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
    await route.fulfill({ json: { builds: [], total: 0 } });
  });
  await page.route("**/api/cache/clear", async (route) => {
    await route.fulfill({ json: { cleared: true } });
  });

  // client-reporting-api endpoints (VITE_CLIENT_REPORTING_API_URL defaults to localhost:8014)
  await page.route("**/api/v1/clients/*/nav**", async (route) => {
    await route.fulfill({ json: MOCK_NAV });
  });
  await page.route("**/api/v1/clients/*/pnl**", async (route) => {
    await route.fulfill({ json: MOCK_PNL });
  });
  await page.route("**/api/v1/clients/*/positions**", async (route) => {
    await route.fulfill({ json: MOCK_POSITIONS });
  });
  await page.route("**/api/v1/clients/*/attribution**", async (route) => {
    await route.fulfill({ json: MOCK_ATTRIBUTION });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("ClientReportingTab", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  test("client-reporting-api shows Client Reporting tab", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await page.getByText("client reporting api").first().click();

    await expect(page.getByRole("tab", { name: /Client Reporting/i })).toBeVisible();
  });

  test("Client Reporting tab renders the root container", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await page.getByText("client reporting api").first().click();
    await page.getByRole("tab", { name: /Client Reporting/i }).click();

    await expect(page.locator('[data-testid="client-reporting-tab"]')).toBeVisible();
  });

  test("Client Reporting tab shows NAV and PnL section headings", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await page.getByText("client reporting api").first().click();
    await page.getByRole("tab", { name: /Client Reporting/i }).click();

    await expect(page.locator('[data-testid="client-reporting-tab"]')).toBeVisible();
    await expect(page.getByText(/NAV/i).first()).toBeVisible();
  });

  test("non-client-reporting services do not show Client Reporting tab", async ({ page }) => {
    // Override with a different service list
    await page.route("**/api/services", async (route) => {
      await route.fulfill({
        json: [
          {
            name: "instruments-service",
            description: "Instrument universe",
            dimensions: [],
            docker_image: "gcr.io/project/instruments-service:latest",
            cloud_run_job_name: "instruments-service",
          },
        ],
      });
    });

    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await page.getByText("instruments").first().click();

    await expect(page.getByRole("tab", { name: /Client Reporting/i })).not.toBeVisible();
  });
});
