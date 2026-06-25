/**
 * Regression guard: the promotion-blocked panel (G1 — alert-parity for the staging→main
 * genuine-failure CRITICAL page + newly-quarantined WARNING) and the B3 commit-count in the
 * LDR→main delta cell (operator adds 2026-06-11 — guards reverting these features).
 * Plan: monitoring_control_plane_master_2026_06_10.md (G1 + B3).
 */

import { expect, test } from "@playwright/test";

test.describe("Repos CI — promotion-failing headline parity (Slack↔/repos)", () => {
  // ci_status_repos_promotion_failure_parity_2026_06_25: a repo whose ci_status reads MAIN_GREEN but
  // whose LDR→main promotion PR's required quality-gates-v2 FAILED (paged Slack CRITICAL) must show a
  // "PROMOTION FAILING" chip at the repo level — the masked stale-green case the operator hit on
  // PM PR-547. The mock unified-trading-pm row is MAIN_GREEN with a failing_check LDR→main PR + zero
  // content deltas (squash-merged) so drain_stalled does NOT fire — only promotion_blocked surfaces.
  test("a MAIN_GREEN repo with a failing promotion PR shows a PROMOTION FAILING chip", async ({ page }) => {
    await page.goto("/repos");
    const row = page.getByTestId("repo-row-unified-trading-pm");
    await expect(row).toBeVisible();
    const chip = page.getByTestId("promotion-failing-unified-trading-pm");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("PROMOTION FAILING");
  });

  test("a healthy MAIN_GREEN repo does NOT show a PROMOTION FAILING chip", async ({ page }) => {
    await page.goto("/repos");
    const utl = page.getByTestId("repo-row-unified-trading-library");
    await expect(utl).toBeVisible();
    await expect(page.getByTestId("promotion-failing-unified-trading-library")).toHaveCount(0);
  });
});

test.describe("Repos CI — promotion-blocked panel (G1)", () => {
  test("always-visible panel lists quarantined + failing repos", async ({ page }) => {
    await page.goto("/repos");
    const panel = page.getByTestId("promotion-blocked-panel");
    await expect(panel).toBeVisible();
    // greeks-service quarantined (CRITICAL); execution-service failing-not-quarantined (WARNING).
    const greeks = panel.getByTestId("promotion-blocked-greeks-service");
    await expect(greeks).toBeVisible();
    await expect(greeks).toContainText("quarantined");
    await expect(greeks).toContainText("escalated");
    const exec = panel.getByTestId("promotion-blocked-execution-service");
    await expect(exec).toBeVisible();
    await expect(exec).toContainText("1 fail");
  });
});

test.describe("Repos CI — B3 commit count in LDR→main delta", () => {
  test("delta cell shows files-ahead (content truth) AND commit count", async ({ page }) => {
    await page.goto("/repos");
    const row = page.getByTestId("repo-row-unified-trading-library");
    await expect(row).toBeVisible();
    // Mock LDR→main delta = 4 files / 3 commits ahead → "4 files ahead · 3 commits".
    await expect(row).toContainText("4 files ahead · 3 commits");
  });
});

test.describe("Repos CI — B2 drill-down build header", () => {
  test("opening a (green) repo shows a build-details header: status + source + time + commit + log", async ({
    page,
  }) => {
    await page.goto("/repos");
    await page.getByTestId("repo-dropdown").selectOption("market-tick-data-service");
    const header = page.getByTestId("repo-detail-build-header");
    await expect(header).toBeVisible();
    await expect(header).toContainText("Last image build");
    // Source inferred from the (mock Cloud Build) log URL.
    await expect(header.getByTestId("build-header-source")).toHaveText("Cloud Build");
    // Built commit sha links to the GitHub commit.
    const sha = header.getByTestId("build-header-sha");
    await expect(sha).toHaveText("aaa1111");
    await expect(sha).toHaveAttribute("href", /github\.com\/.+\/commit\/aaa1111/);
    // Build time + log click-through present.
    await expect(header.getByTestId("build-header-time")).toBeVisible();
    await expect(header.getByTestId("build-header-log")).toHaveAttribute("href", /cloud-build|codebuild/);
  });

  test("a FAILED latest build still surfaces the LAST SUCCESSFUL build (sha + log)", async ({ page }) => {
    await page.goto("/repos");
    // execution-service is FAILING in the mock → latest build red, prior success surfaced.
    await page.getByTestId("repo-dropdown").selectOption("execution-service");
    const success = page.getByTestId("repo-detail-last-success");
    await expect(success).toBeVisible();
    await expect(success).toContainText("Last successful build");
    const sha = success.getByTestId("last-success-sha");
    await expect(sha).toHaveText("aaa1111");
    await expect(sha).toHaveAttribute("href", /github\.com\/.+\/commit\/aaa1111/);
    await expect(success.getByTestId("last-success-log")).toHaveAttribute("href", /cloud-build|codebuild/);
  });
});

test.describe("Repos CI — B1 Image column build visibility", () => {
  test("Image cell shows build time + a click-through to the build log", async ({ page }) => {
    await page.goto("/repos");
    const row = page.getByTestId("repo-row-unified-trading-library");
    const cell = row.getByTestId("image-cell");
    await expect(cell).toBeVisible();
    // Build time rendered (B1 — when it last built), deterministic MM-DD HH:MM.
    await expect(cell.getByTestId("image-build-time")).toHaveText("06-11 07:30");
    // Built COMMIT SHA rendered + links to the GitHub commit ("where the build came from").
    const sha = cell.getByTestId("image-build-sha");
    await expect(sha).toHaveText("aaa1111");
    await expect(sha).toHaveAttribute("href", /github\.com\/.+\/commit\/aaa1111/);
    // Log click-through to the GCP Cloud Build / AWS CodeBuild console.
    const link = cell.getByTestId("image-log-link");
    await expect(link).toHaveAttribute("href", /cloud-build|codebuild/);
  });

  test("a failing repo's Image cell shows the last GREEN sha (✓) so the good image isn't hidden", async ({ page }) => {
    await page.goto("/repos");
    // execution-service is FAILING → latest red; the ✓ last-success indicator is shown + linked.
    const cell = page.getByTestId("repo-row-execution-service").getByTestId("image-cell");
    const ok = cell.getByTestId("image-last-success");
    await expect(ok).toContainText("aaa1111");
    await expect(ok).toHaveAttribute("href", /github\.com\/.+\/commit\/aaa1111/);
  });
});
