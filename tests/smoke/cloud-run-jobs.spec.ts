/**
 * Smoke (pw:L2): Cloud Run Job registry page (/cloud-run-jobs) renders the scheduled-job
 * registry from GET /api/cloud-run-jobs (served by mock-api.ts) — a read-only table of
 * job name · terraform file · scheduler cadence · purpose.
 *
 * Regression guard for the deployment-ui surface added by plan
 * deployment_service_api_integration_cleanup_2026_08_18.md item 9 — a revert of the
 * page/route/nav entry breaks these assertions.
 */
import { expect, test } from "@playwright/test";

test.describe("Cloud Run Jobs registry page", () => {
  test("renders the registry table with job name, cadence and purpose", async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (err) => runtimeErrors.push(err.message));

    await page.goto("/cloud-run-jobs");
    await expect(page).toHaveURL(/\/cloud-run-jobs$/);
    await expect(page.getByTestId("cloud-run-jobs-page")).toBeVisible();
    await expect(page.getByTestId("cloud-run-jobs-table")).toBeVisible();

    // Known mock jobs render with their declared terraform file, cadence + purpose.
    await expect(page.getByTestId("cloud-run-job-data_pipeline_fleet_monitor")).toContainText(
      "data_pipeline_fleet_monitor_scheduler.tf",
    );
    await expect(page.getByTestId("cloud-run-job-honest_coverage")).toContainText("00:30 UTC daily");
    await expect(page.getByTestId("cloud-run-job-monitoring_deadman")).toContainText("deadman");

    expect(runtimeErrors).toEqual([]);
  });
});
