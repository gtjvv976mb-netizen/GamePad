import { expect, test } from "@playwright/test";
import { ADVENTURE_CAMPAIGNS } from "../src/games/campaigns/adventure";
import { createAdventureEngine } from "../src/games/engines/adventure";
import type { Campaign, GameButton, GameEngine } from "../src/games/types";
test.skip(({ isMobile }) => isMobile, "pure world simulations run once in Node");
type World = { player: { x: number; y: number; vx: number; vy: number; hp: number; stamina: number }; time: number; picked: number[]; planted: { id: number; birth: number }[]; wood: number; ore: number; blooms: number; beacons: number[]; enemies: { id: number; x: number; y: number; hp: number; max: number; phase: number }[]; crafted: boolean; panel: string; memory: number; puzzle: number[]; status: string; progress: { coins: number; rewards: string[]; blade: number; heart: number; tool: number; mast: number } };
const state = (engine: GameEngine) => engine.save().data as World;
const press = (engine: GameEngine, button: GameButton) => engine.update(1 / 60, { held: new Set([button]), pressed: new Set([button]) });
const tick = (engine: GameEngine, held: GameButton[] = []) => { if (state(engine).panel) engine.choose!("close"); engine.update(1 / 60, { held: new Set(held), pressed: new Set() }); };
const center = (id: number) => ({ x: (id % 16 + .5) * 92, y: (Math.floor(id / 16) + .5) * 92 });
function explorer(game: Campaign, chapter: number, engine: GameEngine) {
  const config = game.chapters[chapter].config, map = (config.map as string[]).join("");
  const ids = (chars: string) => [...map].map((tile, id) => chars.includes(tile) ? id : -1).filter(id => id >= 0);
  const posId = () => Math.floor(state(engine).player.y / 92) * 16 + Math.floor(state(engine).player.x / 92);
  const path = (goal: number) => {
    const start = posId(), queue = [start], prior = new Map<number, number>([[start, start]]);
    for (let i = 0; i < queue.length && !prior.has(goal); i++) for (const d of [1, -1, 16, -16]) {
      const next = queue[i] + d;
      if (next < 0 || next >= 144 || map[next] === "#" || map[next] === "D" || prior.has(next)) continue;
      prior.set(next, queue[i]); queue.push(next);
    }
    expect(prior.has(goal), `${game.slug} chapter${chapter + 1}: route to ${goal}`).toBe(true);
    const route: number[] = []; let next = goal; while (next !== start) { route.unshift(next); next = prior.get(next)!; }
    return [...route, goal];
  };
  const visit = (id: number, fire = true) => {
    for (const waypoint of path(id)) {
      const target = center(waypoint);
      for (let i = 0; i < 1500; i++) {
        const p = state(engine).player, dx = target.x - p.x, dy = target.y - p.y;
        if (Math.hypot(dx, dy) < 13 && (game.slug !== "sws" || Math.hypot(p.vx, p.vy) < 40)) break;
        const held: GameButton[] = fire ? ["action"] : [];
        const px = game.slug === "sws" ? dx * 4 - p.vx : dx, py = game.slug === "sws" ? dy * 4 - p.vy : dy;
        if (px > 5) held.push("right"); if (px < -5) held.push("left"); if (py > 5) held.push("down"); if (py < -5) held.push("up");
        tick(engine, held);
        expect(engine.view().status, `${game.slug} navigation`).not.toBe("lost");
      }
      if (engine.view().status === "won") return;
      expect(Math.hypot(state(engine).player.x - target.x, state(engine).player.y - target.y), `${game.slug} arrived ${waypoint}`).toBeLessThan(30);
    }
  };
  const work = (frames = 80) => { for (let i = 0; i < frames && engine.view().status === "playing"; i++) tick(engine, ["action"]); };
  const gather = (char: string) => { for (const id of ids(char)) if (!state(engine).picked.includes(id)) { visit(id); work(); expect(state(engine).picked).toContain(id); } };
  return { ids, visit, work, gather };
}
for (const game of ADVENTURE_CAMPAIGNS) test(`${game.title}: all six worlds completed through actual controls with persistent equipment`, () => {
  let progression: Record<string, unknown> | undefined;
  for (let chapter = 0; chapter < game.chapters.length; chapter++) {
    const engine = createAdventureEngine({ campaign: game, chapterIndex: chapter, progression });
    const world = explorer(game, chapter, engine), config = game.chapters[chapter].config;
    if (game.slug === "hcr") {
      world.gather("K");
      for (let target = 0; target < state(engine).enemies.length; target++) {
        for (let attempts = 0; state(engine).enemies[target].hp > 0 && attempts < 20; attempts++) {
          const enemy = state(engine).enemies[target];
          const id = Math.floor(enemy.y / 92) * 16 + Math.floor(enemy.x / 92);
          world.visit(id); world.work(150);
          if (state(engine).player.hp < 55) { const heal = world.ids("H").find(id => !state(engine).picked.includes(id)); if (heal !== undefined) { world.visit(heal); world.work(); } }
        }
        expect(state(engine).enemies[target].hp).toBe(0);
      }
    } else if (game.slug === "eov") {
      world.gather("F"); world.visit(world.ids("1")[0], false);
      engine.choose!("close"); for (let i = 0; i < 30; i++) tick(engine); press(engine, "action");
      expect(state(engine).panel).toBe("puzzle");
      if (![1, 2].includes(chapter)) for (const rune of config.sequence as number[]) engine.choose!(`rune:${rune}`);
      if ([1, 2, 5].includes(chapter)) {
        const target = chapter === 5 ? [1, 1, 1, 1] : Array.from({ length: 4 }, (_, i) => [1, 3, 2, 0][(i + chapter) % 4]);
        for (let i = 0; i < 4; i++) while (state(engine).puzzle[i] !== target[i]) engine.choose!(`rotate:${i}`);
      }
      engine.choose!("close");
    } else if (game.slug === "ibl") {
      world.gather("W"); world.gather("O");
      for (const id of world.ids("P")) { world.visit(id); world.work(35); }
      for (let i = 0; i < 510; i++) tick(engine);
      for (const id of world.ids("P")) { world.visit(id); world.work(30); }
      press(engine, "alt"); expect(engine.view().choices!.find(c => c.id === "build")!.disabled).toBe(false);
      engine.choose!("build"); expect(state(engine).crafted).toBe(true);
    } else {
      world.gather("G");
      for (const id of world.ids("B")) { world.visit(id); world.work(60); }
      if (chapter === 5) for (let attempts = 0; state(engine).enemies.some(a => a.hp > 0) && attempts < 10; attempts++) { const a = state(engine).enemies.find(a => a.hp > 0)!; world.visit(Math.floor(a.y / 92) * 16 + Math.floor(a.x / 92)); world.work(200); }
      expect(state(engine).beacons.length).toBe(world.ids("B").length);
    }
    engine.choose!("close");
    if (game.slug !== "eov") {
      press(engine, "alt"); const choice = engine.view().choices!.find(c => c.id.startsWith("buy:") && !c.disabled);
      if (choice) engine.choose!(choice.id); engine.choose!("close");
    }
    const saved = engine.save(), restored = createAdventureEngine({ campaign: game, chapterIndex: chapter, restored: JSON.parse(JSON.stringify(saved)) });
    expect(restored.save()).toEqual(saved);
    const resumedWorld = explorer(game, chapter, restored); resumedWorld.visit(resumedWorld.ids("E")[0]);
    expect(restored.view().status, `${game.slug} chapter${chapter + 1}: ${JSON.stringify(restored.view())}`).toBe("won");
    progression = restored.progression!();
    expect(progression).toEqual(createAdventureEngine({ campaign: game, chapterIndex: chapter, restored: restored.save() }).progression!());
  }
});
for (const game of ADVENTURE_CAMPAIGNS) test(`${game.title}: exact simulation save, validated carryover and replay rewards are idempotent`, () => {
  const options = { campaign: game, chapterIndex: 0 }, engine = createAdventureEngine(options);
  for (let i = 0; i < 120; i++) tick(engine, ["right"]);
  const restored = createAdventureEngine({ ...options, restored: engine.save() });
  for (let i = 0; i < 100; i++) { tick(engine, ["down", "action"]); tick(restored, ["down", "action"]); }
  expect(restored.save()).toEqual(engine.save());
  const saved = engine.save();
  for (const invalid of [{ ...saved, v: 1 }, { ...saved, chapter: 99 }, { ...saved, checksum: "bad" }, { ...saved, extra: true }, { ...saved, data: { ...state(engine), player: { ...state(engine).player, x: NaN } } }]) expect(() => createAdventureEngine({ ...options, restored: invalid })).toThrow(/Invalid adventure/);
  expect(() => createAdventureEngine({ ...options, progression: { ...engine.progression!(), coins: -1 } })).toThrow(/Invalid adventure progression/);
  const fresh = createAdventureEngine(options), world = explorer(game, 0, fresh), char = game.slug === "hcr" ? "K" : game.slug === "eov" ? "F" : game.slug === "ibl" ? "W" : "G";
  const id = world.ids(char)[0]; world.visit(id); world.work();
  const earned = fresh.progression!();
  const replay = createAdventureEngine({ ...options, progression: earned }), repeat = explorer(game, 0, replay);
  repeat.visit(id); repeat.work(); expect(replay.progression!()).toEqual(earned);
});
test("Hollow Crown: visible telegraphs hurt an idle hero; dodge consumes stamina and a defeat freezes simulation", () => {
  const game = ADVENTURE_CAMPAIGNS.find(g => g.slug === "hcr")!, engine = createAdventureEngine({ campaign: game, chapterIndex: 0 }), world = explorer(game, 0, engine);
  world.visit(world.ids("M")[0], false);
  const hp = state(engine).player.hp;
  let telegraphed = false;
  for (let i = 0; i < 600; i++) { tick(engine); telegraphed ||= state(engine).enemies.some(a => a.phase === 1); }
  expect(telegraphed).toBe(true); expect(state(engine).player.hp).toBeLessThan(hp);
  engine.update(1 / 60, { held: new Set(["right"]), pressed: new Set(["alt"]) }); expect(state(engine).player.stamina).toBeLessThan(80);
  for (let i = 0; i < 6000 && engine.view().status === "playing"; i++) tick(engine);
  expect(engine.view().status).toBe("lost"); const lost = engine.save(); tick(engine, ["action"]); expect(engine.save()).toEqual(lost);
});
test("Ironbloom: renewable plants support optional requests without blocking the repair", () => {
  const game = ADVENTURE_CAMPAIGNS.find(g => g.slug === "ibl")!, engine = createAdventureEngine({ campaign: game, chapterIndex: 0 }), world = explorer(game, 0, engine);
  world.gather("W"); world.visit(world.ids("P")[0]); world.work(30);
  expect(state(engine).blooms).toBe(0);
  for (let i = 0; i < 510; i++) tick(engine); world.work(30); expect(state(engine).blooms).toBe(1);
  for (let i = 0; i < 510; i++) tick(engine); world.work(30); expect(state(engine).blooms).toBe(2);
});
test("Archive exploration reveals clue fragments; a mechanism decision pauses the exact world state", () => {
  const game = ADVENTURE_CAMPAIGNS.find(g => g.slug === "eov")!, engine = createAdventureEngine({ campaign: game, chapterIndex: 1 }), world = explorer(game, 1, engine);
  expect(engine.view().selection).not.toContain("3, 2, 0, 1");
  world.visit(world.ids("F")[0]); world.work();
  expect(engine.view().selection).toContain("Folio"); expect(engine.view().selection).not.toContain("3, 2, 0, 1");
  world.gather("F"); expect(engine.view().selection).toContain("3, 2, 0, 1");
  world.visit(world.ids("1")[0], false); engine.choose!("close"); for (let i = 0; i < 30; i++) tick(engine); press(engine, "action");
  expect(engine.view().choiceMode).toBe("modal"); const paused = engine.save();
  engine.update(.25, { held: new Set(["right", "action"]), pressed: new Set(["alt"]) }); expect(engine.save()).toEqual(paused);
  const restored = createAdventureEngine({ campaign: game, chapterIndex: 1, restored: paused }); expect(restored.view().choices).toEqual(engine.view().choices);
});
test("Adventure restore rejects wrong equipment, impossible UI and entity state even with a valid checksum", () => {
  const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16); };
  const game = ADVENTURE_CAMPAIGNS.find(g => g.slug === "hcr")!, engine = createAdventureEngine({ campaign: game, chapterIndex: 0 });
  for (const changed of [
    { ...state(engine), panel: "puzzle" },
    { ...state(engine), player: { ...state(engine).player, hp: 200 } },
    { ...state(engine), enemies: state(engine).enemies.map((a, i) => i ? a : { ...a, phase: 9 }) },
    { ...state(engine), enemies: state(engine).enemies.map((a, i) => i ? a : { ...a, hp: a.hp - .5 }) },
    { ...state(engine), progress: { ...engine.progression!(), mast: 1 } },
    { ...state(engine), progress: { ...engine.progression!(), rewards: ["8:find:12"] } },
  ]) {
    const restored = { ...engine.save(), data: changed, checksum: hash(JSON.stringify(changed)) };
    expect(() => createAdventureEngine({ campaign: game, chapterIndex: 0, restored })).toThrow(/Invalid adventure/);
  }
});
