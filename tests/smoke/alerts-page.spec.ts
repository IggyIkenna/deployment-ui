/**
 * Smoke + regression: Alerts page — unified alert lifecycle traceability.
 *
 * The /alerts page now consumes GET /api/alerts (unified ledger, all alert classes)
 * rather than the CI-only /api/repo-ci/alerts. INFRA P1 (alert_quality_overhaul_2026_06_18.md)
 * will add non-CI alert kinds; this spec covers the CI subset (current mock data) + the
 * domain chip and unified-endpoint wiring.
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md (unified ledger UI P1).
 */

import { expect, test } from "@playwright/test";

test.describe("Alerts page", () => {
  test("cockpit Alerts tile routes to the Alerts tab", async ({ page }) => {
    // The tile links /alerts, which redirects into the cockpit Alerts tab (the LandingTabs
    // bar it used to open was deleted 2026-07-17 as a duplicate of the top bar).
    await page.goto("/cockpit");
    await page.getByTestId("cockpit-tile-alerts").click();
    await expect(page).toHaveURL(/\/alerts$/);
    await expect(page.getByTestId("cockpit-alerts")).toBeVisible();
    await expect(page.getByTestId("alerts-page")).toBeVisible();
    await expect(page.getByTestId("alert-streams")).toBeVisible();
    await expect(page.getByTestId("alert-timeline")).toBeVisible();
  });

  test("alerts is a tab in the unified pane, reachable from the top bar", async ({ page }) => {
    await page.goto("/cockpit");
    await page.getByTestId("cockpit-tab-alerts").click();
    await expect(page).toHaveURL(/\/alerts$/);
    await expect(page.getByTestId("alerts-page")).toBeVisible();
    // A sibling tab is one click away — proves the single pane, not a route swap.
    await expect(page.getByTestId("cockpit-tab-health")).toBeVisible();
  });

  test("lifecycle stream shows previous -> current state pair (traceability)", async ({ page }) => {
    await page.goto("/alerts");
    const stream = page.getByTestId("alert-stream-unified-trading-pm-ci-status-update");
    await expect(stream).toBeVisible();
    // The FAILED page is the PREVIOUS state, the recovery is the CURRENT state.
    await expect(stream.getByTestId("stream-previous")).toContainText("CRITICAL");
    await expect(stream.getByTestId("stream-current")).toContainText("INFO");
  });

  test("worst current state sorts first; timeline is newest-first with run links", async ({ page }) => {
    await page.goto("/alerts");
    const firstStream = page.getByTestId("alert-streams").locator('[data-testid^="alert-stream-"]').first();
    await expect(firstStream.getByTestId("stream-current")).toContainText("CRITICAL");
    const firstEntry = page.getByTestId("alert-entry-0");
    await expect(firstEntry).toContainText("quality-gates-v2 FAILED on main");
    await expect(firstEntry.locator("a")).toHaveAttribute("href", /actions\/runs/);
  });

  test("timeline entries show the full date (not just HH:MM) and the workflow name", async ({ page }) => {
    // Cheap wins (deployment_ui_alerts_page_rebuild_2026_07_20.md todo 1) — both fields already
    // exist in the RepoCiAlertEntry payload; the timeline previously dropped workflow_name and
    // truncated the timestamp to HH:MM, hiding the date. entry-0 (newest-first) is the
    // 2026-06-10T13:05:00Z quality-gates-v2 alert on execution-service.
    await page.goto("/alerts");
    const firstEntry = page.getByTestId("alert-entry-0");
    await expect(firstEntry.getByTestId("alert-entry-timestamp-0")).toHaveText("2026-06-10 13:05");
    await expect(firstEntry.getByTestId("alert-entry-workflow-0")).toHaveText("quality-gates-v2");
  });

  test("timeline columns are sortable, click-to-cycle asc/desc/default, URL-backed", async ({ page }) => {
    // Sortable columns (deployment_ui_alerts_page_rebuild_2026_07_20.md todo 2) — Subject sorts
    // alphabetically by repo, reordering the newest-first default (deployment-service <
    // execution-service < unified-trading-pm, so deployment-service's vm-watchdog alert moves to
    // entry-0 even though it's the OLDEST of the 5 mock rows).
    await page.goto("/alerts");
    const subjectHeader = page.getByTestId("alert-col-subject");

    await subjectHeader.click();
    await expect(page).toHaveURL(/sort_key=subject&sort_dir=asc/);
    await expect(subjectHeader).toHaveAttribute("aria-sort", "ascending");
    await expect(page.getByTestId("alert-entry-0")).toContainText("VM DOWN: cefi-binance-futures-backfill");

    // Second click on the same header reverses direction (desc — unified-trading-pm sorts last-first).
    await subjectHeader.click();
    await expect(page).toHaveURL(/sort_key=subject&sort_dir=desc/);
    await expect(subjectHeader).toHaveAttribute("aria-sort", "descending");
    await expect(page.getByTestId("alert-entry-0")).toContainText("SIT PASSED");

    // Third click returns to the table's own default ordering (newest-first) and clears the URL params.
    await subjectHeader.click();
    await expect(page).not.toHaveURL(/sort_key=/);
    await expect(subjectHeader).not.toHaveAttribute("aria-sort", /.+/);
    await expect(page.getByTestId("alert-entry-0")).toContainText("quality-gates-v2 FAILED on main");
  });

  test("unified endpoint: domain chip appears on every stream and timeline entry", async ({ page }) => {
    await page.goto("/alerts");
    // Every stream row must have a domain chip.
    const streamChips = page.getByTestId("alert-streams").locator('[data-testid="alert-domain-chip"]');
    await expect(streamChips.first()).toBeVisible();
    // CI alerts are labelled "CI" by the kindLabel() helper.
    await expect(streamChips.first()).toContainText("CI");
    // Timeline entries also carry domain chips.
    const timelineChip = page.getByTestId("alert-entry-0").getByTestId("alert-domain-chip");
    await expect(timelineChip).toBeVisible();
    await expect(timelineChip).toContainText("CI");
  });

  test("unified endpoint: source badge shown after load", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByTestId("alerts-source-badge")).toBeVisible();
    // Mock mode returns source="mock" which maps to the green badge.
    await expect(page.getByTestId("alerts-source-badge")).toContainText("MOCK");
  });

  test("page heading reflects unified traceability (not CI-only)", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByTestId("alerts-page").locator("h1")).toContainText("unified traceability");
  });

  test("infra alert deep-links to its /deployments target detail (parity #4)", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByTestId("alerts-page")).toBeVisible();
    // The vm_down infra alert carries a deployment target → an INTERNAL /deployments/{name} link (not
    // the external run_url). Located by href so it's independent of timeline ordering.
    const link = page.locator('a[href="/deployments/cefi-binance-futures-backfill"]');
    await expect(link).toBeVisible();
    await expect(link).toContainText("deployment");
    await link.click();
    await expect(page).toHaveURL(/\/deployments\/cefi-binance-futures-backfill$/);
  });

  test("Layout: Timeline is the primary full-width surface, Streams renders as a compact summary strip", async ({
    page,
  }) => {
    // deployment_ui_alerts_page_rebuild_2026_07_20.md "Layout / 'proper view'" todo, operator
    // decision A (2026-07-21, BLK-de39d214): Streams stays visible as a compact single-line-per-
    // stream SUMMARY above the Timeline, which remains the dominant/primary drill-down surface.
    // The markup itself stayed flex-divs (rejected converting to a real <table> — behavior over
    // markup, zero testid churn), so this only asserts the visual-hierarchy contract.
    await page.goto("/alerts");
    await expect(page.getByTestId("alerts-page")).toBeVisible();

    // Streams: a compact summary label (not a full CardTitle heading) + its entries still resolve.
    await expect(page.getByTestId("alert-streams-label")).toBeVisible();
    await expect(page.getByTestId("alert-streams-label")).toContainText("summary");
    await expect(page.getByTestId("alert-streams")).toBeVisible();
    await expect(page.getByTestId("alert-streams").locator('[data-testid^="alert-stream-"]').first()).toBeVisible();

    // Timeline: kept its full Card/CardTitle treatment (unchanged) — the dominant, primary surface.
    await expect(page.getByTestId("alert-timeline")).toBeVisible();
    await expect(page.getByTestId("alert-timeline").getByText("Alert timeline (newest first)")).toBeVisible();

    // Streams (the summary) renders BEFORE Timeline (the primary surface) in DOM order.
    const streamsFirst = await page.evaluate(() => {
      const streams = document.querySelector('[data-testid="alert-streams"]');
      const timeline = document.querySelector('[data-testid="alert-timeline"]');
      if (!streams || !timeline) return false;
      return !!(streams.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(streamsFirst).toBe(true);

    // Every pre-existing testid the regression contract depends on still resolves.
    await expect(page.getByTestId("alert-entry-0")).toBeVisible();
    await expect(page.getByTestId("alert-col-timestamp")).toBeVisible();
  });

  test("infra alert's 'Stream logs' deep-link sets ?logs= and swaps in the live-logs panel (drill-down links)", async ({
    page,
  }) => {
    // deployment_ui_alerts_page_rebuild_2026_07_20.md "Drill-down links" todo — a row's
    // deployment_target also drives the cockpit's shared `?logs=` log-stream sub-param
    // (AlertsLogsTab.tsx's own contract), not just the /deployments/:name link.
    await page.goto("/alerts");
    await expect(page.getByTestId("cockpit-logs-empty")).toBeVisible();

    const logsLink = page.locator('[data-testid^="alert-logs-link-"]').first();
    await expect(logsLink).toBeVisible();
    await logsLink.click();

    await expect(page).toHaveURL(/logs=cefi-binance-futures-backfill/);
    await expect(page.getByTestId("cockpit-logs-empty")).toHaveCount(0);
  });

  // Filter bar (deployment_ui_alerts_page_rebuild_2026_07_20.md "Filter bar" todo). Mock data
  // (mock-api.ts mockRepoCiAlerts): 4 "alert"-kind CI entries (repos unified-trading-pm x3,
  // execution-service x1) + 1 "vm_down" infra entry (deployment-service) — 5 total, all
  // severity="CRITICAL" or "INFO" (no WARNING row in this fixture).
  test("filter bar renders one chip per distinct kind/severity and one option per distinct repo/service", async ({
    page,
  }) => {
    await page.goto("/alerts");
    await expect(page.getByTestId("alerts-filter-bar")).toBeVisible();
    await expect(page.getByTestId("filter-result-count")).toHaveText("5 of 5 alerts");

    // kind: "alert" -> "CI" label, "vm_down" -> "VM" label.
    await expect(page.getByTestId("filter-kind-alert")).toHaveText("CI");
    await expect(page.getByTestId("filter-kind-vm_down")).toHaveText("VM");

    // severity bucket: CRITICAL and INFO are the only buckets present in the fixture.
    await expect(page.getByTestId("filter-severity-CRITICAL")).toBeVisible();
    await expect(page.getByTestId("filter-severity-INFO")).toBeVisible();

    // repo/service <select>s carry an "All ..." option plus one per distinct value.
    const repoSelect = page.getByTestId("filter-repo");
    await expect(repoSelect.locator("option")).toHaveCount(4); // All + 3 distinct repos
    const serviceSelect = page.getByTestId("filter-service");
    await expect(serviceSelect.locator("option")).toHaveCount(5); // All + 4 distinct workflow_names

    // No filter active yet -> no clear-filters button.
    await expect(page.getByTestId("filter-clear")).toHaveCount(0);
  });

  test("kind chip toggle filters the timeline and is URL-backed", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByTestId("filter-kind-vm_down").click();
    await expect(page).toHaveURL(/kind=vm_down/);
    await expect(page.getByTestId("filter-kind-vm_down")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("filter-result-count")).toHaveText("1 of 5 alerts");
    await expect(page.getByTestId("alert-entry-0")).toContainText("VM DOWN: cefi-binance-futures-backfill");
    await expect(page.getByTestId("alert-entry-1")).toHaveCount(0);

    // Toggling off clears the URL param entirely (empty Set -> no filter, same as Deployments.tsx).
    await page.getByTestId("filter-kind-vm_down").click();
    await expect(page).not.toHaveURL(/kind=/);
    await expect(page.getByTestId("filter-result-count")).toHaveText("5 of 5 alerts");
  });

  test("severity chip toggle is additive (multi-select) and combines with repo/service dropdowns", async ({ page }) => {
    await page.goto("/alerts");
    // Both severity buckets active -> every row still passes (no-op filter, but proves multi-select).
    await page.getByTestId("filter-severity-CRITICAL").click();
    await page.getByTestId("filter-severity-INFO").click();
    await expect(page).toHaveURL(/severity=CRITICAL%2CINFO|severity=INFO%2CCRITICAL/);
    await expect(page.getByTestId("filter-result-count")).toHaveText("5 of 5 alerts");

    // Narrow further with the repo dropdown — combines with the (permissive) severity filter via AND.
    await page.getByTestId("filter-repo").selectOption("execution-service");
    await expect(page).toHaveURL(/repo=execution-service/);
    await expect(page.getByTestId("filter-result-count")).toHaveText("1 of 5 alerts");
    await expect(page.getByTestId("alert-entry-0")).toContainText("quality-gates-v2 FAILED on main");
  });

  test("service dropdown filters by workflow_name", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByTestId("filter-service").selectOption("vm-watchdog");
    await expect(page).toHaveURL(/service=vm-watchdog/);
    await expect(page.getByTestId("filter-result-count")).toHaveText("1 of 5 alerts");
    await expect(page.getByTestId("alert-entry-0")).toContainText("VM DOWN: cefi-binance-futures-backfill");
  });

  test("clear-filters button appears once a filter is active and resets to the unfiltered view", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByTestId("filter-clear")).toHaveCount(0);

    await page.getByTestId("filter-kind-vm_down").click();
    await expect(page.getByTestId("filter-clear")).toBeVisible();

    await page.getByTestId("filter-clear").click();
    await expect(page.getByTestId("filter-clear")).toHaveCount(0);
    await expect(page).not.toHaveURL(/kind=|severity=|repo=|service=/);
    await expect(page.getByTestId("filter-result-count")).toHaveText("5 of 5 alerts");
  });

  test("a filter combination matching zero rows shows the filtered-empty state, not the ledger-empty state", async ({
    page,
  }) => {
    await page.goto("/alerts");
    // vm_down kind + execution-service repo never co-occur in the fixture -> zero matches.
    await page.getByTestId("filter-kind-vm_down").click();
    await page.getByTestId("filter-repo").selectOption("execution-service");
    await expect(page.getByTestId("filter-result-count")).toHaveText("0 of 5 alerts");
    await expect(page.getByTestId("alerts-filter-empty")).toBeVisible();
    await expect(page.getByTestId("alerts-filter-empty")).toContainText("No alerts match the active filters");
    // The streams card (unaffected by the timeline filter) still renders — filters scope the
    // timeline only, per the "Options derived from the loaded normalised alert set" todo text.
    await expect(page.getByTestId("alert-streams")).toBeVisible();
  });

  // Date-range picker (deployment_ui_alerts_page_rebuild_2026_07_20.md "Date-range picker" todo).
  // All 5 fixture alerts sit on 2026-06-10 — inclusive [alert_from, alert_to] bounds against that
  // fixed date exercise narrowing without depending on the real wall-clock "today".
  test("date-range picker narrows the timeline by inclusive [from, to] bounds, URL-backed", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByTestId("filter-alert-date-to").fill("2026-06-09");
    await expect(page).toHaveURL(/alert_to=2026-06-09/);
    await expect(page.getByTestId("filter-result-count")).toHaveText("0 of 5 alerts");
    await expect(page.getByTestId("alerts-filter-empty")).toBeVisible();
    // Setting only `alert_to` (no `alert_from`) never engages the retention-floor check.
    await expect(page.getByTestId("alerts-retention-floor-banner")).toHaveCount(0);

    await page.getByTestId("filter-alert-date-to").fill("2026-06-10");
    await expect(page.getByTestId("filter-result-count")).toHaveText("5 of 5 alerts");
  });

  test("'no data before X' retention-floor banner fires only when alert_from predates the ledger's window", async ({
    page,
  }) => {
    await page.goto("/alerts");
    // Well before any real-world 30-day floor -> banner must fire regardless of when this runs.
    await page.getByTestId("filter-alert-date-from").fill("2020-01-01");
    await expect(page.getByTestId("alerts-retention-floor-banner")).toBeVisible();
    await expect(page.getByTestId("alerts-retention-floor-banner")).toContainText("No alerts before");
    await expect(page.getByTestId("alerts-retention-floor-banner")).toContainText("the ledger retains 30 days");

    // The date-range widget's own clear button (X) removes the banner along with both bounds.
    await page.getByTestId("filter-alert-date-clear").click();
    await expect(page.getByTestId("alerts-retention-floor-banner")).toHaveCount(0);
    await expect(page).not.toHaveURL(/alert_from=|alert_to=/);
    await expect(page.getByTestId("filter-alert-date-from")).toHaveValue("");
    await expect(page.getByTestId("filter-alert-date-to")).toHaveValue("");
  });

  test("the date-range widget's own clear (X) resets both bounds atomically without touching other active filters", async ({
    page,
  }) => {
    await page.goto("/alerts");
    await page.getByTestId("filter-kind-vm_down").click();
    await page.getByTestId("filter-alert-date-from").fill("2026-06-01");
    await page.getByTestId("filter-alert-date-to").fill("2026-06-15");
    await expect(page.getByTestId("filter-alert-date-clear")).toBeVisible();

    await page.getByTestId("filter-alert-date-clear").click();
    await expect(page).not.toHaveURL(/alert_from=|alert_to=/);
    await expect(page).toHaveURL(/kind=vm_down/);
    await expect(page.getByTestId("filter-alert-date-from")).toHaveValue("");
    await expect(page.getByTestId("filter-alert-date-to")).toHaveValue("");
  });

  test("the page-level clear-filters button also clears the date range, not just kind/severity/repo/service", async ({
    page,
  }) => {
    await page.goto("/alerts");
    await page.getByTestId("filter-alert-date-from").fill("2026-06-01");
    await expect(page.getByTestId("filter-clear")).toBeVisible();

    await page.getByTestId("filter-clear").click();
    await expect(page.getByTestId("filter-clear")).toHaveCount(0);
    await expect(page).not.toHaveURL(/alert_from=|alert_to=/);
    await expect(page.getByTestId("filter-alert-date-from")).toHaveValue("");
    await expect(page.getByTestId("filter-result-count")).toHaveText("5 of 5 alerts");
  });

  // Regression + new specs (deployment_ui_alerts_page_rebuild_2026_07_20.md [REVIEW] todo) — every
  // dimension above (filter/date-range/deep-link/sort/layout) has its own isolated coverage; this
  // is the one deliberately COMBINED case, proving the independent `useMemo` layers (filter -> sort)
  // compose correctly rather than one clobbering another.
  test("kind filter, date range, and column sort compose correctly when all three are active at once", async ({
    page,
  }) => {
    await page.goto("/alerts");
    // Exclude the vm_down infra row -> 4 CI ("alert"-kind) rows remain.
    await page.getByTestId("filter-kind-alert").click();
    // All 4 remaining rows are dated 2026-06-10, so this bound keeps every one of them.
    await page.getByTestId("filter-alert-date-to").fill("2026-06-10");
    await expect(page.getByTestId("filter-result-count")).toHaveText("4 of 5 alerts");

    // Sort ascending by Subject (repo) — execution-service sorts before unified-trading-pm.
    await page.getByTestId("alert-col-subject").click();
    await expect(page).toHaveURL(/sort_key=subject&sort_dir=asc/);
    await expect(page.getByTestId("alert-entry-0")).toContainText("quality-gates-v2 FAILED on main");

    // All three params coexist in the URL and the vm_down row never reappears in the filtered +
    // sorted timeline, in any order. Scoped to `alert-timeline` (not `page`-wide): the separate
    // Streams summary strip above (`alert-streams`) is a DELIBERATELY unfiltered "current worst
    // state per (repo, workflow)" overview (operator decision A, 2026-07-21 — see Alerts.tsx's
    // own comment above that section), so it always shows the vm-watchdog stream's current
    // vm_down message regardless of the Timeline's active filters. An unscoped `page.getByText`
    // here matches that unrelated, by-design row and false-positives on a "clobbering" bug that
    // doesn't exist — verified by reproducing this exact sequence with `alert-timeline`-scoped and
    // `alert-streams`-scoped locators independently: the Timeline-scoped count is 0 immediately
    // after the kind+date filter (before any sort), and stays 0 after the sort click; only the
    // Streams-scoped count is 1, throughout. The filter -> sort `useMemo` composition itself never
    // clobbers — this locator fix is what makes the test assert what its own docstring says it
    // proves.
    await expect(page).toHaveURL(/kind=alert/);
    await expect(page).toHaveURL(/alert_to=2026-06-10/);
    await expect(page.getByTestId("alert-timeline").getByText("VM DOWN: cefi-binance-futures-backfill")).toHaveCount(0);
  });
});
