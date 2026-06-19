/**
 * Smoke + regression: Infra VM Status tab (central/infra-VM health + census, task 010).
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md task 010 +
 * monitoring_control_plane_master_2026_06_10.md (division-of-surfaces rule).
 *
 * Guards:
 *   - Tab renders at /infra and shows the VM census summary
 *   - Per-VM cards render (planning + human-planning from mock)
 *   - Watchdog OOM chip renders for the planning VM (kills_today=2 → yellow chip)
 *   - Stale VM gets a "stale" chip (human-planning, stale=true in mock)
 *   - "Open in Agent-Orchestrator" click-through link is present
 *   - Reverting any of the above trips this spec
 */

import { expect, test } from "@playwright/test";

test.describe("Infra VM Status tab", () => {
  test("nav tab routes to /infra and renders the census", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-infra-vm-tab-trigger").click();
    await expect(page).toHaveURL(/\/infra$/);
    await expect(page.getByTestId("infra-vm-page")).toBeVisible();
    await expect(page.getByTestId("infra-vm-census")).toBeVisible();
  });

  test("deep-link to /infra opens the Infra VM tab directly", async ({ page }) => {
    await page.goto("/infra");
    await expect(page.getByTestId("infra-vm-page")).toBeVisible();
  });

  test("central VM card renders with slot chips", async ({ page }) => {
    await page.goto("/infra");
    // The planning VM card (id=planning) from mock data.
    const card = page.getByTestId("infra-vm-card-planning");
    await expect(card).toBeVisible();
    // slots_working=2 chip
    await expect(page.getByTestId("infra-vm-slots-working-planning")).toContainText("2");
    // live chip (stale=false)
    await expect(page.getByTestId("infra-vm-live-planning")).toBeVisible();
  });

  test("stale VM gets a stale chip", async ({ page }) => {
    await page.goto("/infra");
    // human-planning VM is stale=true in mock
    await expect(page.getByTestId("infra-vm-stale-human-planning")).toBeVisible();
  });

  test("watchdog OOM chip renders for VMs with recent kills", async ({ page }) => {
    await page.goto("/infra");
    // planning VM has kills_today=2 → watchdog chip should appear
    const watchdogChip = page.getByTestId("infra-vm-watchdog-chip").first();
    await expect(watchdogChip).toBeVisible();
    // kills_today=2, not dormant/flapping → "2 kills today" text
    await expect(watchdogChip).toContainText("kills today");
  });

  test("click-through links to the Agent-Orchestrator dashboard", async ({ page }) => {
    await page.goto("/infra");
    const link = page.getByTestId("infra-vm-open-orchestrator").first();
    await expect(link).toBeVisible();
    // Must deep-link to the AO dashboard (division-of-surfaces rule).
    await expect(link).toHaveAttribute("href", /agent-orchestrator/);
  });
});
