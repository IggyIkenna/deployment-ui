/**
 * Regression (pw:L2): the detail panel's promotion-pipeline strip must NOT present `staging` as a
 * live hop for a repo that promotes LDR→main DIRECTLY.
 *
 * The bug (plan-reconcile 2026-07-15 §4, operator ruling A): `PromotionPipeline` rendered a FIXED
 * 5-stage path — LDR → staging PR → SIT → main → image — for every repo. But the fleet default is
 * LDR→`main` DIRECT with staging BYPASSED (per-repo `promotion_model: "ldr_main"`), so the strip
 * told the operator a hop the repo never takes was part of its promotion path. The overview's
 * HopPills/StallReason already muted the staging legs via `isStagingDormant`; the detail panel
 * never did, because `RepoCiDetail` carries no `promotion_model` — the flag is threaded down from
 * the overview row instead.
 *
 * Presentation is governed by operator 2026-06-28 — SHOW, don't hide: grey + "dormant", never red,
 * so flipping staging back to relevant restores the active styling with no structural change.
 * Asserts on `data-dormant` (not Tailwind colour classes) so a restyle can't silently void it.
 *
 * Mock fixture: `alerting-service` is seeded `promotionModel: "ldr_main"` (dormant);
 * `greeks-service` takes the normal staging path (control).
 */

import { expect, test } from "@playwright/test";

test.describe("Promotion pipeline — staging-dormant (ldr_main)", () => {
  test("an ldr_main repo shows staging as dormant/bypassed, never as a live hop", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-page")).toBeVisible();

    await page.getByTestId("repo-dropdown").selectOption("alerting-service");

    const pipeline = page.getByTestId("promotion-pipeline");
    await expect(pipeline).toBeVisible();

    const staging = page.getByTestId("pipeline-stage-staging");
    await expect(staging).toBeVisible();
    // The regression: this MUST be flagged dormant for a repo that bypasses staging.
    await expect(staging).toHaveAttribute("data-dormant", "true");
    await expect(staging).toContainText("dormant");
    await expect(staging).toContainText("bypassed");

    // SHOW, don't hide — the stage is still rendered, and the rest of the path is intact.
    await expect(page.getByTestId("pipeline-stage-ldr")).toBeVisible();
    await expect(page.getByTestId("pipeline-stage-main")).toBeVisible();
  });

  test("a normal staging-path repo keeps staging ACTIVE (guards against over-muting)", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByTestId("repo-ci-page")).toBeVisible();

    await page.getByTestId("repo-dropdown").selectOption("greeks-service");

    const staging = page.getByTestId("pipeline-stage-staging");
    await expect(staging).toBeVisible();
    // Not dormant → no marker, and it must not claim to be bypassed.
    await expect(staging).not.toHaveAttribute("data-dormant", "true");
    await expect(staging).not.toContainText("bypassed");
  });
});
