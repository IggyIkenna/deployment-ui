/**
 * Regression spec for §2 — History tab fix.
 * Guards: History tab is present in service view, renders deployment rows,
 * and does not throw a runtime error when the backend is mocked.
 */
import { test, expect } from "@playwright/test";

const MOCK_SERVICES = [
  {
    name: "instruments-service",
    description: "Instrument universe",
    dimensions: ["category", "date"],
    docker_image: "gcr.io/project/instruments-service:latest",
    cloud_run_job_name: "instruments-service",
  },
];

const MOCK_DEPLOYMENTS = {
  deployments: [
    {
      id: "dep-hist-001",
      service: "instruments-service",
      status: "completed",
      created_at: "2026-01-15T10:00:00Z",
      updated_at: "2026-01-15T11:00:00Z",
      total_shards: 24,
      completed_shards: 24,
      failed_shards: 0,
      parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp" },
    },
    {
      id: "dep-hist-002",
      service: "instruments-service",
      status: "running",
      created_at: "2026-01-15T12:00:00Z",
      updated_at: "2026-01-15T12:30:00Z",
      total_shards: 10,
      completed_shards: 3,
      failed_shards: 0,
      parameters: {
        compute: "cloud_run",
        mode: "live",
        cloud_provider: "gcp",
      },
    },
  ],
  total: 2,
};

test.beforeEach(async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (err) => runtimeErrors.push(err.message));
  (page as Record<string, unknown>).__runtimeErrors = runtimeErrors;

  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: { status: "ok", version: "test", config_dir: "/c", gcs_fuse: { active: true, reason: "mounted" } },
    }),
  );
  await page.route("**/api/services", (route) => route.fulfill({ json: MOCK_SERVICES }));
  await page.route("**/api/deployments**", async (route) => {
    const url = route.request().url();
    if (url.includes("/events") || url.includes("/vm-events")) {
      await route.fulfill({ json: { events: [], count: 0 } });
    } else if (route.request().method() === "POST") {
      await route.fulfill({
        json: {
          dry_run: true,
          service: "instruments-service",
          total_shards: 0,
          message: "dry",
          cli_command: "",
          shards: [],
        },
      });
    } else {
      await route.fulfill({ json: MOCK_DEPLOYMENTS });
    }
  });
  await page.route("**/cloud-builds/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/service-status/**", (route) =>
    route.fulfill({
      json: {
        health: "healthy",
        last_data_update: null,
        last_deployment: null,
        last_build: null,
        last_code_push: null,
        anomalies: [],
        details: {},
      },
    }),
  );
});

test("History tab is visible in service detail view", async ({ page }) => {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");

  await page.getByText("instruments", { exact: true }).first().click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("tab", { name: /History/i })).toBeVisible();
});

test("History tab renders deployment rows without crashing", async ({ page }) => {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");

  await page.getByText("instruments", { exact: true }).first().click();
  await page.waitForLoadState("networkidle");

  await page.getByRole("tab", { name: /History/i }).click();

  await expect(page.getByText("dep-001")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("dep-002")).toBeVisible({ timeout: 5_000 });

  const errors = (page as Record<string, unknown>).__runtimeErrors as string[];
  expect(errors).toEqual([]);
});

test("History tab shows Completed and Running badges", async ({ page }) => {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");

  await page.getByText("instruments", { exact: true }).first().click();
  await page.waitForLoadState("networkidle");

  await page.getByRole("tab", { name: /History/i }).click();
  await expect(page.getByText("dep-001")).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText("Completed").first()).toBeVisible();
  await expect(page.getByText("Running").first()).toBeVisible();
});

test("History tab is absent when no service selected (overview mode)", async ({ page }) => {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("tab", { name: /History/i })).not.toBeVisible();
});

test("switching to History tab does not show ErrorBoundary crash", async ({ page }) => {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");

  await page.getByText("instruments", { exact: true }).first().click();
  await page.waitForLoadState("networkidle");

  await page.getByRole("tab", { name: /History/i }).click();

  await expect(page.getByText("Something went wrong")).not.toBeVisible();
  await expect(page.getByText(/Unknown Error|TypeError|Cannot read/i)).not.toBeVisible();
});
