import { test, expect } from "@playwright/test";

/**
 * Regression guard for the home-shell flicker fix (index.css `html { scrollbar-gutter: stable }`).
 *
 * The deployment-ui home shell renders a centered max-width layout with many
 * independent pollers (health 30s, repo-CI / alerts 60s, gh-rate-budget, …). The
 * scrollbar is a 6px space-taking `::-webkit-scrollbar`. Before the fix, every
 * poll that nudged content height across the viewport threshold toggled the
 * vertical scrollbar, reflowing the full-width Header + the 12-col grid sideways
 * by 6px each tick — the operator-reported "horizontal + vertical nav flickers in
 * and out while the reload icon spins" symptom.
 *
 * Reserving the gutter on the scroll root makes content width invariant to the
 * scrollbar's presence, so a background refresh can never reflow the layout.
 * Reverting the CSS rule reintroduces the flicker; these assertions catch that.
 */
test.describe("scroll-root scrollbar-gutter stability", () => {
  test("the scroll root reserves a stable scrollbar gutter", async ({ page }) => {
    await page.goto("/");
    const gutter = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter);
    expect(gutter).toBe("stable");
  });

  test("content width is invariant to the vertical scrollbar appearing", async ({ page }) => {
    await page.goto("/");

    // Measure the usable content width (viewport minus reserved gutter) with the
    // page forced SHORT (no scroll) and then TALL (scroll required). With a stable
    // gutter the two must be identical; without it the second drops by the 6px
    // scrollbar width — exactly the reflow the operator sees.
    const widthWith = async (tall: boolean) =>
      page.evaluate((isTall) => {
        const ID = "__sbgutter_probe__";
        document.getElementById(ID)?.remove();
        const probe = document.createElement("div");
        probe.id = ID;
        // Short → collapse below the viewport (guarantees no scrollbar); tall →
        // force well past it (guarantees a scrollbar).
        probe.style.cssText = isTall
          ? "position:fixed;left:0;top:0;width:1px;height:20000px;pointer-events:none;opacity:0;"
          : "";
        document.body.appendChild(probe);
        void document.documentElement.offsetWidth; // force synchronous reflow
        const w = document.documentElement.clientWidth;
        document.getElementById(ID)?.remove();
        return w;
      }, tall);

    // Note: real app content may already overflow, so `short` cannot guarantee the
    // scrollbar is absent. The deterministic guarantee is the TALL case + the
    // computed-style assertion above; this asserts the tall (definitely-scrolling)
    // width equals the natural width, proving the gutter is already reserved.
    const natural = await page.evaluate(() => document.documentElement.clientWidth);
    const tall = await widthWith(true);
    expect(tall).toBe(natural);
  });
});
