/**
 * pw:L2 — WS-D full-estate deployment cockpit.
 *
 * Regression guard for deployment_full_estate_cost_provenance_2026_07_09: launched-by provenance
 * column + filter (#14), the red leaked-resources badge (#5), the new DISK/STATIC_IP/SCHEDULER
 * kinds + the OVERDUE scheduler chip (#15/#9), the estate stranded-cost total (#17), the Lambda
 * last-MODIFIED cell (#10), the running→leaked→rest sort (#16), and the detail popover's job
 * run-history + manifest bridge link (#11/#12). Runs against the mock API (VITE_MOCK_API) whose
 * WS-D fixtures live in src/lib/mock-api.ts.
 */
import { expect, test } from "@playwright/test";

test.describe("WS-D full-estate deployment cockpit", () => {
  test("#14 launched-by column + filter isolates ad-hoc (unmanaged) rows", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    // The provenance cell renders the launched-by chip.
    await expect(page.getByTestId("launched-by-cell-wsd-zombie-adhoc-vm")).toContainText("adhoc");
    // Filter → adhoc: only the two ad-hoc rows survive; a managed row is filtered out.
    await page.getByTestId("filter-launched-by").selectOption("adhoc");
    await expect(page.getByTestId("deployment-row-wsd-zombie-adhoc-vm")).toBeVisible();
    await expect(page.getByTestId("deployment-row-wsd-onchain-canon-vm")).toBeVisible();
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toHaveCount(0);
  });

  test("#5 red leaked-resources badge shows on a non-running VM with a lingering disk, not on a clean VM", async ({
    page,
  }) => {
    await page.goto("/deployments?status=all");
    const badge = page.getByTestId("leaked-wsd-zombie-adhoc-vm");
    await expect(badge).toContainText("leaked");
    await expect(badge).toContainText("est"); // inferred-cost marker (principle 8)
    // A cleanly-running VM carries no leaked badge.
    await expect(page.getByTestId("leaked-defi-live-capture-1")).toHaveCount(0);
  });

  test("#15/#9 new kinds render (DISK / STATIC_IP / SCHEDULER) + the OVERDUE scheduler chip", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("kind-badge-DISK").first()).toBeVisible();
    await expect(page.getByTestId("kind-badge-STATIC_IP").first()).toBeVisible();
    await expect(page.getByTestId("kind-badge-SCHEDULER").first()).toBeVisible();
    await expect(page.getByTestId("feed-health-wsd-consolidator-cron")).toContainText("overdue");
  });

  test("#17 estate stranded-cost total renders with an inferred marker", async ({ page }) => {
    await page.goto("/deployments?status=all");
    const total = page.getByTestId("stranded-cost-total");
    await expect(total).toBeVisible();
    await expect(total).toContainText("stranded");
    await expect(total).toContainText("est"); // never presented as an exact billing figure
  });

  test("#10 Lambda shows last-MODIFIED (not last-run) in the Last-run cell", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-row-wsd-webhook-lambda")).toContainText("mod 2026-06-22");
  });

  test("#16 default sort: running rows above leaked non-running rows", async ({ page }) => {
    await page.goto("/deployments?status=all");
    const running = await page.getByTestId("deployment-row-wsd-onchain-canon-vm").boundingBox();
    const leaked = await page.getByTestId("deployment-row-wsd-zombie-adhoc-vm").boundingBox();
    expect(running).not.toBeNull();
    expect(leaked).not.toBeNull();
    expect(running!.y).toBeLessThan(leaked!.y);
  });

  test("#11/#12 job detail popover shows run-history + the consolidator bridge link", async ({ page }) => {
    await page.goto("/deployments/manifest-consolidator");
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();
    const history = page.getByTestId("detail-run-history-list");
    await expect(history).toBeVisible();
    expect(await history.locator("li").count()).toBeGreaterThan(1); // cadence answerable by eye
    // The manifest bridge: a link to the consolidator (which owns the authoritative verdict).
    await expect(page.getByTestId("detail-consolidator-link")).toBeVisible();
  });

  test("#5 leaked-VM detail lists each unreleased resource", async ({ page }) => {
    await page.goto("/deployments/wsd-zombie-adhoc-vm");
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();
    const list = page.getByTestId("detail-unreleased-list");
    await expect(list).toBeVisible();
    await expect(list).toContainText("wsd-zombie-data");
  });

  test("#D.3 service-only composite verdicts render — a health value outside the VM/scheduler vocabulary must not crash the row", async ({
    page,
  }) => {
    await page.goto("/deployments?status=all");
    // Pre-fix, a composite_health_status of serving / scaled-to-zero / degraded (ServiceHealth-only,
    // folded into the same field by the live inventory) threw in compositeHealthLabel's unguarded
    // HEALTH_META lookup and white-screened the WHOLE list. The matrix must still render, and the
    // service rows must show their verdict chip (serving→green, degraded→yellow).
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    await expect(page.getByTestId("feed-health-uts-shared-deployment-api")).toContainText("serving");
    await expect(page.getByTestId("feed-health-uts-strategy-service-prod")).toContainText("degraded");
  });

  test("help button opens the quick-guide with the column + provenance + health legend", async ({ page }) => {
    await page.goto("/deployments?status=all");
    // Guide is closed until asked for.
    await expect(page.getByTestId("deployments-help-body")).toHaveCount(0);
    await page.getByTestId("deployments-help").click();
    const body = page.getByTestId("deployments-help-body");
    await expect(body).toBeVisible();
    // The three legends a reader comes here for.
    await expect(body).toContainText("Columns");
    await expect(body).toContainText("Launched by");
    await expect(body).toContainText("adhoc");
    await expect(body).toContainText("Health");
    await expect(body).toContainText("stranded-cost total");
  });

  test("filters: Mode exposes Infra(NONE) + Experiment and the choice sticks (regression: URL whitelist drift)", async ({
    page,
  }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    const mode = page.getByTestId("filter-mode");
    // Pre-fix the dropdown had only LIVE/BATCH/PAPER, so selectOption("NONE") would fail outright —
    // and even if the option existed, the URL whitelist ["LIVE","BATCH","PAPER"] rejected it, snapping
    // the selection back to "". Both are now fixed: the option exists AND the value persists.
    await mode.selectOption("NONE");
    await expect(mode).toHaveValue("NONE");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    await mode.selectOption("EXPERIMENT");
    await expect(mode).toHaveValue("EXPERIMENT");
  });

  test("filters: Status exposes stopped + pending (regression: orphaned disk / stopped schedulers were unreachable)", async ({
    page,
  }) => {
    await page.goto("/deployments?status=all");
    const status = page.getByTestId("filter-status");
    await status.selectOption("stopped");
    await expect(status).toHaveValue("stopped");
    await status.selectOption("pending");
    await expect(status).toHaveValue("pending");
  });

  test("filters: status defaults to running (live-first) and the dropdown reflects it; 'all' reveals history", async ({
    page,
  }) => {
    await page.goto("/deployments");
    // Live-first default — the dropdown shows running, NOT all (operator: reflect the active default).
    await expect(page.getByTestId("filter-status")).toHaveValue("running");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    // Switching to all reflects + reveals the completed / historical rows.
    await page.getByTestId("filter-status").selectOption("all");
    await expect(page.getByTestId("filter-status")).toHaveValue("all");
  });

  test("filters: region dropdown present, defaults to asia-northeast1, dynamic list + selection sticks", async ({
    page,
  }) => {
    await page.goto("/deployments?status=all");
    const region = page.getByTestId("filter-region");
    await expect(region).toBeVisible();
    await expect(region).toHaveValue("asia-northeast1");
    // The dynamic list (from /api/deployments/regions) must have loaded the other regions + "all".
    await expect(region.locator('option[value="europe-west1"]')).toBeAttached();
    await region.selectOption("europe-west1");
    await expect(region).toHaveValue("europe-west1");
    await region.selectOption("all");
    await expect(region).toHaveValue("all");
  });

  test("sort: default hierarchy ranks a long-running VM above a Cloud Run job (both running)", async ({ page }) => {
    await page.goto("/deployments"); // default = running
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    const vm = await page.getByTestId("deployment-row-wsd-onchain-canon-vm").boundingBox();
    const job = await page.getByTestId("deployment-row-market-tick-cefi-binance-futures").boundingBox();
    expect(vm).not.toBeNull();
    expect(job).not.toBeNull();
    expect(vm!.y).toBeLessThan(job!.y); // VM (long-running) above the run-job (kind band)
  });

  test("sort: clicking a column header sorts by it; the indicator cycles asc → desc → off", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    const target = page.getByTestId("col-target");
    await target.click();
    await expect(target).toContainText("▲");
    await target.click();
    await expect(target).toContainText("▼");
    await target.click(); // third click clears back to the default hierarchy
    await expect(target).not.toContainText("▲");
    await expect(target).not.toContainText("▼");
  });
});
