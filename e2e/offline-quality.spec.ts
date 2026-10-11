import { expect, test } from "@playwright/test";

test("focused toolbar controls retain native keyboard activation during play", async ({ page }) => {
  await page.goto("./games/hcr.html");
  await page.getByRole("button", { name: "Start chapter", exact: true }).click();
  await page.locator("#sound").press("Enter");
  await expect(page.locator("#sound")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#sound").press("Space");
  await expect(page.locator("#sound")).toHaveAttribute("aria-pressed", "true");
  await page.locator("summary").press("Enter");
  await expect(page.locator("details")).toHaveAttribute("open", "");
  await page.locator("#pause").press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "paused");
});

for (const slug of ["hcr", "ndp", "ptv"]) test(`${slug}: upgrading an old save preserves unlocked chapters`, async ({ page }) => {
  await page.addInitScript(slug => {
    if (!localStorage.getItem(`gamepad-campaign-v1:${slug}`)) localStorage.setItem(`gamepad-campaign-v1:${slug}`, JSON.stringify({
      version: 1, slug, chapter: 1, unlocked: 3, completed: false, phase: "paused", engine: { version: 1, oldWorld: true },
    }));
  }, slug);
  await page.goto(`./games/${slug}.html`);
  await expect(page.locator("#notice")).toContainText("Campaign unlocks kept");
  await expect(page.locator("#chapter-number")).toContainText("Chapter 2 of");
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "briefing");
  const save = await page.evaluate(slug => JSON.parse(localStorage.getItem(`gamepad-campaign-v1:${slug}`)!), slug);
  expect(save.version).toBe(2); expect(save.unlocked).toBe(3); expect(save.chapter).toBe(1);
  await page.getByRole("button", { name: "Start chapter", exact: true }).click();
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "playing");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.reload();
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "paused");
  await expect(page.locator("#chapter-number")).toContainText("Chapter 2 of");
});

test("adventure movement, modal equipment and controller confirmation share the same real controls", async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    Object.defineProperty(navigator, "getGamepads", { value: () => [{ connected: true, buttons, axes: [0, 0, 0, 0], mapping: "standard", id: "Quality test pad" }] });
    (window as unknown as { qualityPad: typeof buttons }).qualityPad = buttons;
  });
  await page.goto("./games/hcr.html");
  await page.getByRole("button", { name: "Start chapter", exact: true }).click();
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("gamepad-campaign-v1:hcr")!));
  const first = await saved();
  await page.keyboard.down("ArrowRight"); await page.waitForTimeout(250); await page.keyboard.up("ArrowRight");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect((await saved()).engine.data.player.x).toBeGreaterThan(first.engine.data.player.x + 20);
  await page.getByRole("button", { name: "Resume chapter", exact: true }).click();
  await page.keyboard.press("x");
  await expect(page.getByRole("dialog", { name: "Game decisions", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to the world", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const journal = await saved();
  await page.getByRole("button", { name: "Resume chapter", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Game decisions", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1700);
  const frozen = await saved();
  expect(frozen.engine.data.time).toBe(journal.engine.data.time);
  expect(frozen.engine.data.player).toEqual(journal.engine.data.player);
  await page.evaluate(() => { (window as unknown as { qualityPad: { pressed: boolean }[] }).qualityPad[0].pressed = true; });
  await expect(page.locator("#decisions")).toBeHidden();
  await page.evaluate(() => { (window as unknown as { qualityPad: { pressed: boolean }[] }).qualityPad[0].pressed = false; });
  await page.keyboard.down("ArrowDown"); await page.waitForTimeout(250); await page.keyboard.up("ArrowDown");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect((await saved()).engine.data.player.y).toBeGreaterThan(frozen.engine.data.player.y);
});

test("offline music unlocks with play, can be muted and stops scheduling while paused", async ({ page }) => {
  await page.addInitScript(() => {
    const record = { notes: 0, resumes: 0, volume: .135 };
    class Audio {
      state = "suspended"; currentTime = 0; destination = {};
      resume() { this.state = "running"; record.resumes++; return Promise.resolve(); }
      close() { this.state = "closed"; return Promise.resolve(); }
      createGain() { return { gain: { value: 0, setTargetAtTime(v: number) { record.volume = v; }, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
      createOscillator() { return { type: "sine", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() { record.notes++; }, stop() {} }; }
    }
    Object.defineProperty(window, "AudioContext", { value: Audio });
    (window as unknown as { qualityAudio: typeof record }).qualityAudio = record;
  });
  const audio = () => page.evaluate(() => (window as unknown as { qualityAudio: { notes: number; resumes: number; volume: number } }).qualityAudio);
  await page.goto("./games/hcr.html");
  expect((await audio()).notes).toBe(0);
  await page.getByRole("button", { name: "Start chapter", exact: true }).click();
  await expect.poll(async () => (await audio()).notes).toBeGreaterThan(0);
  expect((await audio()).resumes).toBe(1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = (await audio()).notes;
  await page.waitForTimeout(650); expect((await audio()).notes).toBe(paused);
  await page.getByRole("button", { name: "Sound on", exact: true }).click();
  await expect(page.locator("#sound")).toHaveAttribute("aria-pressed", "false"); expect((await audio()).volume).toBe(0);
  await page.getByRole("button", { name: "Resume chapter", exact: true }).click();
  await page.waitForTimeout(650); expect((await audio()).notes).toBe(paused);
  await page.getByRole("button", { name: "Sound off", exact: true }).click();
  await expect.poll(async () => (await audio()).notes).toBeGreaterThan(paused);
});

test("choosing a tactical skill returns arrows to the board cursor", async ({ page }) => {
  await page.goto("./games/sft.html");
  await page.getByRole("button", { name: "Start chapter", exact: true }).click();
  await page.locator('[data-choice="deploy"]').click();
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("gamepad-campaign-v1:sft")!).engine.data.cursor);
  await page.locator('[data-choice="skill:move"]').click();
  await expect(page.locator("canvas")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gamepad-campaign-v1:sft")!));
  expect(saved.engine.data.cursor.x).toBe(initial.x + 1);
  expect(saved.engine.data.ability).toBe("move");
});
