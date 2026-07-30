/**
 * Regression: the cockpit Alerts & Logs streaming panel (StreamingLogsPanel's
 * SSE path, `GET /api/logs/stream/{ref}`) renders the REAL backend contract,
 * not an invented shape. Residual todo from
 * data_pipeline_alert_substrate_residual_2026_07_24_finalize_2026_07_30.md
 * ("Confirm the streaming-events pane renders a real VM event stream").
 *
 * The prior [UI] P0 spec (cockpit-alerts-logs-ag-vm-picker.spec.ts) only
 * asserts the AG -> VM dropdown wiring — it never asserts what the panel BODY
 * renders once a stream is actually picked. This spec closes that gap.
 *
 * The fixtures below are NOT invented: they mirror the exact SSE contract
 * observed live on 2026-07-30 against the real (non-mock, CLOUD_MOCK_MODE=false)
 * deployment-api backend (`unified-trading-pm/scripts/dev/restart-deployment-stack.sh
 * --api`), traced to `deployment-api/routes/log_stream.py` `_vm_sse_generator`:
 *   - A genuinely running VM (`cefi-hyperliquid-2024-20260727-071055`) streamed
 *     real `vm_event` frames shaped exactly like FIXTURE_VM_EVENTS below (field
 *     names verbatim: timestamp/event/severity/message; a real
 *     PIPELINE_HEARTBEAT event body carrying `asset_group=cefi`).
 *   - A never-existed VM ref (`verification-probe-never-existed-vm-2026-07-30-xyz`)
 *     streamed ONLY `event: heartbeat` / `data: ping` frames for 35s straight —
 *     zero `vm_event` frames, never a fabricated row (the backend's
 *     `_collect_blob_names` returns `([], [])` on an empty GCS prefix and the
 *     loop simply never yields a vm_event; it does not synthesize one).
 * This spec locks that proven contract in as a hermetic (mock-mode) Playwright
 * guard, per the repo's page.route()-can-intercept-EventSource technique (SSE
 * requests are real network requests, unlike the app's `fetch` calls which
 * mock-api.ts's window.fetch shim answers before Playwright's route layer ever
 * sees them — see mock-api.ts's own "page.route never sees these requests"
 * comments, which are fetch-specific and do not apply to EventSource).
 */
import { expect, test } from "@playwright/test";

const FIXTURE_VM_EVENTS = [
  {
    timestamp: "2026-07-30T00:00:17Z",
    event: "PIPELINE_HEARTBEAT",
    severity: "INFO",
    message:
      "vm_name=mtds-onchain-perp-batch, asset_group=cefi, data_type=book_snapshot_5, rows_captured_cum=5348745, source=hyperliquid, handler=onchain_perp_batch",
  },
  {
    timestamp: "2026-07-30T00:00:46Z",
    event: "RESOURCE_PROFILER_SAMPLE",
    severity: "INFO",
    message: "service_name=market-tick-data-service, process_cpu_percent=21.2, system_memory_percent=6.4",
  },
];

function sseBody(frames: Array<{ event: string; data: string }>): string {
  return frames.map((f) => `event: ${f.event}\ndata: ${f.data}\n\n`).join("");
}

test.describe("Cockpit Alerts & Logs — streaming panel renders the real backend contract", () => {
  test("a VM with real emitted events renders its actual event rows (not fabricated)", async ({ page }) => {
    await page.route("**/api/logs/stream/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody(FIXTURE_VM_EVENTS.map((e) => ({ event: "vm_event", data: JSON.stringify(e) }))),
      }),
    );

    await page.goto("/alerts?logs=cefi-hyperliquid-2024-20260727-071055");
    await expect(page.getByTestId("cockpit-alerts-logs")).toBeVisible();
    await expect(page.getByTestId("cockpit-logs-empty")).toHaveCount(0);

    // Real field values from both fixture rows actually render — not a
    // generic placeholder, and not the honest-empty state.
    await expect(page.getByText("PIPELINE_HEARTBEAT")).toBeVisible();
    await expect(page.getByText(/asset_group=cefi/)).toBeVisible();
    await expect(page.getByText("RESOURCE_PROFILER_SAMPLE")).toBeVisible();
    await expect(page.getByTestId("streaming-logs-empty")).toHaveCount(0);
  });

  test("a VM ref that emitted nothing shows the honest empty state, never a fabricated row", async ({ page }) => {
    await page.route("**/api/logs/stream/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        // Mirrors the REAL backend's empty-GCS-prefix behaviour verbatim:
        // heartbeats only, zero vm_event frames (log_stream.py _vm_sse_generator).
        body: sseBody([{ event: "heartbeat", data: "ping" }]),
      }),
    );

    await page.goto("/alerts?logs=verification-probe-never-existed-vm-2026-07-30-xyz");
    await expect(page.getByTestId("cockpit-alerts-logs")).toBeVisible();
    // The outer "enter a target" placeholder is gone (a target IS selected)...
    await expect(page.getByTestId("cockpit-logs-empty")).toHaveCount(0);
    // ...but the panel itself honestly reports nothing streamed yet — never a
    // synthesized/fabricated log row standing in for real data.
    await expect(page.getByTestId("streaming-logs-empty")).toBeVisible();
    await expect(page.getByTestId("streaming-logs-empty")).toHaveText(/No events yet/);
    await expect(page.locator(".border-b.border-gray-800")).toHaveCount(0);
  });
});
