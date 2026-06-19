/**
 * Smoke tests for the codebase-health matrix columns on /repos:
 *   Cov% · QG reason · File debt
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md — [UI] P2 codebase-health matrix column.
 */

import { expect, test } from "@playwright/test";

test("codebase-health column header help toggles are visible in the overview table", async ({ page }) => {
  await page.goto("/repos");
  await expect(page.getByTestId("repo-ci-table")).toBeVisible();
  // The toggle button (always visible) carries the -toggle suffix per HelpPopover convention
  await expect(page.getByTestId("col-help-coverage-toggle")).toBeVisible();
  await expect(page.getByTestId("col-help-qg-reason-toggle")).toBeVisible();
  await expect(page.getByTestId("col-help-file-debt-toggle")).toBeVisible();
});

test("MAIN_GREEN repo shows green coverage chip ≥80%", async ({ page }) => {
  await page.goto("/repos");
  // unified-trading-library is MAIN_GREEN → mock seeds coverage_pct=87
  const covCell = page.getByTestId("cov-unified-trading-library");
  await expect(covCell).toBeVisible();
  await expect(covCell).toContainText("87%");
});

test("FAILING repo shows red coverage chip <70%", async ({ page }) => {
  await page.goto("/repos");
  // execution-service is FAILING → mock seeds coverage_pct=58
  const covCell = page.getByTestId("cov-execution-service");
  await expect(covCell).toBeVisible();
  await expect(covCell).toContainText("58%");
});

test("FAILING repo shows qg-reason chip with fail step", async ({ page }) => {
  await page.goto("/repos");
  // execution-service is FAILING → mock seeds qg_red_reason="basedpyright"
  const qgCell = page.getByTestId("qg-reason-execution-service");
  await expect(qgCell).toBeVisible();
  await expect(qgCell).toContainText("basedpyright");
});

test("MAIN_GREEN repo shows green QG-reason checkmark", async ({ page }) => {
  await page.goto("/repos");
  const qgCell = page.getByTestId("qg-reason-unified-trading-library");
  await expect(qgCell).toBeVisible();
  await expect(qgCell).toContainText("✓");
});

test("FAILING repo shows file-debt chip with large-file count", async ({ page }) => {
  await page.goto("/repos");
  // execution-service is FAILING → mock seeds large_file_count=2
  const debtCell = page.getByTestId("file-debt-execution-service");
  await expect(debtCell).toBeVisible();
  await expect(debtCell).toContainText(">900L");
});

test("MAIN_GREEN repo shows clean file-debt chip", async ({ page }) => {
  await page.goto("/repos");
  const debtCell = page.getByTestId("file-debt-unified-trading-library");
  await expect(debtCell).toBeVisible();
  await expect(debtCell).toContainText("✓");
});

test("tool repo shows dash for all health columns (no Python QG)", async ({ page }) => {
  await page.goto("/repos");
  // agent-orchestrator is type="tool" in mock → codebase_health=null → dash cells
  const covCell = page.getByTestId("cov-agent-orchestrator");
  await expect(covCell).toBeVisible();
  await expect(covCell).not.toContainText("%");
});
