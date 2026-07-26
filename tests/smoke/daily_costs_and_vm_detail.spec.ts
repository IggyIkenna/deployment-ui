/**
 * Smoke tests — VmDetail page.
 * Item 12: VM detail error states. (The DailyCosts-page coverage this file used to carry was
 * superseded by the Cost Observability redesign — see cost-observability.spec.ts, which tests
 * the current /ops/costs page against its real fetchCostSummary/Breakdown/Timeseries contract.)
 */

import { expect, type Page, test } from "@playwright/test";

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  gcs_fuse: { active: true, reason: "mounted" },
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
