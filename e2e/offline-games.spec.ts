import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { CAMPAIGNS } from "../src/games/campaigns";
import { createStrategyEngine } from "../src/games/engines/strategy";

for (const campaign of CAMPAIGNS) {
  test(`${campaign.slug}: downloaded campaign runs and resumes with the network disabled`, async ({ page, context }) => {
    const errors: string[] = [], requests: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("request", r => { if (!r.url().startsWith("file:")) requests.push(r.url()); });
    await context.setOffline(true);
    await page.goto(pathToFileURL(resolve(`dist/games/${campaign.slug}.html`)).href);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(campaign.title);
    await expect(page.locator("#chapter-number")).toHaveText(`Chapter 1 of ${campaign.chapters.length}`);
    await page.getByRole("button", { name: "Start chapter", exact: true }).click();
    await expect(page.locator("#game")).toHaveAttribute("data-phase", "playing");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.locator("#game")).toHaveAttribute("data-phase", "paused");
    const saved = await page.evaluate(slug => JSON.parse(localStorage.getItem(`gamepad-campaign-v1:${slug}`)!), campaign.slug);
    expect(saved.engine).toBeTruthy();
    await page.reload();
    await expect(page.locator("#game")).toHaveAttribute("data-phase", "paused");
    expect(await page.evaluate(slug => JSON.parse(localStorage.getItem(`gamepad-campaign-v1:${slug}`)!).engine, campaign.slug)).toEqual(saved.engine);
    await page.getByRole("button", { name: "Resume chapter", exact: true }).click();
    await expect(page.locator("#game")).toHaveAttribute("data-phase", "playing");
    expect(await page.locator("canvas").evaluate(c => {
      const pixels = (c as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 960, 540).data;
      const colors = new Set<string>();
      for (let i = 0; i < pixels.length; i += 256) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return colors.size;
    })).toBeGreaterThan(10);
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("portable saves export, restore exact progress, and reject incompatible files", async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve("dist/games/hcr.html")).href);
  await page.getByRole("button", { name: "Start chapter", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByText("Controls and save files", { exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export save", exact: true }).click();
  const download = await downloadEvent;
  const file = await download.path();
  const exported = JSON.parse(await readFile(file!, "utf8"));
  expect(download.suggestedFilename()).toBe("hcr-campaign-save.json");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Restart campaign", exact: true }).click();
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "briefing");
  await page.locator("#import").setInputFiles(file!);
  await expect(page.locator("#notice")).toHaveText("Save imported. Resume when ready.");
  const current = () => page.evaluate(() => JSON.parse(localStorage.getItem("gamepad-campaign-v1:hcr")!));
  expect((await current()).engine).toEqual(exported.engine);
  await page.locator("#import").setInputFiles({ name: "wrong.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...exported, slug: "osv" })) });
  await expect(page.locator("#notice")).toContainText("incompatible");
  expect((await current()).engine).toEqual(exported.engine);
  await page.locator("#import").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...exported, engine: { broken: true } })) });
  await expect(page.locator("#notice")).not.toHaveText("Save imported. Resume when ready.");
  expect((await current()).engine).toEqual(exported.engine);
});

test("touch and gamepad controls operate without a wallet, and pause stops the simulation", async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    Object.defineProperty(navigator, "getGamepads", { value: () => [{ connected: true, buttons, axes: [0, 0], mapping: "standard", id: "Test controller" }] });
    (window as unknown as { padButtons: typeof buttons }).padButtons = buttons;
  });
  await page.goto("./games/hcr.html");
  await page.evaluate(() => { (window as unknown as { padButtons: { pressed: boolean }[] }).padButtons[0].pressed = true; });
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "playing");
  await page.evaluate(() => { (window as unknown as { padButtons: { pressed: boolean }[] }).padButtons[0].pressed = false; });
  const move = page.getByRole("button", { name: "Move right", exact: true });
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("gamepad-campaign-v1:hcr")!).engine.x);
  await move.scrollIntoViewIfNeeded();
  const bounds = await move.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.up();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const before = await page.evaluate(() => localStorage.getItem("gamepad-campaign-v1:hcr"));
  expect(JSON.parse(before!).engine.x).toBeGreaterThan(initial);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => localStorage.getItem("gamepad-campaign-v1:hcr"))).toEqual(before);
  await page.getByRole("button", { name: "Resume chapter", exact: true }).click();
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "playing");
});

test("store demos and library full campaigns launch; offline download contains its code", async ({ page }) => {
  await page.goto("./?no3d&nointro");
  await page.getByRole("button", { name: "Try first chapter", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Hollow Crown game"]');
  await expect(frame.locator("#chapter-number")).toHaveText("Chapter 1 of 1");
  await frame.getByRole("button", { name: "Start chapter", exact: true }).click();
  await frame.locator("canvas").press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Store", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Back to GamePad", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Hollow Crown campaign", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Connect/ }).first().click();
  await page.getByRole("button", { name: /Look around without a wallet/ }).click();
  await page.getByRole("button", { name: /Buy · 0\.25 SOL/ }).click();
  await expect(page.getByText("Hollow Crown is in your library")).toBeVisible();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download offline", exact: true }).click();
  const download = await downloadEvent;
  const html = await readFile((await download.path())!, "utf8");
  expect(html).toContain('data-game="hcr"');
  expect(html).toContain("connect-src 'none'");
  expect(html).not.toMatch(/<script[^>]+src=/);
  await page.getByRole("button", { name: "Play campaign", exact: true }).click();
  await expect(frame.locator("#chapter-number")).toHaveText("Chapter 1 of 6");
  await frame.getByRole("button", { name: "Start chapter", exact: true }).click();
  await expect(frame.locator("#game")).toHaveAttribute("data-phase", "playing");
  await page.screenshot({ path: `verification/gamepad-campaign-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Back to GamePad", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play campaign", exact: true })).toBeFocused();
});

test("strategy decisions remain readable on phones and the board fits short windows", async ({ page }) => {
  await page.goto("./games/ptv.html");
  await page.getByRole("button", { name: "Start chapter", exact: true }).click();
  await expect(page.locator("#selection")).toContainText("Moon herb");
  await page.getByRole("button", { name: "Move right", exact: true }).click();
  await expect(page.locator("#selection")).toContainText("Ruby berry");
  const selection = page.locator("#selection");
  expect(await selection.evaluate(e => Number.parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(12);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(async () => {
    const board = await page.locator("canvas").boundingBox();
    const action = await page.locator('[data-control="action"]').boundingBox();
    return !!board && !!action && board.y >= 0 && board.y + board.height <= 720 && action.y + action.height <= 720;
  }).toBe(true);
});

test("games remain playable and portable when automatic browser storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage disabled", "SecurityError"); } });
  });
  await page.goto("./games/hcr.html");
  await page.getByRole("button", { name: "Start chapter", exact: true }).click();
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "playing");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByText("Controls and save files", { exact: true }).click();
  await expect(page.locator("#storage")).toContainText("Browser storage is unavailable");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export save", exact: true }).click();
  const download = await downloadEvent;
  await page.locator("#import").setInputFiles((await download.path())!);
  await expect(page.locator("#notice")).toHaveText("Save imported. Resume when ready.");
  await page.getByRole("button", { name: "Resume chapter", exact: true }).click();
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "playing");
});

test("a complete offline campaign unlocks chapters, survives reload and reaches its ending", async ({ page, context }) => {
  const campaign = CAMPAIGNS.find(c => c.slug === "lmc")!;
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve("dist/games/lmc.html")).href);
  for (let chapterIndex = 0; chapterIndex < campaign.chapters.length; chapterIndex++) {
    await expect(page.locator("#chapter-number")).toHaveText(`Chapter ${chapterIndex + 1} of 6`);
    await page.getByRole("button", { name: "Start chapter", exact: true }).click();
    // Find a solution using only the same mirror taps and power pulse available to the player.
    const mirrors = campaign.chapters[chapterIndex].config.mirrors as { x: number; y: number; fixed?: boolean }[];
    const mutable = mirrors.map((m, i) => m.fixed ? -1 : i).filter(i => i >= 0);
    let turns: number[] | undefined;
    for (let mask = 0; mask < 2 ** mutable.length; mask++) {
      const engine = createStrategyEngine({ campaign, chapterIndex });
      const selected = mutable.filter((_, bit) => (mask & 2 ** bit) !== 0);
      for (const i of selected) engine.update(1 / 60, { held: new Set(), pressed: new Set(), pointer: { x: 35 + (mirrors[i].x + .5) * 64, y: 101 + (mirrors[i].y + .5) * 64, down: false, pressed: true } });
      engine.update(1 / 60, { held: new Set(), pressed: new Set(["alt"]) });
      if (engine.view().status === "won") { turns = selected; break; }
    }
    expect(turns, `Chapter ${chapterIndex + 1} has a real mirror solution`).toBeDefined();
    const board = page.locator("canvas");
    for (const i of turns!) {
      const bounds = await board.boundingBox();
      await board.click({ position: { x: (35 + (mirrors[i].x + .5) * 64) / 960 * bounds!.width, y: (101 + (mirrors[i].y + .5) * 64) / 540 * bounds!.height } });
      await page.waitForTimeout(40);
    }
    await board.press("x");
    await expect(page.locator("#game")).toHaveAttribute("data-phase", "victory");
    if (chapterIndex === 2) {
      await page.reload();
      await expect(page.locator("#game")).toHaveAttribute("data-phase", "victory");
      await expect(page.locator("#chapter-number")).toHaveText("Chapter 3 of 6");
    }
    await page.getByRole("button", { name: chapterIndex < 5 ? "Next chapter" : "See ending", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Campaign complete", exact: true })).toBeVisible();
  await expect(page.getByText(campaign.ending, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "ending");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("gamepad-campaign-v1:lmc")!).completed)).toBe(true);
});
