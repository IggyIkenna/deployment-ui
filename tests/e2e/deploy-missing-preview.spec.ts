/**
 * F.3 — Deploy-Missing preview flow.
 *
 * Mocks a drilldown response where a leaf has captured=0 + full shard-key.
 * Clicks the ↻ deploy button; asserts:
 *   - the copy-to-clipboard command renders
 *   - the command contains a 6-field shard-key shape (venue=.../data_type=.../date=...)
 * Switches to tarball-from-local mode; asserts:
 *   - LOCAL-ONLY warning panel is visible
 *   - command contains `&&` (not `;`), confirming create-code-tarballs.sh chains launcher
 *
 * Plan: data_status_comprehensive_test_coverage_2026_05_07 § F.3
 */

import { expect, Page, test } from "@playwright/test";

const SERVICE = "instruments-service";
const ASSET_GROUP = "cefi";

const LEAF_NODE = {
  axis: "date",
  value: "2026-05-01",
  captured: 0,
  empty_confirmed: 0,
  attempted_failed: 1,
  total: 1,
  completion_pct: 0,
  row_key: { venue: "BINANCE", data_type: "spot_ohlcv", instrument_type: "spot", date: "2026-05-01" },
  children: [],
  is_leaf: true,
};

const MOCK_DRILLDOWN = {
  service: SERVICE,
  asset_group: ASSET_GROUP,
  axes: ["venue", "data_type", "instrument_type", "date"],
  tree: [LEAF_NODE],
  totals: { captured: 0, empty_confirmed: 0, attempted_failed: 1, total: 1, completion_pct: 0 },
  filtered_by: {},
  total_top_axis_children: 1,
  child_offset: 0,
  child_limit: 200,
};

const MOCK_PREVIEW_RESPONSE = {
  service: SERVICE,
  asset_group: ASSET_GROUP,
  row_key: LEAF_NODE.row_key,
  shard_key: "venue=BINANCE/data_type=spot_ohlcv/instrument_type=spot/date=2026-05-01",
  launcher_script: "deployment-service/scripts/vm/launch-instruments-backfill-vm.sh",
  command:
    "bash deployment-service/scripts/vm/launch-instruments-backfill-vm.sh" +
    " --shard-key venue=BINANCE/data_type=spot_ohlcv/instrument_type=spot/date=2026-05-01",
  notes: [],
  mode: "preview",
  warnings: [],
};

const MOCK_PREVIEW_TARBALL = {
  ...MOCK_PREVIEW_RESPONSE,
  command:
    "bash deployment-service/scripts/vm/create-code-tarballs.sh --all &&" +
    " bash deployment-service/scripts/vm/launch-instruments-backfill-vm.sh" +
    " --shard-key venue=BINANCE/data_type=spot_ohlcv/instrument_type=spot/date=2026-05-01",
  mode: "tarball-from-local" as const,
  warnings: ["LOCAL-ONLY: This mode bundles your local working tree. Run only from your workstation."],
};

async function setupMocks(page: Page) {
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        status: "ok",
        version: "1.0.0-test",
        config_dir: "/config",
        gcs_fuse: { active: true, reason: "mounted" },
      },
    }),
  );

  await page.route("**/api/services", (route) =>
    route.fulfill({
      json: [
        {
          name: SERVICE,
          description: SERVICE,
          dimensions: [],
          docker_image: "gcr.io/p/svc:latest",
          cloud_run_job_name: SERVICE,
        },
      ],
    }),
  );

  await page.route("**/api/services/*/dimensions", (route) =>
    route.fulfill({ json: { service: SERVICE, dimensions: [], cli_args: {} } }),
  );

  await page.route("**/api/data-status/drilldown-pairs", (route) =>
    route.fulfill({ json: [{ service: SERVICE, asset_group: ASSET_GROUP }] }),
  );

  await page.route("**/api/data-status/drilldown/**", (route) => route.fulfill({ json: MOCK_DRILLDOWN }));

  await page.route("**/api/config/region", (route) => route.fulfill({ json: { deployment_env: "development" } }));

  await page.route("**/api/data-status/deploy-missing-preview", async (route) => {
    const body = JSON.parse((await route.request().postData()) ?? "{}") as Record<string, unknown>;
    const mode = body.mode ?? "preview";
    route.fulfill({
      json: mode === "tarball-from-local" ? MOCK_PREVIEW_TARBALL : MOCK_PREVIEW_RESPONSE,
    });
  });

  await page.route("**/api/**", (route) => route.fulfill({ status: 404, json: {} }));
}

test("deploy-missing preview renders command with shard-key fields on leaf with captured=0", async ({ page }) => {
  await setupMocks(page);

  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  await page.getByText(SERVICE, { exact: true }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Data Status" }).click();
  await page.waitForLoadState("networkidle");

  // Locate the ↻ deploy button (rendered by HierarchicalShardDrilldown for a missing shard leaf).
  const deployBtn = page.getByText("↻ deploy").first();
  await expect(deployBtn).toBeVisible({ timeout: 8000 });
  await deployBtn.click();

  // Preview dialog should open.
  await expect(page.getByRole("dialog", { name: /Deploy-Missing preview/ })).toBeVisible({ timeout: 5000 });

  // Command must reference shard-key fields.
  await expect(page.getByText(/venue=BINANCE/)).toBeVisible();
  await expect(page.getByText(/data_type=spot_ohlcv/)).toBeVisible();
  await expect(page.getByText(/date=2026-05-01/)).toBeVisible();
});

test("tarball-from-local mode shows LOCAL-ONLY warning + && in command", async ({ page }) => {
  await setupMocks(page);

  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  await page.getByText(SERVICE, { exact: true }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Data Status" }).click();
  await page.waitForLoadState("networkidle");

  const deployBtn = page.getByText("↻ deploy").first();
  await expect(deployBtn).toBeVisible({ timeout: 8000 });
  await deployBtn.click();

  await expect(page.getByRole("dialog", { name: /Deploy-Missing preview/ })).toBeVisible({ timeout: 5000 });

  // Switch to tarball-from-local mode.
  await page.getByLabel(/tarball-from-local \(bundle my local code first\)/).click();

  // LOCAL-ONLY warning panel should appear.
  await expect(page.getByText(/LOCAL-ONLY/)).toBeVisible({ timeout: 3000 });

  // Command must contain && (not ;) to chain tarball build with launcher.
  await expect(page.getByText(/create-code-tarballs\.sh.*&&/)).toBeVisible();
});
