import { expect, test } from "@playwright/test";

// Smoke test for the WebGL layer: it mounts a canvas and throws no errors.
test("3D stage renders without errors", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator(".stage canvas")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});
