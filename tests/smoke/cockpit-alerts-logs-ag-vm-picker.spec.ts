/**
 * Regression: the cockpit Alerts & Logs "Live event stream" pane's per-AG/VM
 * picker. Residual todo from data_pipeline_alert_substrate_residual_2026_07_24.md
 * ("streaming events pane... per AG/VM"). The asset-group -> VM dropdowns derive
 * their options from GET /api/deployments/inventory (VM-kind rows only), same
 * source Deployments.tsx's own asset_group/service filters read — this spec
 * drives it against the mock backend's real fixture data (VITE_MOCK_API=true,
 * not a page.route stub), so it also guards the wiring survives a real payload
 * shape, not just a hand-built mock.
 */
import { expect, test } from "@playwright/test";

test.describe("Cockpit Alerts & Logs — per-AG/VM streaming picker", () => {
  test("selecting an asset group populates its VMs; picking one streams that VM", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByTestId("cockpit-alerts-logs")).toBeVisible();

    const agSelect = page.getByTestId("cockpit-logs-ag-select");
    const vmSelect = page.getByTestId("cockpit-logs-vm-select");
    await expect(agSelect).toBeVisible();
    await expect(vmSelect).toBeDisabled();

    // The mock fixture's "defi" asset group carries several VM-kind rows,
    // including defi-live-capture-1.
    await agSelect.selectOption("defi");
    await expect(vmSelect).toBeEnabled();
    const vmOptionValues = await vmSelect.locator("option").allTextContents();
    expect(vmOptionValues).toContain("defi-live-capture-1");

    await vmSelect.selectOption("defi-live-capture-1");
    await expect(page).toHaveURL(/logs=defi-live-capture-1/);
    await expect(page.getByTestId("cockpit-logs-empty")).toHaveCount(0);
    // The manual text box mirrors the picked VM (so switching back to free-text
    // starts from what's actually streaming, not a stale blank box).
    await expect(page.getByTestId("cockpit-logs-target")).toHaveValue("defi-live-capture-1");
  });

  test("switching asset group resets the VM selection", async ({ page }) => {
    await page.goto("/alerts");
    const agSelect = page.getByTestId("cockpit-logs-ag-select");
    const vmSelect = page.getByTestId("cockpit-logs-vm-select");

    await agSelect.selectOption("cefi");
    await vmSelect.selectOption("cefi-live-trading-1");
    await expect(page).toHaveURL(/logs=cefi-live-trading-1/);

    await agSelect.selectOption("sports");
    await expect(vmSelect).toHaveValue("");
    const vmOptionValues = await vmSelect.locator("option").allTextContents();
    expect(vmOptionValues).toContain("sports-backfill-20260621");
    // Switching AG alone doesn't clear an already-open stream (only picking a
    // new VM changes ?logs=) — the previous target keeps streaming until
    // superseded, matching the free-text box's existing behaviour.
    await expect(page).toHaveURL(/logs=cefi-live-trading-1/);
  });
});
