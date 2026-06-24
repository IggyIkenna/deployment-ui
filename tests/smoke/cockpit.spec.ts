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
    // Phase 4: the reconciliation cards wire to GET /api/fleet/reconciliation — real counts, not "—".
    await expect(page.getByTestId("cockpit-fleet-value-unknown")).toHaveText("2");
    await expect(page.getByTestId("cockpit-fleet-status-unknown")).toHaveText("CRITICAL");
    await expect(page.getByTestId("cockpit-fleet-value-missing")).toHaveText("58");

    await page.getByTestId("cockpit-tab-deploy").click();
    await expect(page.getByTestId("cockpit-deploy")).toBeVisible();
    await expect(page.getByTestId("cockpit-deploy-paper")).toBeVisible();
    // Phase 6: the embedded deploy console (service-picker → DeployForm/CloudBuildsTab/DeploymentHistory).
    await expect(page.getByTestId("cockpit-deploy-console")).toBeVisible();
    await expect(page.getByTestId("deploy-service-picker")).toBeVisible();

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

  test("Live row drill opens the per-target detail IN the cockpit (Phase 0.5 slide-over)", async ({ page }) => {
    await page.goto("/cockpit?tab=live");
    await page.waitForLoadState("networkidle");
    // Clicking a row opens the chrome-less DeploymentDetail in a slide-over (no nav-away).
    await page.getByTestId("deployment-link-defi-live-capture-1").click();
    await expect(page.getByTestId("cockpit-detail-panel")).toBeVisible();
    await expect(page.getByTestId("deployment-detail-title")).toHaveText("defi-live-capture-1");
    // Embedded → no standalone back-link; the URL carries ?detail (deep-linkable).
    await expect(page.getByTestId("deployment-detail-back")).toHaveCount(0);
    await expect(page).toHaveURL(/detail=defi-live-capture-1/);
    // Phase 2: the Redeploy affordance closes the alert→logs→redeploy walk (→ Deploy console).
    await expect(page.getByTestId("detail-redeploy")).toBeVisible();
    await page.getByTestId("cockpit-detail-close").click();
    await expect(page.getByTestId("cockpit-detail-panel")).toHaveCount(0);
  });

  test("Live tab rows carry pause/stop/restart VM controls (Phase 6)", async ({ page }) => {
    await page.goto("/cockpit?tab=live");
    await page.waitForLoadState("networkidle");
    // A running LIVE VM row exposes the operator controls (reuse /api/vm/admin/{vm}/*).
    await expect(page.getByTestId("vm-controls-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("vm-pause-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("vm-resume-defi-live-capture-1")).toBeVisible();
    // Stop is destructive → confirm dialog (with a Restart = stop+relaunch affordance).
    await page.getByTestId("vm-stop-defi-live-capture-1").click();
    await expect(page.getByTestId("vm-stop-confirm-body-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("vm-restart-defi-live-capture-1")).toBeVisible();
    await page.getByTestId("vm-stop-confirm-defi-live-capture-1").click();
    // The mock returns 202 → the action result renders (no crash).
    await expect(page.getByTestId("vm-controls-result-defi-live-capture-1")).toBeVisible();
  });

  test("Deploy tab embeds the launch/rollback console + build & deployment history (Phase 6)", async ({ page }) => {
    await page.goto("/cockpit?tab=deploy");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-deploy-console")).toBeVisible();
    await expect(page.getByTestId("deploy-no-service")).toBeVisible();
    // Pick a service → the launch / build-history / deployment-history view tabs appear.
    const picker = page.getByTestId("deploy-service-picker");
    const firstValue = await picker.locator("option").nth(1).getAttribute("value");
    await picker.selectOption(firstValue ?? "");
    await expect(page.getByTestId("deploy-view-tabs")).toBeVisible();
    await expect(page.getByTestId("deploy-view-launch")).toBeVisible();
    await expect(page.getByTestId("deploy-view-builds")).toBeVisible();
    await expect(page.getByTestId("deploy-view-history")).toBeVisible();
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

  test("Chaos tab folds without crashing on the {injections:[...]} envelope", async ({ page }) => {
    await mockBase(page);
    await page.goto("/cockpit?tab=chaos");
    await page.waitForLoadState("networkidle");
    // Regression: the backend returns `{injections:[...]}` (not a bare array). The client must
    // unwrap it — before the fix `injections.map` threw and the tab rendered empty.
    await expect(page.getByTestId("chaos-content")).toBeVisible();
    await expect(page.getByText("venue_latency").first()).toBeVisible();
  });
});

/**
 * Regression: the cockpit wires REAL per-deployment, manifest-DERIVED freshness
 * (GET /api/deployments/{id}/freshness — NOT the health-ping) into the Live tab
 * feed-health column + the Health Data-Coverage tile. A `liveness_only` deployment
 * renders honestly as such (never a false "fresh"), and a `stale` live feed shows stale.
 * (Plan: unified_deployment_health_cockpit_2026_06_23.md Phase 4.5 — "Cockpit wires REAL
 * per-shard freshness".) The dev mock-api serves /freshness keyed on the LIVE inventory:
 * defi-live-capture-1 = fresh, cefi-live-trading-1 = stale.
 */
test.describe("Cockpit — per-deployment manifest-derived freshness", () => {
  test("Live tab feed-health reads manifest freshness (fresh / stale), not just the heartbeat", async ({ page }) => {
    await page.goto("/cockpit?tab=live");
    await page.waitForLoadState("networkidle");
    // The fresh live row renders the manifest-derived "fresh" feed-health…
    await expect(page.getByTestId("feed-health-defi-live-capture-1")).toHaveText("fresh");
    // …and the stale-index live row renders honest "stale" (NOT a false fresh).
    await expect(page.getByTestId("feed-health-cefi-live-trading-1")).toHaveText("stale");
  });

  test("Health Data-Coverage tile overlays the real live-feed freshness summary", async ({ page }) => {
    await page.goto("/cockpit");
    await page.waitForLoadState("networkidle");
    // The coverage tile shows the %-captured value PLUS the per-deployment freshness summary
    // (1 fresh, 1 stale from the mock LIVE inventory) — proving it reads /freshness, not a ping.
    await expect(page.getByTestId("cockpit-tile-coverage")).toContainText("live feed:");
    await expect(page.getByTestId("cockpit-tile-coverage")).toContainText("stale");
  });
});

/**
 * Regression: the cockpit folds the existing /ops/live-deployments + /fleet/infra +
 * /fleet/git surfaces IN-PLACE (reusing LiveDeploymentsContent / FleetInfraContent /
 * FleetGitContent — no nav-away, no new fetch logic). Guards Phase 0.5 "Fold
 * /ops/live-deployments + /fleet/infra + /fleet/git into Live/Fleet/Health".
 */
test.describe("Cockpit — Live-ops + Fleet-infra + Fleet-git folds", () => {
  test("Live tab folds the live-ops running-services + event/log surface", async ({ page }) => {
    await page.goto("/cockpit?tab=live");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-live-ops")).toBeVisible();
    await expect(page.getByTestId("live-deployments-content")).toBeVisible();
  });

  test("Fleet tab folds the infra/orchestrator + git-health surfaces", async ({ page }) => {
    await page.goto("/cockpit?tab=fleet");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-fleet-infra")).toBeVisible();
    await expect(page.getByTestId("cockpit-fleet-git")).toBeVisible();
  });
});

/**
 * Regression: the Launch tab no longer logs the nested-<form> hydration warning
 * ("<form> cannot be a descendant of <form>") — the inner VmCostEstimatePanel form was
 * unwrapped to a <div> (its Calculate button drives the estimate via onClick). Guards
 * Phase 0.5 "Launch tab nested-<form> hydration warning".
 */
test.describe("Cockpit — Launch tab nested-form fix", () => {
  test("ML launch console has no nested-<form> console error + cost-estimate is still a button", async ({ page }) => {
    const formNesting: string[] = [];
    page.on("console", (msg) => {
      const t = msg.text();
      if (/<form>\s*cannot be a descendant of\s*<form>/i.test(t) || /form.*descendant.*form/i.test(t)) {
        formNesting.push(t);
      }
    });
    await mockBase(page);
    await page.goto("/cockpit?tab=launch");
    await page.waitForLoadState("networkidle");
    // ML is the default Launch sub-tab; its form contains the cost-estimate panel.
    await expect(page.getByTestId("cost-estimate-form")).toBeVisible();
    // The cost-estimate trigger is a non-submit button (no inner <form>).
    await expect(page.getByTestId("calculate-cost-btn")).toHaveAttribute("type", "button");
    expect(formNesting, `nested-<form> warnings: ${formNesting.join(" | ")}`).toHaveLength(0);
  });
});

/**
 * Regression: operator additions O1–O4 (unified_deployment_health_cockpit_2026_06_23.md
 * "Operator additions 2026-06-24").
 *  - O1: the Consolidators drill-down renders the REAL per-AG index age (not "—").
 *  - O2: the Health Data-Coverage tile routes to the data-status surface (not /deployments).
 *  - O3: the Live/Batch/Paper inventory shows status-filter chips (All/Running/Succeeded/
 *        Failed/Stuck) with per-status counts that drive the status filter.
 *  - O4: a deployment drill-down surfaces the alerts + restart/escalation lifecycle card.
 * Uses the dev mock-api (VITE_MOCK_API=true) for /api/health/consolidator, /api/deployments/*,
 * /api/alerts, /api/vm/{name}/events — so the wiring is exercised end-to-end, not mocked-away.
 */
test.describe("Cockpit — operator additions O1–O4", () => {
  test("O1: Consolidators drill-down renders the real per-AG index age (not —)", async ({ page }) => {
    await page.goto("/cockpit?tab=consolidators");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-consolidators")).toBeVisible();
    await expect(page.getByTestId("cockpit-consolidators-error")).toHaveCount(0);
    // The defi card (mock: 25s old) renders a concrete index age, NOT the placeholder dash.
    const defiCard = page.getByTestId("cockpit-consolidator-defi");
    await expect(defiCard).toContainText("index age:");
    await expect(defiCard).toContainText("25s");
    // The cefi card (mock: 2457s, fallback active) shows the budget + the ACTIVE fallback flag.
    const cefiCard = page.getByTestId("cockpit-consolidator-cefi");
    await expect(cefiCard).toContainText("budget");
    await expect(cefiCard).toContainText("ACTIVE");
    await expect(page.getByTestId("cockpit-consolidator-status-cefi")).toHaveText("CRITICAL");
  });

  test("O2: Data-Coverage tile links to the data-status surface, not /deployments", async ({ page }) => {
    await page.goto("/cockpit");
    await page.waitForLoadState("networkidle");
    const tile = page.getByTestId("cockpit-tile-coverage");
    await expect(tile).toBeVisible();
    // The coverage tile now deep-links to the per-service data-status tab (market-tick-data-service)
    // — NOT the generic /deployments inventory (which has no %-captured-per-asset_group view).
    const href = await tile.getAttribute("href");
    expect(href).toContain("/service/market-tick-data-service/data-status");
    expect(href).not.toBe("/deployments");
  });

  test("O3: Batch inventory shows status-filter chips with counts that drive the filter", async ({ page }) => {
    await page.goto("/cockpit?tab=batch");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cockpit-batch")).toBeVisible();
    const chips = page.getByTestId("status-filter-chips");
    await expect(chips).toBeVisible();
    // All / Running / Succeeded / Failed / Stuck chips with per-status counts (from the summary).
    await expect(page.getByTestId("status-chip-all")).toBeVisible();
    await expect(page.getByTestId("status-chip-failed")).toBeVisible();
    // BATCH mock: 1 failed (sports-backfill exit 137), ≥1 succeeded.
    await expect(page.getByTestId("status-chip-count-failed")).toHaveText("1");
    await expect(page.getByTestId("status-chip-count-succeeded")).not.toHaveText("0");
    // Clicking "Failed" isolates the failed row + drops the succeeded one.
    await page.getByTestId("status-chip-failed").click();
    await expect(page.getByTestId("status-chip-failed")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("deployment-row-sports-backfill-20260621")).toBeVisible();
    await expect(page.getByTestId("deployment-row-cefi-backfill-20260620")).toHaveCount(0);
  });

  test("O4: deployment drill-down surfaces the alerts + restart/escalation lifecycle card", async ({ page }) => {
    await page.goto("/cockpit?tab=live");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("deployment-link-defi-live-capture-1").click();
    await expect(page.getByTestId("cockpit-detail-panel")).toBeVisible();
    // The lifecycle card composes /api/alerts + the deployment event stream (no new endpoint).
    const card = page.getByTestId("detail-alerts-lifecycle");
    await expect(card).toBeVisible();
    // No mock alert names this deployment → honest empty state (never a fabricated all-clear).
    await expect(page.getByTestId("detail-alerts-empty")).toBeVisible();
    // The mock event stream has no restart/escalation events → honest empty state.
    await expect(page.getByTestId("detail-lifecycle-empty")).toBeVisible();
  });
});
