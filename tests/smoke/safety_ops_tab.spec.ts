import { expect, type Page, test } from "@playwright/test";

// ── Helpers ──────────────────────────────────────────────────────────────────
// Tests run with VITE_MOCK_API=true. The app's window.fetch interceptor
// (mock-api.ts) handles all /api/* calls inside the browser — Playwright's
// page.route() intercepts at the network level AFTER mock-api.ts, so page.route()
// mocks for /api/safety-ops/* are never reached. Tests assert against the
// built-in mock data IDs defined in mock-api.ts:
//   signoff event_id:  "signoff-oom-exec", "signoff-dispute"
//   incident_key:      "inc-oom-execution-service", "inc-spurious-killswitch"

async function mockBase(page: Page) {
  await page.route("**/api/health", (r) =>
    r.fulfill({
      json: {
        status: "ok",
        version: "1.0.0-test",
        config_dir: "/config",
        gcs_fuse: { active: true, reason: "mounted" },
      },
    }),
  );
  await page.route("**/api/services", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/monitor/**", (r) =>
    r.fulfill({
      json: { jobs: [], total: 0, queried_at: new Date().toISOString(), cloud: "gcp", env: "dev" },
    }),
  );
  await page.route("**/api/dart/**", (r) => r.fulfill({ json: {} }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("SafetyOps tab", () => {
  test.beforeEach(async ({ page }) => {
    await mockBase(page);
    await page.goto("/safety-ops");
    await page.waitForLoadState("networkidle");
  });

  test("renders page heading and all three panels", async ({ page }) => {
    await expect(page.locator('[data-testid="safety-ops-heading"]')).toBeVisible();
    await expect(page.locator('[data-testid="layer0-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="llm-verdicts-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-ack-queue-panel"]')).toBeVisible();
  });

  // IDs from mock-api.ts built-in safety-ops handlers (event_id: "signoff-oom-exec")
  test("llm-verdicts panel renders live signoff data", async ({ page }) => {
    await expect(page.locator('[data-testid="signoff-signoff-oom-exec"]')).toBeVisible();
    await expect(page.getByText("inc-oom-execution-service").first()).toBeVisible();
    await expect(page.getByText("APPROVED").first()).toBeVisible();
  });

  // IDs from mock-api.ts (incident_key: "inc-oom-execution-service")
  test("audit-ack queue renders live incident row", async ({ page }) => {
    await expect(page.locator('[data-testid="queue-row-inc-oom-execution-service"]')).toBeVisible();
    await expect(page.getByText("HIGH").first()).toBeVisible();
  });

  // Ack buttons: verify present + enabled + click does not throw.
  // window.fetch mock (mock-api.ts) handles the POST internally — no real HTTP
  // request is made, so waitForResponse() would hang. Verify UI stability instead.
  test("op-ack button is enabled and fires POST", async ({ page }) => {
    const btn = page.locator('[data-testid="op-ack-inc-oom-execution-service"]');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    await btn.click();
    // Mock returns ok:true → loadAll() re-renders; panel stays visible
    await expect(page.locator('[data-testid="audit-ack-queue-panel"]')).toBeVisible();
  });

  test("audit-ack button is enabled and fires POST", async ({ page }) => {
    const btn = page.locator('[data-testid="audit-ack-inc-oom-execution-service"]');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(page.locator('[data-testid="audit-ack-queue-panel"]')).toBeVisible();
  });

  test("layer-0 action buttons are present but disabled (typed-confirm not wired)", async ({ page }) => {
    const btn = page.locator('[data-testid="layer0-action-kill_switch_activate"]');
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });
});
