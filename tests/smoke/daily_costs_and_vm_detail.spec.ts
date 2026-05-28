/**
 * Smoke tests — DailyCosts page + VmDetail page.
 * Item 12: cost dashboard date-range navigation, VM detail error states.
 */

import { expect, type Page, test } from "@playwright/test";

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  gcs_fuse: { active: true, reason: "mounted" },
};

const MOCK_COSTS = {
  date: "2026-05-15",
  total_usd: 12.34,
  by_asset_group: [
    { asset_group: "cefi", vm_count: 2, total_usd: 8.0, archetype_count: 1 },
    { asset_group: "defi", vm_count: 1, total_usd: 4.34, archetype_count: 1 },
  ],
  by_archetype: [
    { archetype: "carry_staked_basis", vm_count: 2, total_usd: 8.0 },
    { archetype: "arbitrage_price_dispersion", vm_count: 1, total_usd: 4.34 },
  ],
  by_vm: [
    {
      vm_name: "cefi-backfill-20260515",
      asset_group: "cefi",
      archetype: "carry_staked_basis",
      machine_type: "n1-standard-4",
      runtime_hours: 2.0,
      compute_usd: 7.6,
      disk_usd: 0.4,
      total_usd: 8.0,
    },
    {
      vm_name: "defi-backfill-20260515",
      asset_group: "defi",
      archetype: "arbitrage_price_dispersion",
      machine_type: "n1-standard-2",
      runtime_hours: 1.0,
      compute_usd: 4.0,
      disk_usd: 0.34,
      total_usd: 4.34,
    },
  ],
};

const MOCK_VM_EVENTS = {
  vm_name: "cefi-backfill-20260515",
  service: "instruments-service",
  date: "2026-05-15",
  hours_scanned: [0, 1],
  total_events: 2,
  events: [
    {
      event: "STARTED",
      service: "instruments-service",
      timestamp: "2026-05-15T00:00:01+00:00",
      severity: "INFO",
      correlation_id: null,
      details: null,
    },
    {
      event: "STOPPED",
      service: "instruments-service",
      timestamp: "2026-05-15T02:00:00+00:00",
      severity: "INFO",
      correlation_id: null,
      details: null,
    },
  ],
  truncated: false,
  next_page_token: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function mockBase(page: Page) {
  await page.route("**/api/health", (route) => route.fulfill({ json: MOCK_HEALTH }));
  await page.route("**/api/services", (route) => route.fulfill({ json: [] }));
}

async function mockCostApiOk(page: Page) {
  await page.route("**/api/costs/daily**", (route) => route.fulfill({ json: MOCK_COSTS }));
}

async function mockCostApiError(page: Page) {
  await page.addInitScript(() => {
    (window as typeof window & { __mockErrors?: Array<{ pattern: string; status: number }> }).__mockErrors = [
      { pattern: "/api/costs/daily", status: 500 },
    ];
  });
}

async function mockVmEventsOk(page: Page) {
  await page.route("**/api/vm/*/events**", (route) => route.fulfill({ json: MOCK_VM_EVENTS }));
  await page.route("**/api/vm/*/health**", (route) =>
    route.fulfill({ json: { vm_name: "cefi-backfill-20260515", status: "healthy", event_count: 2 } }),
  );
}

async function mockVmEventsError(page: Page) {
  await page.addInitScript(() => {
    (window as typeof window & { __mockErrors?: Array<{ pattern: string; status: number }> }).__mockErrors = [
      { pattern: "/api/vm/", status: 503 },
    ];
  });
}

// ── DailyCosts tests ──────────────────────────────────────────────────────

test.describe("DailyCosts page", () => {
  test("heading renders at /ops/costs", async ({ page }) => {
    await mockBase(page);
    await mockCostApiOk(page);
    await page.goto("/ops/costs");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Daily VM Costs")).toBeVisible();
  });

  test("shows total USD when data loads", async ({ page }) => {
    await mockBase(page);
    await mockCostApiOk(page);
    await page.goto("/ops/costs");
    await page.waitForLoadState("networkidle");

    const total = page.locator('[data-testid="total-usd"]');
    await expect(total).toBeVisible();
    await expect(total).toContainText("12");
  });

  test("shows 'By Asset Group' table with cefi row", async ({ page }) => {
    await mockBase(page);
    await mockCostApiOk(page);
    await page.goto("/ops/costs");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("By Asset Group")).toBeVisible();
    await expect(page.getByText("cefi").first()).toBeVisible();
  });

  test("date picker is present and interactive", async ({ page }) => {
    await mockBase(page);
    await mockCostApiOk(page);
    await page.goto("/ops/costs");
    await page.waitForLoadState("networkidle");

    const datePicker = page.locator('input[aria-label="Select date"]');
    await expect(datePicker).toBeVisible();
    await datePicker.fill("2026-05-10");
    await expect(datePicker).toHaveValue("2026-05-10");
  });

  test("shows error alert when API fails", async ({ page }) => {
    await mockBase(page);
    await mockCostApiError(page);
    await page.goto("/ops/costs");
    await page.waitForLoadState("networkidle");

    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible();
  });
});

// ── VmDetail tests ────────────────────────────────────────────────────────

test.describe("VmDetail page", () => {
  test("renders vm name in title", async ({ page }) => {
    await mockBase(page);
    await mockVmEventsOk(page);
    await page.goto("/ops/vms/cefi-backfill-20260515");
    await page.waitForLoadState("networkidle");

    const title = page.locator('[data-testid="vm-detail-title"]');
    await expect(title).toBeVisible();
    await expect(title).toContainText("cefi-backfill-20260515");
  });

  test("shows events timeline container", async ({ page }) => {
    await mockBase(page);
    await mockVmEventsOk(page);
    await page.goto("/ops/vms/cefi-backfill-20260515");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="vm-events-timeline"]')).toBeVisible();
  });

  test("shows error alert in timeline when events API fails", async ({ page }) => {
    await mockBase(page);
    await mockVmEventsError(page);
    await page.goto("/ops/vms/cefi-backfill-20260515");
    await page.waitForLoadState("networkidle");

    const alert = page.locator('[data-testid="vm-events-timeline"] [role="alert"]');
    await expect(alert).toBeVisible();
  });
});
