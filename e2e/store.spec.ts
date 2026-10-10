import { expect, test, type Page } from "@playwright/test";

const fits = async (page: Page) => {
  const [w, h] = await page.evaluate(() => [
    document.documentElement.scrollWidth - innerWidth,
    document.documentElement.scrollHeight - innerHeight,
  ]);
  expect(w, "no sideways scroll").toBeLessThanOrEqual(0);
  expect(h, "no page scroll").toBeLessThanOrEqual(0);
};

const guest = async (page: Page) => {
  await page.getByRole("button", { name: /^Connect/ }).first().click();
  await page.getByRole("button", { name: /Look around without a wallet/ }).click();
  await expect(page.getByText("Preview", { exact: true })).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto("./?no3d");
});

test("every tab fits on one screen", async ({ page }) => {
  for (const tab of ["Store", "Market", "Library", "Studio", "Profile"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    await fits(page);
  }
});

test("buy a game, sell it on the market, and see it in activity", async ({ page }) => {
  await guest(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hollow Crown");
  await page.getByRole("button", { name: /Buy · 0\.0125 ETH/ }).click();
  await expect(page.getByText("Hollow Crown is in your library")).toBeVisible();
  await expect(page.getByText("In your library", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Library" }).click();
  await page.getByRole("button", { name: /Sell this copy/ }).click();
  await page.getByRole("textbox").fill("0.01");
  await expect(page.getByText(/Gravewright gets 0\.0008 ETH \(8%\)/)).toBeVisible();
  await page.getByRole("button", { name: /List it/ }).click();
  await expect(page.getByText("Hollow Crown is listed on the market")).toBeVisible();

  await page.getByRole("tab", { name: "Market" }).click();
  await expect(page.getByText("Your listing")).toBeVisible();

  await page.getByRole("tab", { name: "Profile" }).click();
  await expect(page.getByText(/Listed/)).toBeVisible();
  await expect(page.getByText(/Bought/)).toBeVisible();
});

test("keyboard drives the shelf like a controller", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hollow Crown");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Orbital Salvage");
  await page.keyboard.press("e");
  await expect(page.getByRole("tab", { name: "Market" })).toHaveAttribute("aria-selected", "true");
});

test("publish a game from the studio", async ({ page }) => {
  await guest(page);
  await page.getByRole("tab", { name: "Studio" }).click();
  await page.getByLabel("Title").fill("Comet Garden");
  await page.getByRole("button", { name: /Publish$/ }).click();
  await expect(page.getByText("Comet Garden is on the shelf")).toBeVisible();
});

test("buying asks for a wallet first", async ({ page }) => {
  await page.getByRole("button", { name: /Buy ·/ }).click();
  await expect(page.getByRole("dialog", { name: "Connect" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("no em or en dash anywhere, even for a free game or a zero price", async ({ page }) => {
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gridlock Arena");
  expect(await page.locator("body").innerText()).not.toMatch(/[—–]/);
  await page.getByRole("tab", { name: "Studio" }).click();
  await page.getByLabel("Price (ETH)").fill("0");
  expect(await page.locator("body").innerText()).not.toMatch(/[—–]/);
});
