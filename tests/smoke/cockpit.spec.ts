/**
 * Smoke + regression: Cockpit — the unified deployment & health observability
 * surface, and the DEFAULT page of the deployment UI.
 *
 * SCAFFOLD STAGE (operator 2026-06-23): the cockpit ships its full page/tab IA with
 * placeholder data first; this spec guards the navigation + structure so a later
 * data-wiring change can't silently drop a tab/tile. It asserts:
 *  - "/" redirects to /cockpit (cockpit is the default page)
 *  - all 7 tabs render (Health · Deploy · Live · Batch · Paper · Fleet · Consolidators)
 *  - the Health landing tile grid (every monitoring domain present)
 *  - each tab switches and renders its pane (Deploy entry points, dynamics tables,
 *    Fleet reconciliation, Consolidators)
 *  - the Header "Cockpit" nav link routes here from another page
 *
 * The page makes NO /api calls yet (placeholders) — only the app-shell mocks are needed.
 *
 * Plan: unified_deployment_health_cockpit_2026_06_23.md (parent_epic observability_master).
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
  await page.route("**/api/deployments**", (route) => route.fulfill({ json: { deployments: [] } }));
}

const TAB_IDS = [
  "health",
  "deploy",
  "live",
  "batch",
  "paper",
  "fleet",
  "consolidators",
  "ci",
  "alerts",
  "launch",
  "chaos",
  "safety",
] as const;

test.describe("Cockpit — scaffold IA", () => {
  test("/ redirects to /cockpit (cockpit is the default page)", async ({ page }) => {
    await mockBase(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/cockpit/);
    await expect(page.getByTestId("cockpit-page")).toBeVisible();
  });

  test("renders the page with all 12 tabs", async ({ page }) => {
    await mockBase(page);
    await page.goto("/cockpit");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("cockpit-page")).toBeVisible();
    for (const id of TAB_IDS) {
      await expect(page.getByTestId(`cockpit-tab-${id}`)).toBeVisible();
    }
  });

  test("Health landing shows the full monitoring tile grid wired to the real rollup", async ({ page }) => {
    await mockBase(page);
    await page.goto("/cockpit");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("cockpit-health")).toBeVisible();
    for (const id of [
      "live",
      "batch",
      "paper",
      "fleet",
      "consolidators",
      "coverage",
      "ci",
      "github",
      "billing",
      "alerts",
    ]) {
      await expect(page.getByTestId(`cockpit-tile-${id}`)).toBeVisible();
    }
    // The landing is wired to GET /api/health/overview — the live rollup banner replaces the
    // old placeholder note, and the rollup tiles render REAL status + value (not "—").
    await expect(page.getByTestId("cockpit-health-overall")).toBeVisible();
    await expect(page.getByTestId("cockpit-health-error")).toHaveCount(0);
    // The consolidator overview tile carries the real value from the rollup ("DOWN for: cefi" in mock).
    await expect(page.getByTestId("cockpit-tile-consolidators")).toContainText("cefi");
    // The fleet tile reflects the rollup census, not the placeholder em-dash.
    await expect(page.getByTestId("cockpit-tile-status-fleet")).not.toHaveText("—");
  });

  test("each tab switches and renders its pane", async ({ page }) => {
    await mockBase(page);
    await page.goto("/cockpit?tab=fleet");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-fleet")).toBeVisible();
    await expect(page.getByTestId("cockpit-fleet-card-unknown")).toBeVisible();

    await page.getByTestId("cockpit-tab-deploy").click();
    await expect(page.getByTestId("cockpit-deploy")).toBeVisible();
    await expect(page.getByTestId("cockpit-deploy-paper")).toBeVisible();

    await page.getByTestId("cockpit-tab-consolidators").click();
    await expect(page.getByTestId("cockpit-consolidators")).toBeVisible();
    await expect(page.getByTestId("cockpit-consolidator-defi")).toBeVisible();
    // Consolidators wires to GET /api/health/consolidator — real per-AG status, not placeholder.
    await expect(page.getByTestId("cockpit-consolidators-overall")).toBeVisible();
    await expect(page.getByTestId("cockpit-consolidators-error")).toHaveCount(0);
    // cefi is DOWN with per-VM shard fallback active in the mock rollup.
    await expect(page.getByTestId("cockpit-consolidator-cefi")).toContainText("ACTIVE");
    await expect(page.getByTestId("cockpit-consolidator-status-defi")).not.toHaveText("—");
  });

  test("Header Cockpit nav link routes to /cockpit from another page", async ({ page }) => {
    await mockBase(page);
    await page.goto("/deployments");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("nav-cockpit").click();
    await expect(page).toHaveURL(/\/cockpit/);
    await expect(page.getByTestId("cockpit-page")).toBeVisible();
  });
});

/**
 * Regression: the Live / Batch / Paper / Fleet cockpit tabs are now an EMBEDDED APP
 * (folded Deployments + VM Deployments inventory), not placeholder tables — they render
 * the REAL inventory from the mock API (VITE_MOCK_API=true via the playwright webServer).
 * Guards Phase 0.7 "Fold Deployments + VM Deployments + Live Ops". Note: NO page.route
 * mock here — the dev mock-api serves /api/deployments/inventory + /vm-deployments so the
 * folded components get real-shaped data (the cockpit owns ?tab=; the embedded umbrella is
 * a prop, never ?umbrella=, so there is no query collision).
 */
test.describe("Cockpit — Live/Batch/Paper/Fleet embedded inventory", () => {
  test("Live tab renders the folded Deployments inventory with a real live row", async ({ page }) => {
    await page.goto("/cockpit?tab=live");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-live")).toBeVisible();
    // The folded DeploymentsContent renders chrome-less (no standalone <main>/umbrella tabs).
    await expect(page.getByTestId("cockpit-live").getByTestId("umbrella-tabs")).toHaveCount(0);
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    // A real LIVE target row from the mock inventory + the LIVE-preset feed-health column.
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("feed-health-defi-live-capture-1")).toBeVisible();
  });

  test("Batch tab renders the folded inventory with the failed/137 (OOM) row", async ({ page }) => {
    await page.goto("/cockpit?tab=batch");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-batch")).toBeVisible();
    const row = page.getByTestId("deployment-row-sports-backfill-20260621");
    await expect(row).toBeVisible();
    await expect(row).toContainText("137 (OOM)");
  });

  test("Paper tab renders the folded inventory with a paper row", async ({ page }) => {
    await page.goto("/cockpit?tab=paper");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-paper")).toBeVisible();
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
  });

  test("Fleet tab renders the real VM census (every VM accounted for)", async ({ page }) => {
    await page.goto("/cockpit?tab=fleet");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-fleet")).toBeVisible();
    // The reconciliation alarm cards stay (wire to /api/fleet/reconciliation in Phase 4) …
    await expect(page.getByTestId("cockpit-fleet-card-unknown")).toBeVisible();
    // … plus the REAL active/archive VM census is folded in (chrome-less).
    await expect(page.getByTestId("vm-deployments-content")).toBeVisible();
  });
});

/**
 * Regression: the CI / Alerts&Logs / Launch / Safety tabs are now EMBEDDED folds
 * (RepoCiContent, AlertsContent + live log-tail, ML/Strategy/Exec sub-tabs,
 * SafetyOpsContent) — not nav-away links. Asserts the static pane chrome renders
 * (data may be loading in mock mode; the embed must not crash the cockpit).
 * Guards Phase 0.7 "Fold Repos CI / Alerts / Launch / Safety Ops".
 */
test.describe("Cockpit — CI / Alerts&Logs / Launch / Safety embedded folds", () => {
  test("Alerts & Logs tab folds the alert ledger + a live log-tail with a target input", async ({ page }) => {
    await mockBase(page);
    // The log-tail opens an EventSource (SSE) that holds the connection open, so
    // `networkidle` never settles — wait on DOM + the explicit testids instead.
    await page.goto("/cockpit?tab=alerts");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("cockpit-alerts-logs")).toBeVisible();
    await expect(page.getByTestId("cockpit-logs-target")).toBeVisible();
    await expect(page.getByTestId("cockpit-logs-empty")).toBeVisible();
    // deep-link ?logs=<target> auto-opens the streaming panel (alert → logs flow)
    await page.goto("/cockpit?tab=alerts&logs=strategy-live-csb-001");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("cockpit-logs-empty")).toHaveCount(0);
  });

  test("Launch tab folds the ML / Strategy / Execution sub-tabs", async ({ page }) => {
    await mockBase(page);
    await page.goto("/cockpit?tab=launch");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-launch")).toBeVisible();
    await expect(page.getByTestId("cockpit-launch-tab-strategy")).toBeVisible();
    await page.getByTestId("cockpit-launch-tab-strategy").click();
    await expect(page.getByTestId("cockpit-launch-tab-strategy")).toHaveAttribute("aria-selected", "true");
  });

  test("Safety tab folds the SafetyOps console + CI tab folds RepoCi (no crash)", async ({ page }) => {
    await mockBase(page);
    await page.goto("/cockpit?tab=safety");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("safety-ops-heading")).toBeVisible();
    await page.getByTestId("cockpit-tab-ci").click();
    await expect(page.getByTestId("cockpit-page")).toBeVisible();
  });
});
