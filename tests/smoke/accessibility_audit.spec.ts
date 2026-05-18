/**
 * Accessibility audit — WCAG AA per-page axe-core scan.
 *
 * S7 of work_split_2026_05_18_harsh.md:
 * Scans each page with @axe-core/playwright and reports violations.
 * Run: npx playwright test tests/smoke/accessibility_audit.spec.ts
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// ── Minimal mock setup ────────────────────────────────────────────────────

const MOCK_HEALTH = {
  status: "ok",
  version: "1.0.0-test",
  config_dir: "/config",
  mock_mode: false,
  gcs_fuse: { active: true, reason: "mounted" },
};

async function mockBase(page: Page) {
  await page.route("**/api/health", (route) => route.fulfill({ json: MOCK_HEALTH }));
  await page.route("**/api/services", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/monitor/**", (route) =>
    route.fulfill({
      json: { jobs: [], total: 0, queried_at: new Date().toISOString(), cloud: "gcp", env: "dev" },
    }),
  );
  await page.route("**/api/dart/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/ml/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/strategy/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/research/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/ops/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/deployments**", (route) =>
    route.fulfill({ json: { deployments: [] } }),
  );
  await page.route("**/api/costs/**", (route) =>
    route.fulfill({
      json: { date: "2026-05-18", total_usd: 0, by_asset_group: [], by_archetype: [], by_vm: [] },
    }),
  );
  await page.route("**/api/vm/**", (route) => route.fulfill({ json: { vms: [] } }));
  await page.route("**/api/data-status/**", (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  );
  await page.route("**/api/risk/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/treasury/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/clients/**", (route) => route.fulfill({ json: {} }));
}

const PAGES: Array<{ name: string; path: string }> = [
  { name: "Home / Deployments", path: "/" },
  { name: "DART", path: "/dart" },
  { name: "ML Experiments", path: "/research/ml-experiments" },
  { name: "Strategy Backtests", path: "/research/strategy-backtests" },
  { name: "Execution Backtests", path: "/research/execution-backtests" },
  { name: "Live Deployments", path: "/ops/live-deployments" },
  { name: "Daily Costs", path: "/ops/costs" },
];

// ── Per-page axe scans ────────────────────────────────────────────────────

for (const { name, path } of PAGES) {
  test(`A11y: ${name} has no critical/serious WCAG AA violations`, async ({ page }) => {
    await mockBase(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules([
        // Color-contrast failures in dark-mode are a separate audit (S11).
        // Disable for this pass to focus on structural ARIA violations.
        "color-contrast",
      ])
      .analyze();

    // Filter to critical and serious violations only (best-effort for MVP).
    const criticalOrSerious = results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    );

    if (criticalOrSerious.length > 0) {
      const summary = criticalOrSerious
        .map((v) => `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)
        .join("\n");
      // eslint-disable-next-line no-console
      console.log(`\nAccessibility violations on ${name}:\n${summary}`);
    }

    expect(
      criticalOrSerious,
      `${criticalOrSerious.length} critical/serious WCAG AA violations on ${name}`,
    ).toHaveLength(0);
  });
}
