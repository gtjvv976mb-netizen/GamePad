import { expect, test, type Page } from "@playwright/test";

// The motion has to actually play: on a normal device, on one that asks for less motion, and on a phone that
// refuses to autoplay video. The stop button has to stop it all, and the choice has to stick.

const world = (page: Page) => page.locator(".world video.loop");
const playing = (page: Page) => world(page).evaluate((v: HTMLVideoElement) => !v.paused);

test("the world clip plays and the store moves at full motion", async ({ page }) => {
  await page.goto("./?no3d&nointro");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect.poll(() => playing(page)).toBe(true);
  await expect.poll(() => world(page).evaluate((v: HTMLVideoElement) => v.currentTime), { message: "the clip advances" }).toBeGreaterThan(0.3);
});

test("a device that asks for less motion still plays the world, calmly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?no3d&nointro");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "calm");
  await expect.poll(() => playing(page)).toBe(true);
});

test("the stop button stops every clip, and the choice sticks", async ({ page }) => {
  await page.goto("./?no3d&nointro");
  await expect.poll(() => playing(page)).toBe(true);
  const stop = page.getByRole("button", { name: "Stop motion" });
  await stop.click();
  await expect(stop).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect.poll(() => playing(page)).toBe(false);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect.poll(() => playing(page)).toBe(false);

  await page.getByRole("button", { name: "Stop motion" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect.poll(() => playing(page)).toBe(true);
});

test("a phone that blocks autoplay starts the clips on the first tap", async ({ page }) => {
  // what an iPhone in Low Power Mode does: every play() is refused until the visitor touches the page
  await page.addInitScript(() => {
    let allowed = false;
    addEventListener("pointerdown", () => { allowed = true; }, { capture: true });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      return allowed ? play.call(this) : Promise.reject(new DOMException("blocked", "NotAllowedError"));
    };
  });
  await page.goto("./?no3d&nointro");
  await page.waitForTimeout(800);
  expect(await playing(page)).toBe(false);
  await page.locator(".eyebrow").first().click();
  await expect.poll(() => playing(page)).toBe(true);
});

test("the hero turns to the next game by itself when nobody is touching it", async ({ page }) => {
  await page.clock.install();
  await page.goto("./?no3d&nointro");
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("Hollow Crown");
  await page.clock.runFor(10_000);
  await expect(title).not.toHaveText("Hollow Crown");
});

test("the fly-in plays on the first visit, then hands over to the store", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  await page.goto("./?no3d");
  // while the camera flies in, the interface waits
  await expect(page.locator(".world video.intro")).toBeAttached();
  await expect(page.locator(".app")).toHaveClass(/pre/);
  // it lands: the interface arrives and the fly-in leaves
  await expect(page.locator(".app")).toHaveClass(/in/, { timeout: 8_000 });
  await expect(page.locator(".world video.intro")).toHaveCount(0, { timeout: 8_000 });
  await expect.poll(() => playing(page)).toBe(true);
  // the same session does not see it again
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/in/);
  await expect(page.locator(".world video.intro")).toHaveCount(0);
});
