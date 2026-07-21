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
});
