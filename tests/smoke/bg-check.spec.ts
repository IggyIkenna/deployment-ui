import { test } from "@playwright/test";
test("debug body bg", async ({ page }) => {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  const result = await page.evaluate(() => {
    const body = document.body;
    const bodyBg = window.getComputedStyle(body).backgroundColor;
    const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
    const outerDiv = document.querySelector(".min-h-screen");
    const outerDivBg = outerDiv ? window.getComputedStyle(outerDiv).backgroundColor : "not found";
    const colorVar = getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary");
    return { bodyBg, htmlBg, outerDivBg, colorVar };
  });
  console.log("DEBUG:", JSON.stringify(result, null, 2));
});
