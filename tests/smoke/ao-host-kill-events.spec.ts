/**
 * pw:L2 — AO-host watchdog kill-events surface
 * (watchdog_kill_events_deployment_gaps_2026_08_05.md, Gap 2).
 *
 * The AO/orchestrator host runs the resource-watchdog but is not a
 * deployment-service-launched VM, so it has zero resource_samples rows and never appears in
 * the /vm-resources rolling table. This spec guards the dedicated AO-host kill-events card
 * on /vm-resources that reads /api/watchdog/kill-events filtered to the AO host's vm_name —
 * visible WITHOUT expanding any VM row, i.e. not gated on resource_samples. The mock fixture
 * (src/lib/mock-api.ts) returns the same watchdog shape for any vm_name.
 */
import { expect, test } from "@playwright/test";

test.describe("AO-host watchdog kill-events surface", () => {
  test("AO-host kill-events card renders populated without any VM row expanded", async ({ page }) => {
    await page.goto("/vm-resources");
    await expect(page.getByTestId("vm-resource-comparison-page")).toBeVisible();

    // The AO-host surface is present and populated on load — no resource_samples gating:
    // nothing below expands a VM row.
    await expect(page.getByTestId("ao-host-kill-events-card")).toBeVisible();
    await expect(page.getByTestId("ao-host-kill-events-card")).toContainText("ip-172-31-5-118");

    const table = page.getByTestId("ao-host-kill-events-table");
    await expect(table).toBeVisible();
    await expect(table).toContainText("python -m pytest");
    await expect(table).toContainText("rss:51204000kB > 8388608kB");
    await expect(table).toContainText("51204 / 8388 MB");
  });

  test("AO-host kill-events card tracks the window selector", async ({ page }) => {
    await page.goto("/vm-resources");
    await expect(page.getByTestId("ao-host-kill-events-table")).toBeVisible();

    // Window switch refetches the AO-host surface too (same WINDOW_HOURS mapping as the VM table).
    await page.getByTestId("vm-resource-comparison-window-24h").click();
    await expect(page.getByTestId("ao-host-kill-events-card")).toContainText("last 24h");
  });
});
