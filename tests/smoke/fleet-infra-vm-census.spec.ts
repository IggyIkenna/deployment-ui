/**
 * Regression spec for VM census + infra-VM health panels on /infra.
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md — [UI] P1 regression guard.
 * The vm-0 OOM class was previously invisible; this spec locks in visibility.
 * Both panels are powered by mock data (VITE_MOCK_API=true, port 5199).
 */

import { expect, test } from "@playwright/test";

// ── VM Census panel ──────────────────────────────────────────────────────────

test("vm-census-panel renders on /infra after data loads", async ({ page }) => {
  await page.goto("/infra");
  await expect(page.getByTestId("vm-census-panel")).toBeVisible();
});

test("vm-census running chip shows 2 from mock data", async ({ page }) => {
  await page.goto("/infra");
  const chip = page.getByTestId("vm-census-running");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("2");
});

test("vm-census expected chip shows 3 from mock data", async ({ page }) => {
  await page.goto("/infra");
  const chip = page.getByTestId("vm-census-expected");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("3");
});

test("vm-census OOM chip is always visible and shows 1 from mock data", async ({ page }) => {
  await page.goto("/infra");
  const chip = page.getByTestId("vm-census-oom");
  await expect(chip).toBeVisible();
  // mock seeds oom:1 (vm-defi-backfill OOM-terminated) — the previously invisible class
  await expect(chip).toContainText("1");
});

test("vm-census zombie chip is hidden when zombie count is 0", async ({ page }) => {
  await page.goto("/infra");
  // zombie chip is conditionally rendered only when zombie > 0; mock has zombie:0
  await expect(page.getByTestId("vm-census-zombie")).not.toBeVisible();
});

test("vm-census OOM-terminated VM row is visible in census table", async ({ page }) => {
  await page.goto("/infra");
  // mock seeds vm-defi-backfill-20260618-001 with oom:true, status:TERMINATED
  await expect(page.getByTestId("vm-census-row-vm-defi-backfill-20260618-001")).toBeVisible();
});

test("vm-census chip links to AO VMs page", async ({ page }) => {
  await page.goto("/infra");
  const chip = page.getByTestId("vm-census-running");
  // chips are <a> elements linking to AO
  const href = await chip.getAttribute("href");
  expect(href).toBeTruthy();
  expect(href).toContain("agent-orchestrator");
});

// ── Infra-VM health panel ────────────────────────────────────────────────────

test("infra-vm-health-panel renders on /infra after data loads", async ({ page }) => {
  await page.goto("/infra");
  await expect(page.getByTestId("infra-vm-health-panel")).toBeVisible();
});

test("infra-vm-health AO link chip is present and points to orchestrator URL", async ({ page }) => {
  await page.goto("/infra");
  const link = page.getByTestId("infra-vm-health-ao-link");
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toContain("agent-orchestrator");
});

test("infra-vm-health shows planning VM row", async ({ page }) => {
  await page.goto("/infra");
  // mock seeds planning + human-planning VMs
  await expect(page.getByTestId("infra-vm-row-planning")).toBeVisible();
});

test("infra-vm-health shows human-planning VM row", async ({ page }) => {
  await page.goto("/infra");
  await expect(page.getByTestId("infra-vm-row-human-planning")).toBeVisible();
});

// ── Regression: existing tiles still work after P1 additions ─────────────────

test("existing infra tile vms-running still renders correctly", async ({ page }) => {
  await page.goto("/infra");
  await expect(page.getByTestId("infra-tile-vms-running")).toBeVisible();
  await expect(page.getByTestId("infra-tile-vms-running")).toContainText("1");
});

test("existing infra tile central-vm still shows UP", async ({ page }) => {
  await page.goto("/infra");
  await expect(page.getByTestId("infra-tile-central-vm")).toContainText("UP");
});

test("existing fleet-git tile click-through still works", async ({ page }) => {
  // /fleet redirects onto the cockpit Fleet tab since the LandingTabs bar was deleted.
  await page.goto("/infra");
  await page.getByTestId("infra-tile-fleet-git").click();
  await expect(page).toHaveURL(/\/fleet$/);
  await expect(page.getByTestId("cockpit-fleet-git")).toBeVisible();
});
