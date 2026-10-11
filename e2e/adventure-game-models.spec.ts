import { expect, test } from "@playwright/test";
import { ADVENTURE_CAMPAIGNS } from "../src/games/campaigns/adventure";
import { createAdventureEngine } from "../src/games/engines/adventure";
import type { Campaign, GameButton, GameEngine } from "../src/games/types";

test.skip(({ isMobile }) => isMobile, "pure model coverage runs once in Node");

type Snapshot = {
  x: number; y: number; turn: number; health: number; reserve: number; guard: number;
  picked: number[]; planted: { id: number; turn: number }[]; harvested: number[];
  enemies: { id: number; hp: number }[]; crafted: boolean; runeProgress: number; beacons: number[];
};
const snapshot = (engine: GameEngine) => engine.save() as unknown as Snapshot;
const press = (engine: GameEngine, button: GameButton) => engine.update(0.17, { held: new Set([button]), pressed: new Set([button]) });
const directions: [GameButton, number, number][] = [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]];

// This solver reads the authored room and observations. It never changes a save or injects a victory.
function explorer(campaign: Campaign, chapter: number, engine: GameEngine) {
  const config = campaign.chapters[chapter].config;
  const map = (config.map as string[]).join("");
  const ids = (char: string) => Array.from(map, (tile, id) => tile === char ? id : -1).filter(id => id >= 0);
  const position = () => snapshot(engine).y * 16 + snapshot(engine).x;
  const path = (destination: number) => {
    const s = snapshot(engine), start = position();
    const locked = campaign.slug === "hcr" ? ids("K").some(id => !s.picked.includes(id))
      : campaign.slug === "eov" ? s.runeProgress < (config.sequence as number[]).length : campaign.slug === "ibl" ? !s.crafted : false;
    const queue = [start], previous = new Map<number, { id: number; button: GameButton }>();
    previous.set(start, { id: start, button: "alt" });
    for (let cursor = 0; cursor < queue.length && !previous.has(destination); cursor++) {
      const id = queue[cursor];
      for (const [button, dx, dy] of directions) {
        const x = id % 16 + dx, y = Math.floor(id / 16) + dy, next = y * 16 + x;
        if (x < 0 || y < 0 || x >= 16 || y >= 9 || map[next] === "#" || (map[next] === "D" && locked) || s.enemies.some(enemy => enemy.id === next && enemy.hp > 0) || previous.has(next)) continue;
        previous.set(next, { id, button }); queue.push(next);
      }
    }
    if (!previous.has(destination)) return undefined;
    const result: { button: GameButton; id: number }[] = [];
    let id = destination;
    while (id !== start) { const step = previous.get(id)!; result.unshift({ button: step.button, id }); id = step.id; }
    return result;
  };
  const visit = (id: number, heal = true) => {
    const route = path(id);
    expect(route, `${campaign.slug} chapter ${chapter + 1}: reachable ${id}`).toBeDefined();
    for (const step of route!) {
      let s = snapshot(engine);
      if (heal && ((campaign.slug === "ibl" && s.reserve < 42) || (campaign.slug === "hcr" && s.health <= 7))) {
        const remedy = ids("H").find(item => !s.picked.includes(item) && path(item));
        if (remedy !== undefined) { visit(remedy, false); press(engine, "action"); visit(id, false); return; }
      }
      s = snapshot(engine);
      if (campaign.slug === "hcr" && s.guard === 0 && s.reserve > 0 && s.enemies.some(enemy => enemy.hp > 0 && Math.abs(enemy.id % 16 - step.id % 16) + Math.abs(Math.floor(enemy.id / 16) - Math.floor(step.id / 16)) === 1)) press(engine, "alt");
      if (campaign.slug === "sws" && map[step.id] === "R") {
        for (let waits = 0; Math.floor(snapshot(engine).turn / 3) % 2 === 0 && waits < 3; waits++) press(engine, "alt");
      }
      press(engine, step.button);
      expect(engine.view().status, `${campaign.slug}: survived navigation`).not.toBe("lost");
      expect(position()).toBe(step.id);
    }
  };
  const gather = (char: string, limit = ids(char).length) => {
    for (let count = 0; count < limit; count++) {
      const choices = ids(char).filter(id => !snapshot(engine).picked.includes(id)).map(id => ({ id, length: path(id)?.length ?? Infinity })).sort((a, b) => a.length - b.length);
      expect(choices.length).toBeGreaterThan(0);
      visit(choices[0].id); press(engine, "action");
      expect(snapshot(engine).picked).toContain(choices[0].id);
    }
  };
  return { map, ids, path, visit, gather, position };
}

for (const campaign of ADVENTURE_CAMPAIGNS) {
  for (let chapter = 0; chapter < campaign.chapters.length; chapter++) {
    test(`${campaign.title}: play all objectives in chapter ${chapter + 1}`, () => {
      const engine = createAdventureEngine({ campaign, chapterIndex: chapter });
      const world = explorer(campaign, chapter, engine);
      const config = campaign.chapters[chapter].config;
      if (campaign.slug === "hcr") {
        world.gather("K");
        for (const target of snapshot(engine).enemies) {
          const adjacent = directions.map(([, dx, dy]) => target.id + dy * 16 + dx)
            .filter(id => world.map[id] !== "#" && world.path(id))
            .sort((a, b) => world.path(a)!.length - world.path(b)!.length)[0];
          expect(adjacent).toBeDefined(); world.visit(adjacent);
          for (let strikes = 0; snapshot(engine).enemies.find(enemy => enemy.id === target.id)!.hp > 0 && strikes < 10; strikes++) {
            const s = snapshot(engine);
            if (s.guard === 0 && s.reserve > 0 && s.enemies.find(enemy => enemy.id === target.id)!.hp > 2) press(engine, "alt");
            press(engine, "action");
            expect(engine.view().status).not.toBe("lost");
          }
          expect(snapshot(engine).enemies.find(enemy => enemy.id === target.id)!.hp).toBe(0);
        }
      } else if (campaign.slug === "eov") {
        world.gather("F"); press(engine, "alt");
        expect(engine.view().message).toContain("Memory:");
        for (const rune of config.sequence as number[]) { world.visit(world.ids(String(rune))[0]); press(engine, "action"); }
        expect(snapshot(engine).runeProgress).toBe((config.sequence as number[]).length);
      } else if (campaign.slug === "ibl") {
        world.gather("W", Number(config.wood) + Number(config.bloom)); world.gather("O", Number(config.ore));
        const beds = world.ids("P").slice(0, Number(config.bloom));
        for (const id of beds) { world.visit(id); press(engine, "action"); }
        for (const id of beds) {
          world.visit(id);
          const planted = snapshot(engine).planted.find(bed => bed.id === id)!;
          while (snapshot(engine).turn - planted.turn < 3) press(engine, "alt");
          press(engine, "action"); expect(snapshot(engine).harvested).toContain(id);
        }
        press(engine, "alt"); expect(snapshot(engine).crafted).toBe(true);
      } else {
        world.gather("G");
        for (const id of world.ids("B")) { world.visit(id); press(engine, "action"); }
        expect(snapshot(engine).beacons.length).toBe(world.ids("B").length);
      }
      expect(engine.view().status).toBe("playing");
      const saved = JSON.parse(JSON.stringify(engine.save()));
      const resumed = createAdventureEngine({ campaign, chapterIndex: chapter, restored: saved });
      expect(resumed.save()).toEqual(saved);
      const resumedWorld = explorer(campaign, chapter, resumed);
      resumedWorld.visit(resumedWorld.ids("E")[0]);
      expect(resumed.view().status).toBe("won");
      expect(resumed.view().message).toBe(campaign.chapters[chapter].after);
      const victory = resumed.save(); press(resumed, "alt"); press(resumed, "action");
      expect(resumed.save()).toEqual(victory);
      expect(createAdventureEngine({ campaign, chapterIndex: chapter, restored: victory }).view().status).toBe("won");
    });
  }
}

for (const campaign of ADVENTURE_CAMPAIGNS) {
  test(`${campaign.title}: exact mid-room saves, blocked walls and malformed save rejection`, () => {
    const engine = createAdventureEngine({ campaign, chapterIndex: 0 });
    const before = snapshot(engine); press(engine, "left");
    expect(snapshot(engine)).toMatchObject({ x: before.x, y: before.y, turn: before.turn });
    press(engine, "right"); press(engine, "down"); press(engine, "alt");
    engine.update(0.03, { held: new Set(), pressed: new Set() });
    const saved = engine.save();
    const restored = createAdventureEngine({ campaign, chapterIndex: 0, restored: saved });
    expect(restored.save()).toEqual(saved);
    for (const button of ["down", "right", "action", "alt", "up", "left"] as GameButton[]) { press(engine, button); press(restored, button); expect(restored.save()).toEqual(engine.save()); }
    const mutations: Record<string, unknown>[] = [
      { ...saved, chapter: 99 }, { ...saved, x: -1 }, { ...saved, x: 0, y: 0 }, { ...saved, health: 999 },
      { ...saved, movementClock: NaN }, { ...saved, picked: [1, 1] }, { ...saved, injected: true },
      { ...saved, planted: [{ id: 17, turn: 0 }] }, { ...saved, status: "won" }, { ...saved, runeProgress: 99 },
      { ...saved, enemies: [{ id: 0, hp: 1 }] }, { ...saved, reserve: -1 }, { ...saved, message: 5 },
    ];
    for (const malformed of mutations) expect(() => createAdventureEngine({ campaign, chapterIndex: 0, restored: malformed })).toThrow(/Invalid adventure save/);
    saved.x = 14; expect(snapshot(restored).x).not.toBe(14); // saved objects never alias engine state
  });
}

test("Hollow Crown: sentinels counterattack, brace absorbs hits, and a lost battle stops input", () => {
  const campaign = ADVENTURE_CAMPAIGNS.find(game => game.slug === "hcr")!;
  const engine = createAdventureEngine({ campaign, chapterIndex: 0 });
  const world = explorer(campaign, 0, engine);
  world.visit(world.ids("M")[0] - 1);
  const health = snapshot(engine).health;
  press(engine, "alt"); press(engine, "action");
  expect(snapshot(engine).health).toBe(health);
  expect(snapshot(engine).enemies.find(enemy => enemy.id === world.ids("M")[0])!.hp).toBe(0);
  world.visit(world.ids("M")[1] - 1);
  for (let attempts = 0; attempts < 30 && engine.view().status === "playing"; attempts++) press(engine, "alt");
  expect(engine.view().status).toBe("lost");
  const lost = engine.save(); press(engine, "action"); expect(engine.save()).toEqual(lost);
  expect(createAdventureEngine({ campaign, chapterIndex: 0, restored: lost }).view().status).toBe("lost");
});

test("Echoes of Vael: unread runes refuse input; wrong memories reset progress and deplete resolve", () => {
  const campaign = ADVENTURE_CAMPAIGNS.find(game => game.slug === "eov")!;
  const engine = createAdventureEngine({ campaign, chapterIndex: 0 });
  const world = explorer(campaign, 0, engine);
  world.visit(world.ids("1")[0]); press(engine, "action");
  expect(snapshot(engine).runeProgress).toBe(0); expect(snapshot(engine).health).toBe(6);
  world.gather("F"); world.visit(world.ids("1")[0]); press(engine, "action");
  expect(snapshot(engine).runeProgress).toBe(1);
  world.visit(world.ids("4")[0]); press(engine, "action");
  expect(snapshot(engine).runeProgress).toBe(0); expect(snapshot(engine).health).toBe(5);
  for (let mistakes = 0; mistakes < 5; mistakes++) press(engine, "action");
  expect(engine.view().status).toBe("lost");
});

test("Ironbloom: recipes consume resources, flowers need three turns, and exhaustion is a real failure", () => {
  const campaign = ADVENTURE_CAMPAIGNS.find(game => game.slug === "ibl")!;
  const engine = createAdventureEngine({ campaign, chapterIndex: 0 });
  const world = explorer(campaign, 0, engine);
  press(engine, "alt"); expect(snapshot(engine).crafted).toBe(false);
  world.gather("W", 1); world.visit(world.ids("P")[0]); press(engine, "action");
  press(engine, "action"); expect(snapshot(engine).harvested).toEqual([]);
  while (engine.view().status === "playing") press(engine, "alt");
  expect(engine.view().status).toBe("lost"); expect(snapshot(engine).reserve).toBe(0);
});

test("Saltwind Sagas: low tide blocks shallows, storm damages hull and salvage can repair it", () => {
  const campaign = ADVENTURE_CAMPAIGNS.find(game => game.slug === "sws")!;
  const engine = createAdventureEngine({ campaign, chapterIndex: 0 });
  const world = explorer(campaign, 0, engine);
  world.gather("G", 1);
  const shallows = world.ids("R")[0]; world.visit(shallows - 1);
  while (Math.floor(snapshot(engine).turn / 3) % 2 !== 0) press(engine, "alt");
  const position = world.position(), turn = snapshot(engine).turn;
  press(engine, "right"); expect(world.position()).toBe(position); expect(snapshot(engine).turn).toBe(turn);
  while (Math.floor(snapshot(engine).turn / 3) % 2 === 0) press(engine, "alt");
  press(engine, "right"); expect(world.position()).toBe(shallows);
  const storm = world.ids("X")[0]; world.visit(storm);
  expect(snapshot(engine).health).toBe(9); press(engine, "action"); expect(snapshot(engine).health).toBe(10);
  for (let crossing = 0; crossing < 10; crossing++) { press(engine, "left"); press(engine, "right"); }
  expect(engine.view().status).toBe("lost");
});

test("adventure pointer controls move on the map and act under the hero", () => {
  const campaign = ADVENTURE_CAMPAIGNS.find(game => game.slug === "eov")!;
  const engine = createAdventureEngine({ campaign, chapterIndex: 0 });
  engine.update(0.17, { held: new Set(), pressed: new Set(), pointer: { x: 24 + 2 * 46 + 23, y: 68 + 46 + 23, down: true, pressed: true } });
  expect(snapshot(engine)).toMatchObject({ x: 2, y: 1, turn: 1 });
  const world = explorer(campaign, 0, engine); world.visit(world.ids("F")[0]);
  const s = snapshot(engine);
  engine.update(0.17, { held: new Set(), pressed: new Set(), pointer: { x: 24 + s.x * 46 + 23, y: 68 + s.y * 46 + 23, down: true, pressed: true } });
  expect(snapshot(engine).picked).toContain(world.ids("F")[0]);
});

test("Saltwind Sagas: wasting finite repair supplies triggers a useful failure instead of stranding the campaign", () => {
  const campaign = ADVENTURE_CAMPAIGNS.find(game => game.slug === "sws")!;
  const engine = createAdventureEngine({ campaign, chapterIndex: 0 });
  const world = explorer(campaign, 0, engine);
  world.gather("G"); world.visit(world.ids("X")[0]);
  press(engine, "action");
  for (let repair = 0; repair < 2; repair++) { press(engine, "left"); press(engine, "right"); press(engine, "action"); }
  expect(snapshot(engine).health).toBe(10);
  expect(engine.view().status).toBe("lost");
  expect(engine.view().message).toContain("reserve one supply");
  expect(createAdventureEngine({ campaign, chapterIndex: 0, restored: engine.save() }).view().status).toBe("lost");
});
