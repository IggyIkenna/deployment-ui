/**
 * Visibility-paused polling — deployment_ui_ux_caching_walkthrough decision #1.
 *
 * `useVisibilityPausedInterval` (src/hooks/useVisibilityPausedInterval.ts) pauses
 * interval-based polling while the tab is hidden (`document.hidden`) and resumes with
 * an IMMEDIATE refresh when it becomes visible again, without changing the configured
 * cadence. Exercised here against the GhRateBudget widget's 60s poll (Repos-CI page):
 *
 *   1. While hidden, no new poll fires even after well over one cadence period.
 *   2. On becoming visible again, a refresh fires IMMEDIATELY (no further time advance
 *      needed) — proving it's an edge-triggered resume, not just "the next natural tick".
 *
 * (The kill-switch tab's 5s poll is the ONE explicit exception — it must NOT be
 * visibility-paused, per the operator decision. That component
 * (src/components/widgets/kill_switch/KillSwitchTab.tsx) is not currently mounted on
 * any route in this app, so it has no reachable Playwright surface; the exception is
 * verified by inspection — its polling effect was left untouched by this change.)
 *
 * Uses Playwright's fake clock (`page.clock`) to avoid a real 60s+ wall-clock wait:
 * `install()` alone still ticks in real time (so the page loads normally), and
 * `pauseAt()` freezes it so `runFor()` can deterministically fire — or NOT fire — due
 * timers from that point on.
 */

import { expect, Page, test } from "@playwright/test";

type MockRequestsWindow = Window & { __mockRequests?: string[] };

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { value: h, configurable: true });
    Object.defineProperty(document, "visibilityState", {
      value: h ? "hidden" : "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function countRequests(page: Page, needle: string): Promise<number> {
  return page.evaluate(
    (n) => ((window as MockRequestsWindow).__mockRequests ?? []).filter((u) => u.includes(n)).length,
    needle,
  );
}

test.describe("visibility-paused polling", () => {
  test("GhRateBudget's 60s poll pauses while hidden, resumes with an immediate refresh when visible", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.clock.install();
    await page.addInitScript(() => {
      (window as MockRequestsWindow).__mockRequests = [];
    });

    // Repos CI is the cockpit's CI tab since the LandingTabs bar was deleted (2026-07-17).
    await page.goto("/cockpit");
    await page.getByTestId("cockpit-tab-ci").click();
    await expect(page.getByTestId("repo-ci-page")).toBeVisible();
    await expect(page.getByTestId("gh-rate-budget")).toBeVisible();

    // Freeze the clock a moment after the page has settled, so time only
    // moves from here on when we explicitly advance it.
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1_000);

    // Clean slate: only count requests made from this point forward.
    await page.evaluate(() => {
      (window as MockRequestsWindow).__mockRequests = [];
    });

    // Tab goes to the background.
    await setHidden(page, true);

    // Advance well past TWO 60s cadences — no poll should fire while hidden.
    await page.clock.runFor(130_000);
    const requestsWhileHidden = await countRequests(page, "/api/repos/gh-rate-limit");
    expect(requestsWhileHidden, "no poll should fire while the tab is hidden").toBe(0);

    // Tab comes back to the foreground — expect an IMMEDIATE refresh: only
    // enough clock advance to flush the mock's artificial network delay
    // (well under the 60s cadence), not a further cadence-length wait.
    await setHidden(page, false);
    await page.clock.runFor(500);

    const requestsAfterResume = await countRequests(page, "/api/repos/gh-rate-limit");
    expect(requestsAfterResume, "becoming visible again should trigger an immediate refresh").toBe(1);
  });
});
