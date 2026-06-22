/**
 * Smoke: Repos CI page renders against the mock API.
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md Phase 3 (pw:L2 gate).
 */

import { expect, test } from "@playwright/test";

test.describe("Repos CI page", () => {
  test("nav entry routes to /repos and the page renders all panels", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-repos-ci").click();
    await expect(page).toHaveURL(/\/repos$/);
    await expect(page.getByTestId("repo-ci-page")).toBeVisible();
    await expect(page.getByTestId("promotion-drain-panel")).toBeVisible();
    await expect(page.getByTestId("sit-run-panel")).toBeVisible();
    await expect(page.getByTestId("stuck-panel")).toBeVisible();
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
  });

  test("Promotion-drain panel renders the routine drain + the cascade panel is relabelled", async ({ page }) => {
    await page.goto("/repos");
    const drain = page.getByTestId("promotion-drain-panel");
    await expect(drain).toBeVisible();
    await expect(drain).toContainText("Promotion drain");
    // Both legs render their last-run result (mock seeds both green).
    await expect(page.getByTestId("drain-ldr-to-staging")).toContainText("success");
    await expect(page.getByTestId("drain-ldr-to-main")).toBeVisible();
    // The cascade/SIT panel is relabelled so the routine drain is never conflated with the
    // breaking-change cascade.
    await expect(page.getByTestId("sit-run-panel")).toContainText("Breaking cascade / SIT");
  });

  test("Semver-agent health panel renders last bump + breaker-armed state (G2)", async ({ page }) => {
    await page.goto("/repos");
    const panel = page.getByTestId("semver-health-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Semver-agent health");
    // Mock seeds a successful last bump run.
    await expect(page.getByTestId("semver-last-run")).toContainText("success");
    // Mock seeds 3 pending bumps == threshold → breaker reads ARMED.
    await expect(page.getByTestId("semver-breaker")).toContainText("ARMED");
    await expect(page.getByTestId("semver-breaker")).toContainText("3/3");
    // The pending repos are listed so the operator sees WHICH repos are stacked.
    await expect(page.getByTestId("semver-pending-repos")).toContainText("execution-service");
  });

  test("drain-stalled repo is flagged on the row + counted in the promotion-drain panel", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    // execution-service (FAILING fixture) seeds the drain-stalled case: content ahead + stale drain.
    await expect(page.getByTestId("drain-stalled-execution-service")).toContainText("drain stalled");
    // A healthy repo carries no stalled chip.
    await expect(page.getByTestId("drain-stalled-unified-trading-library")).toHaveCount(0);
    // The promotion-drain panel summarises the count + names the stalled repos.
    await expect(page.getByTestId("drain-stalled-summary")).toContainText("drain-stalled");
    await expect(page.getByTestId("drain-stalled-summary")).toContainText("execution-service");
  });

  test("a stuck PR shows the BLOCKING required check + reason on the triage row", async ({ page }) => {
    // Regression for the 2026-06-15 escalation: a drain PR blocked on a failing AWS CodeBuild
    // required check read as a clean "draining" row — the operator had to dig to find why. The
    // stuck-panel now surfaces the blocking check name + GitHub's reason string inline.
    await page.goto("/repos");
    const blockers = page.getByTestId("stuck-pr-blockers-execution-service-89");
    await expect(blockers).toBeVisible();
    await expect(blockers).toContainText("AWS CodeBuild");
    await expect(blockers).toContainText("Pull request approval required for starting a build");
  });

  test("overview table populates rows with SHA columns", async ({ page }) => {
    await page.goto("/repos");
    const table = page.getByTestId("repo-ci-table");
    await expect(table).toBeVisible();
    await expect(page.getByTestId("repo-row-unified-trading-library")).toBeVisible();
    // Branch short-SHAs render (mock fixtures use abc12* heads).
    await expect(page.getByTestId("repo-row-unified-trading-library")).toContainText("abc1234");
  });

  test("overview shows the last-green-main column (green as of <sha>), distinct from a red head", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "last green (main)" })).toBeVisible();
    // A green repo's last-green = its main head (abc1100). A FAILING repo's last-green is an
    // EARLIER green sha (ab09999) — the whole point of N2: it differs from the red main head.
    await expect(page.getByTestId("last-green-unified-trading-library")).toContainText("abc1100");
    await expect(page.getByTestId("last-green-execution-service")).toContainText("ab09999");
  });

  test("overview shows the promotion-lag age chip (G6) on a behind-main repo", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    // execution-service is LDR-ahead-of-main with a 185-min lag → a red "lag" chip renders.
    await expect(page.getByTestId("lag-execution-service")).toContainText("lag");
  });

  test("per-branch SHA cells are colour-coded (replaces the standalone CI-status column)", async ({ page }) => {
    // Regression for the 2026-06-19 operator review: the standalone `CI status` lifecycle column
    // conflated promotion-progress with branch-failure; it is replaced by a green/red colour on each
    // LDR/staging/main SHA cell (per-branch last-v2 conclusion), exposed via data-tone.
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    // The standalone CI-status column is gone.
    await expect(page.getByRole("columnheader", { name: "CI status" })).toHaveCount(0);
    // execution-service is FAILING with main red → the main SHA cell is red.
    await expect(page.getByTestId("branch-main-execution-service")).toHaveAttribute("data-tone", "red");
    // strategy-service is STAGING_GREEN with LDR red → the LDR SHA cell is red.
    await expect(page.getByTestId("branch-ldr-strategy-service")).toHaveAttribute("data-tone", "red");
    // a clean (MAIN_GREEN) repo's branches are all green.
    await expect(page.getByTestId("branch-ldr-unified-trading-library")).toHaveAttribute("data-tone", "green");
    await expect(page.getByTestId("branch-main-unified-trading-library")).toHaveAttribute("data-tone", "green");
  });

  test("branch-colour legend opens on click and explains green/red/gray", async ({ page }) => {
    // Regression for the 2026-06-19 operator request: a click-to-open legend documents what the
    // per-branch SHA colours mean (replacing the self-describing CI-status text column).
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    // Collapsed by default (conditionally rendered → absent from the DOM).
    await expect(page.getByTestId("branch-legend")).toHaveCount(0);
    // Click the help toggle → legend opens and explains each colour.
    await page.getByTestId("branch-legend-toggle").click();
    const legend = page.getByTestId("branch-legend");
    await expect(legend).toBeVisible();
    await expect(legend).toContainText("last v2 run passed");
    await expect(legend).toContainText("last v2 run failed");
    await expect(legend).toContainText("branch absent or status unknown");
    // Clicking outside (the transparent overlay) closes it.
    await page.mouse.click(5, 5);
    await expect(page.getByTestId("branch-legend")).toHaveCount(0);
  });

  test("repo dropdown drill-down renders SHA history and PR cards", async ({ page }) => {
    await page.goto("/repos");
    await page.getByTestId("repo-dropdown").selectOption("execution-service");
    const detail = page.getByTestId("repo-detail");
    await expect(detail).toBeVisible();
    // Three promotion branches of SHA history — scoped to the history section so the
    // promotion-pipeline strip's "main" stage label doesn't create an ambiguous match.
    const history = page.getByTestId("repo-detail-history");
    await expect(history.getByText("live-defi-rollout", { exact: true })).toBeVisible();
    await expect(history.getByText("staging", { exact: true })).toBeVisible();
    await expect(history.getByText("main", { exact: true })).toBeVisible();
    // PR cards with stuck classification render.
    await expect(page.getByTestId("repo-detail-prs")).toBeVisible();
    // Each PR card carries an EXPLICIT quality-gates-v2 state chip (promotion-drain follow-up
    // remainder) — execution-service's main PR is skip_ci_jammed (v2 not reported), staging PR
    // failing_check (v2 failed).
    await expect(page.getByTestId("repo-detail-prs")).toContainText("v2");
    await expect(page.getByTestId("pr-v2-89")).toContainText("v2 failed"); // PR #89 = failing_check fixture
  });

  test("repo drill-down renders the promotion pipeline strip (LDR → staging → SIT → main → image)", async ({
    page,
  }) => {
    await page.goto("/repos");
    await page.getByTestId("repo-dropdown").selectOption("execution-service");
    const pipeline = page.getByTestId("promotion-pipeline");
    await expect(pipeline).toBeVisible();
    // All five promotion stages render in order.
    await expect(page.getByTestId("pipeline-stage-ldr")).toBeVisible();
    await expect(page.getByTestId("pipeline-stage-staging")).toBeVisible();
    await expect(page.getByTestId("pipeline-stage-sit")).toBeVisible();
    await expect(page.getByTestId("pipeline-stage-main")).toBeVisible();
    await expect(page.getByTestId("pipeline-stage-image")).toBeVisible();
    await expect(pipeline).toContainText("LDR");
    await expect(pipeline).toContainText("image");
  });

  test("repo drill-down renders per-branch last-green (LDR / staging / main) — N2-followup", async ({ page }) => {
    await page.goto("/repos");
    await page.getByTestId("repo-dropdown").selectOption("execution-service");
    const strip = page.getByTestId("repo-detail-last-green");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("Last green (v2)");
    // All three promotion branches surface their own last-green axis.
    await expect(page.getByTestId("last-green-branch-live-defi-rollout")).toBeVisible();
    await expect(page.getByTestId("last-green-branch-staging")).toContainText("ab09111");
    await expect(page.getByTestId("last-green-branch-main")).toBeVisible();
  });

  test("repo drill-down surfaces the staging-lock REASON + last-SIT-run age (SitLockDetail)", async ({ page }) => {
    await page.goto("/repos");
    // greeks-service is the stuck/breaking-pending fixture: staging locked + a SIT run age.
    await page.getByTestId("repo-dropdown").selectOption("greeks-service");
    const detail = page.getByTestId("repo-detail-sit-lock");
    await expect(detail).toBeVisible();
    // The WHY (not just "locked") — the reason the pipeline strip can't show.
    await expect(detail).toContainText("breaking cascade in flight");
    // The per-repo last-SIT-run age (distinct from the global SIT-run panel).
    await expect(page.getByTestId("sit-run-age")).toContainText("last SIT run");
  });

  test("clicking a table row selects the repo for drill-down", async ({ page }) => {
    await page.goto("/repos");
    // Click the repo-NAME cell (not a SHA/CI link — those deep-link to GitHub and
    // stopPropagation, so a row-center click lands on a link, not the row select).
    await page.getByTestId("repo-row-greeks-service").getByText("greeks-service", { exact: true }).click();
    await expect(page.getByTestId("repo-detail")).toBeVisible();
    await expect(page.getByTestId("repo-detail")).toContainText("greeks-service");
  });

  test("Repos CI is a landing tab in the home shell, not a separate page", async ({ page }) => {
    // Regression: operator add 2026-06-10 — /repos must render as a sibling tab of
    // Overview/Epics inside the deployment-ui home shell, not a standalone full-page app.
    await page.goto("/");
    // Sibling landing tabs prove this is the unified home shell, not a separate UI.
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Epics" })).toBeVisible();
    await page.getByTestId("landing-repos-ci-tab-trigger").click();
    await expect(page).toHaveURL(/\/repos$/);
    const tab = page.getByTestId("landing-repos-ci-tab");
    await expect(tab).toBeVisible();
    await expect(tab.getByTestId("repo-ci-page")).toBeVisible();
    await expect(tab.getByTestId("repo-ci-table")).toBeVisible();
    // Overview tab is still a reachable sibling — confirms tab integration, not a route swap.
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
  });

  test("deep-link to /repos opens the Repos CI landing tab in the home shell", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("landing-repos-ci-tab")).toBeVisible();
    await expect(page.getByTestId("repo-ci-page")).toBeVisible();
    // The home shell's sibling tabs are present (proves shell, not standalone page).
    await expect(page.getByRole("tab", { name: "Epics" })).toBeVisible();
  });

  test("per-service CI tab renders the same drill-down in service context", async ({ page }) => {
    await page.goto("/");
    // Select a service from the home-view sidebar, then open its CI tab. The sidebar
    // item carries a stable testid (the overview table is not auto-fetched), so this
    // is robust under the mock API.
    await page.getByTestId("service-item-market-tick-data-service").click();
    await page.getByTestId("service-ci-tab-trigger").click();
    const tab = page.getByTestId("service-ci-tab");
    await expect(tab).toBeVisible();
    await expect(tab.getByTestId("repo-detail")).toBeVisible();
    await expect(tab.getByTestId("repo-detail")).toContainText("market-tick-data-service");
  });

  // Operator click-through rule (2026-06-10): SHA/CI atoms deep-link to GitHub.
  test("branch SHAs link to their GitHub commit pages", async ({ page }) => {
    await page.goto("/repos");
    const row = page.getByTestId("repo-row-unified-trading-library");
    const shaLink = row.getByRole("link", { name: "abc1234" });
    await expect(shaLink).toHaveAttribute("href", /github\.com\/IggyIkenna\/unified-trading-library\/commit\/abc1234/);
  });

  // Operator errors[] visibility (2026-06-10): degraded repos are shown, not silent.
  test("degraded-repos strip surfaces a per-repo GitHub-5xx degradation", async ({ page }) => {
    await page.goto("/repos");
    const degraded = page.getByTestId("repo-ci-degraded");
    await expect(degraded).toBeVisible();
    await expect(degraded).toContainText("ml-service");
  });

  // Operator cross-link rule (2026-06-10): repo drill-down deep-links the existing surfaces.
  test("repo drill-down cross-links to GitHub / data-status / fleet", async ({ page }) => {
    await page.goto("/repos");
    await page.getByTestId("repo-dropdown").selectOption("execution-service");
    const links = page.getByTestId("repo-detail-crosslinks");
    await expect(links).toBeVisible();
    await expect(links.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/IggyIkenna/execution-service",
    );
    await expect(page.getByTestId("repo-detail-fleet-link")).toHaveAttribute("href", "/fleet");
  });

  // L294 (promotion_queue_conflict_wall_pileup_2026_06_17 § Class D): the detail pipeline strip
  // surfaces ALL THREE promotion hops (LDR→staging, staging→main, LDR→main), each leading with the
  // honest net file-delta via deltaLabel ("in sync (squash skew)" when files_changed==0 despite
  // ahead_by>0) — not just LDR→main, and not the prior ambiguous `find(base==="main")` that returned
  // the staging→main leg for the LDR→main slot. Mock seeds 3/1/4 files for the three legs.
  test("repo detail pipeline strip shows per-hop content deltas (L294)", async ({ page }) => {
    await page.goto("/repos");
    await page.getByTestId("repo-dropdown").selectOption("unified-trading-library");
    await expect(page.getByTestId("repo-detail")).toBeVisible();
    const deltas = page.getByTestId("pipeline-deltas");
    await expect(deltas).toBeVisible();
    await expect(page.getByTestId("delta-ldr-staging")).toContainText("3 files ahead");
    await expect(page.getByTestId("delta-staging-main")).toContainText("1 file ahead");
    // The LDR→main leg MUST be the main←LDR delta (4 files), NOT the ambiguous staging→main (1 file).
    await expect(page.getByTestId("delta-ldr-main")).toContainText("4 files ahead");
  });

  test("GCP/AWS toggle drives the repo-CI fetch via ?provider= (Option B, not a base-URL swap)", async ({ page }) => {
    // Regression for the deployed no-op: the toggle MUST append ?provider=<cloud> to the repo-CI
    // overview fetch so the SINGLE backend serves both clouds' build status (it used to switch the
    // base URL, a no-op in the bundled Cloud Run build → AWS silently re-showed GCP data).
    // SSOT: plans/active/issues/deployment_dashboard_image_status_and_multicloud_toggle_2026_06_17.md.
    await page.addInitScript(() => {
      (window as Window & { __mockRequests?: string[] }).__mockRequests = [];
    });
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-page")).toBeVisible();

    // Switch to AWS → the overview refetch carries ?provider=aws.
    await page.getByTestId("cloud-toggle-aws").click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          ((window as Window & { __mockRequests?: string[] }).__mockRequests ?? []).some(
            (u) => u.includes("/api/repo-ci/overview") && u.includes("provider=aws"),
          ),
        ),
      )
      .toBe(true);

    // Switch back to GCP → a fresh fetch carries ?provider=gcp (reset the log so this is meaningful).
    await page.evaluate(() => {
      (window as Window & { __mockRequests?: string[] }).__mockRequests = [];
    });
    await page.getByTestId("cloud-toggle-gcp").click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          ((window as Window & { __mockRequests?: string[] }).__mockRequests ?? []).some(
            (u) => u.includes("/api/repo-ci/overview") && u.includes("provider=gcp"),
          ),
        ),
      )
      .toBe(true);
  });

  // ── dep-order promotion HOLD surface (operator review 2026-06-19) ──────────────────────────
  test("Promotion-held card + stalled banner surface the dependency-order hold", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-page")).toBeVisible();
    // The stalled banner — one-glance WHY: a dep-order wait, NOT a failure.
    const banner = page.getByTestId("promotion-stalled-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Promotion stalled");
    await expect(banner).toContainText("unified-api-contracts");
    await expect(banner).toContainText("dependency-order wait, not a failure");
    // The 6th card (sibling to "Promotion blocked"): root blocker + held repos.
    const card = page.getByTestId("promotion-held-panel");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Promotion held — dependency order");
    await expect(page.getByTestId("promotion-held-root-unified-api-contracts")).toContainText("blocking 2");
    await expect(page.getByTestId("promotion-held-repos")).toContainText("strategy-service");
  });

  test("row badges flag the root blocker + point each held repo at its cause", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    // The tier-0 dep is the ROOT blocker (2 repos waiting).
    await expect(page.getByTestId("root-blocker-unified-api-contracts")).toContainText("root blocker · 2 waiting");
    // Each held repo points at its cause + its tier.
    await expect(page.getByTestId("blocked-by-strategy-service")).toContainText("unified-api-contracts (tier 0)");
    await expect(page.getByTestId("blocked-by-market-tick-data-service")).toContainText("unified-api-contracts");
    // A repo already on main carries neither badge.
    await expect(page.getByTestId("root-blocker-unified-trading-library")).toHaveCount(0);
    await expect(page.getByTestId("blocked-by-unified-trading-library")).toHaveCount(0);
  });

  test("every card carries a ? help popover explaining what it is", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-page")).toBeVisible();
    // The new dep-order card's help.
    await page.getByTestId("card-help-held-toggle").click();
    await expect(page.getByTestId("card-help-held")).toContainText("WAITING");
    await page.mouse.click(5, 5);
    await expect(page.getByTestId("card-help-held")).toHaveCount(0);
    // An existing card's help (routine drain).
    await page.getByTestId("card-help-drain-toggle").click();
    await expect(page.getByTestId("card-help-drain")).toContainText("every 15 min");
    await page.mouse.click(5, 5);
    // The failure-park vs dep-hold distinction is documented on the "blocked" card.
    await page.getByTestId("card-help-blocked-toggle").click();
    await expect(page.getByTestId("card-help-blocked")).toContainText("failure");
  });

  test("every table column carries a ? help popover explaining what it represents", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    // A left-side column.
    await page.getByTestId("col-help-ldr-toggle").click();
    await expect(page.getByTestId("col-help-ldr")).toContainText("integration trunk");
    await page.mouse.click(5, 5);
    await expect(page.getByTestId("col-help-ldr")).toHaveCount(0);
    // A right-edge column (popover drops inward).
    await page.getByTestId("col-help-image-toggle").click();
    await expect(page.getByTestId("col-help-image")).toContainText("build status");
    await page.mouse.click(5, 5);
    // The new per-hop + stall-reason columns document the promotion-stall taxonomy (the delta column
    // is now just the headline distance + lag; WHERE/WHY moved to these two dedicated columns).
    await page.getByTestId("col-help-hops-toggle").click();
    await expect(page.getByTestId("col-help-hops")).toContainText("staging→main");
    await page.mouse.click(5, 5);
    await page.getByTestId("col-help-reason-toggle").click();
    await expect(page.getByTestId("col-help-reason")).toContainText("blocked-by");
    await expect(page.getByTestId("col-help-reason")).toContainText("status stale");
  });

  test("per-hop + stall-reason columns localize a staging→main promoter stall (the AO class)", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    // agent-orchestrator fixture: LDR→staging fully drained, staging 144 files ahead of main, no PR,
    // ci_status MAIN_GREEN. The per-hop column localizes the stuck leg…
    await expect(page.getByTestId("hop-ldr-staging-agent-orchestrator")).toContainText("✓");
    await expect(page.getByTestId("hop-staging-main-agent-orchestrator")).toContainText("144f");
    // …and the stall-reason column names WHY: the promoter isn't firing + the status is lying.
    const reason = page.getByTestId("stall-reason-agent-orchestrator");
    await expect(reason).toContainText("staging→main not promoting");
    await expect(reason).toContainText("status stale");
    // A genuinely-in-sync repo (client-reporting-api fixture: all hops 0 files) shows no hop pills +
    // a dash reason — proves the dashboard doesn't false-flag a fully-promoted repo.
    await expect(page.getByTestId("hops-cell-client-reporting-api")).not.toContainText("stg→main");
    await expect(page.getByTestId("reason-cell-client-reporting-api")).toContainText("—");
  });

  test("sort control reorders the overview (A–Z + dependency tier)", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();
    const firstRepo = async () =>
      (await page.getByTestId("repo-ci-table").locator("tbody tr").first().getAttribute("data-testid"))?.replace(
        "repo-row-",
        "",
      );
    // A–Z: alphabetical first row (agent-orchestrator leads the mock fleet).
    await page.getByTestId("repo-sort-alpha").click();
    expect(await firstRepo()).toBe("agent-orchestrator");
    // Tier: the tier-0 dep (unified-api-contracts) sorts to the top of the layer stack.
    await page.getByTestId("repo-sort-tier").click();
    expect(await firstRepo()).toBe("unified-api-contracts");
  });

  test("full-width shell + per-column dividers on a wide monitor (operator 2026-06-22)", async ({ page }) => {
    // Regression for two readability fixes:
    //  (1) the shell adapts to screen width — the old <main> max-w-[1920px] cap centered the
    //      content and wasted the right third of a ≥2560px monitor;
    //  (2) the 14-column repo table carries vertical dividers so columns are distinct.
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-table")).toBeVisible();

    // (1) Full-width: <main> fills the wide viewport. Under the old 1920 cap this would be
    // ≤1920 on a 2560 screen — assert it well exceeds that so the cap cannot silently return.
    const mainWidth = await page
      .locator("main")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(mainWidth).toBeGreaterThan(2200);

    // (2) Dividers: a middle header cell (not first/last) carries a right border so the
    // columns read apart. Reverting the table className drops this to 0px.
    const borderRight = await page
      .getByTestId("repo-ci-table")
      .locator("thead th")
      .nth(1)
      .evaluate((el) => getComputedStyle(el).borderRightWidth);
    expect(parseFloat(borderRight)).toBeGreaterThan(0);
  });
});
