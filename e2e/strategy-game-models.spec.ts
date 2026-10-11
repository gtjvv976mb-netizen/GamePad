import { expect, test } from "@playwright/test";
import { STRATEGY_CAMPAIGNS } from "../src/games/campaigns/strategy";
import { createStrategyEngine } from "../src/games/engines/strategy";
import type { Campaign, GameButton, GameEngine } from "../src/games/types";

test.skip(({ isMobile }) => isMobile, "deterministic engine tests run once in Node");
const press = (engine: GameEngine, button: GameButton) => engine.update(1 / 60, { held: new Set(), pressed: new Set([button]) });
const tap = (engine: GameEngine, x: number, y: number) => engine.update(1 / 60, { held: new Set(), pressed: new Set(), pointer: { x, y, pressed: true, down: true } });
const data = <T>(engine: GameEngine) => engine.save().data as T;
const campaign = (slug: string) => STRATEGY_CAMPAIGNS.find(c => c.slug === slug)!;
type P = { x: number; y: number };
const directions = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const dist = (a: P, b: P) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function solveTavern(engine: GameEngine, c: Campaign, chapter: number) {
  const config = c.chapters[chapter].config as unknown as { orders: { recipe: number[] }[] };
  for (let guest = 0; guest < config.orders.length; guest++) {
    tap(engine, 650, 115 + guest * 49);
    for (const ingredient of config.orders[guest].recipe) { tap(engine, 60 + ingredient * 140, 390); press(engine, "action"); }
    press(engine, "alt");
  }
}

function solveKitchen(engine: GameEngine, c: Campaign, chapter: number) {
  const config = c.chapters[chapter].config as unknown as { guests: { appetite: number[] }[]; heatLimit: number };
  const heats = [2, 1, 3];
  for (let i = 0; i < 300 && engine.view().status === "playing"; i++) {
    const s = data<{ guest: number; craving: number; heat: number }>(engine), guest = config.guests[s.guest], dish = guest.appetite[s.craving % guest.appetite.length];
    if (s.heat + heats[dish] > config.heatLimit) press(engine, "alt");
    else { tap(engine, 50 + dish * 232, 390); press(engine, "action"); }
  }
}

type SquadState = { selected: number; allies: (P & { hp: number; ap: number })[]; enemies: (P & { hp: number })[]; turn: number };
function solveTactics(engine: GameEngine, c: Campaign, chapter: number) {
  const config = c.chapters[chapter].config as unknown as { width: number; height: number; walls: number[][]; exit: number[]; turns: number };
  const command = (p: P) => tap(engine, 35 + p.x * 61 + 30, 105 + p.y * 61 + 30);
  const visible = (a: P, b: P) => {
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 4;
    for (let i = 1; i < steps; i++) if (config.walls.some(([x, y]) => x === Math.round(a.x + (b.x - a.x) * i / steps) && y === Math.round(a.y + (b.y - a.y) * i / steps))) return false;
    return true;
  };
  for (let turn = 0; turn < config.turns && engine.view().status === "playing"; turn++) {
    for (let unitIndex = 0; unitIndex < 2 && engine.view().status === "playing"; unitIndex++) {
      for (let action = 0; action < 2 && engine.view().status === "playing"; action++) {
        const s = data<SquadState>(engine), unit = s.allies[unitIndex], reach = unitIndex === 0 ? 1 : 3;
        if (unit.hp <= 0 || unit.ap <= 0) break;
        command(unit);
        const enemies = s.enemies.filter(e => e.hp > 0), attackable = enemies.filter(e => dist(e, unit) <= reach && visible(unit, e)).sort((a, b) => a.hp - b.hp);
        if (attackable.length) { command(attackable[0]); continue; }
        const blocked = (p: P) => p.x < 0 || p.y < 0 || p.x >= config.width || p.y >= config.height || config.walls.some(([x, y]) => p.x === x && p.y === y) || [...s.allies, ...s.enemies].some(a => a.hp > 0 && a.x === p.x && a.y === p.y);
        const goal = (p: P) => enemies.length ? enemies.some(e => dist(p, e) <= reach && visible(p, e)) : p.x === config.exit[0] && p.y === config.exit[1];
        const queue: { p: P; first?: P }[] = [{ p: unit }], seen = new Set([`${unit.x},${unit.y}`]); let step: P | undefined;
        while (queue.length) {
          const next = queue.shift()!;
          if (next.first && goal(next.p)) { step = next.first; break; }
          for (const dir of directions) { const p = { x: next.p.x + dir.x, y: next.p.y + dir.y }, key = `${p.x},${p.y}`; if (!seen.has(key) && !blocked(p)) { seen.add(key); queue.push({ p, first: next.first ?? p }); } }
        }
        if (!step) break;
        command(step);
      }
    }
    if (engine.view().status === "playing") press(engine, "alt");
  }
}

type SpellState = { hand: number[]; selected: number; draft: boolean; encounter: number; energy: number; block: number; hp: number; enemyHp: number; poison: number; turn: number };
const spells = [
  { cost: 1, damage: 5, shield: 0, heal: 0, energy: 0, poison: 0 }, { cost: 1, damage: 0, shield: 7, heal: 0, energy: 0, poison: 0 },
  { cost: 2, damage: 5, shield: 0, heal: 4, energy: 0, poison: 0 }, { cost: 0, damage: 0, shield: 0, heal: 0, energy: 2, poison: 0 },
  { cost: 3, damage: 13, shield: 0, heal: 0, energy: 0, poison: 0 }, { cost: 1, damage: 2, shield: 0, heal: 0, energy: 0, poison: 3 },
  { cost: 1, damage: 0, shield: 11, heal: 2, energy: 0, poison: 0 }, { cost: 1, damage: 4, shield: 0, heal: 7, energy: 0, poison: 0 },
];
function solveDeck(engine: GameEngine, c: Campaign, chapter: number) {
  const config = c.chapters[chapter].config as unknown as { health: number; foes: { attacks: number[] }[]; drafts: number[][] };
  for (let step = 0; step < 1000 && engine.view().status === "playing"; step++) {
    const s = data<SpellState>(engine), choice = s.draft ? config.drafts[s.encounter] : s.hand;
    let select = -1;
    if (s.draft) select = choice.indexOf(7) >= 0 ? choice.indexOf(7) : 0;
    else {
      const foe = config.foes[s.encounter], incoming = Math.max(0, foe.attacks[(s.turn - 1) % foe.attacks.length] - s.block);
      let best = 0;
      choice.forEach((id, i) => {
        const card = spells[id]; if (card.cost > s.energy) return;
        const score = card.energy ? 100 : card.damage >= s.enemyHp ? 90 : (card.damage + card.poison * Math.min(3, Math.ceil(s.enemyHp / 8)) + Math.min(card.heal, config.health - s.hp) * 1.4 + Math.min(incoming, card.shield) * 0.9) / Math.max(1, card.cost);
        if (score > best) { best = score; select = i; }
      });
    }
    if (select >= 0) { const offset = (960 - choice.length * 212 + 20) / 2; tap(engine, offset + select * 212 + 50, 350); press(engine, "action"); }
    else press(engine, "alt");
  }
}

type BazaarState = { cash: number; day: number; inventory: { type: number; age: number }[]; bought: boolean[] };
const goods = [{ cost: 2, peak: 1 }, { cost: 3, peak: 2 }, { cost: 5, peak: 3 }, { cost: 7, peak: 4 }];
function solveBazaar(engine: GameEngine, c: Campaign, chapter: number) {
  const config = c.chapters[chapter].config as unknown as { days: number; market: number[][] };
  for (let day = 0; day < config.days && engine.view().status === "playing"; day++) {
    let s = data<BazaarState>(engine);
    for (let i = s.inventory.length - 1; i >= 0 && engine.view().status === "playing"; i--) {
      const g = s.inventory[i];
      if (g.age >= goods[g.type].peak || s.day === config.days - 1) { tap(engine, 65 + i * 183, 370); press(engine, "action"); }
    }
    if (engine.view().status !== "playing") break;
    for (let i = 0; i < 3; i++) {
      s = data<BazaarState>(engine); const type = config.market[s.day][i], g = goods[type];
      if (s.inventory.length < 5 && s.cash >= g.cost && s.day + g.peak < config.days) { tap(engine, 75 + i * 224, 150); press(engine, "action"); }
    }
    press(engine, "alt");
  }
}

type LightConfig = { width: number; height: number; emitters: (P & { color: number; dir: number })[]; mirrors: (P & { slash: boolean; fixed?: boolean })[]; prisms: (P & { color: number })[]; receivers: (P & { color: number })[]; walls: number[][] };
function illuminated(config: LightConfig, orientations: boolean[]) {
  const reached = new Set<number>();
  for (const emitter of config.emitters) {
    let p = { x: emitter.x, y: emitter.y }, direction = emitter.dir, color = emitter.color;
    const visited = new Set<string>();
    for (let step = 0; step < 1000; step++) {
      const key = `${p.x},${p.y},${direction},${color}`; if (visited.has(key)) break; visited.add(key);
      p = { x: p.x + directions[direction].x, y: p.y + directions[direction].y };
      if (p.x < 0 || p.y < 0 || p.x >= config.width || p.y >= config.height || config.walls.some(([x, y]) => x === p.x && y === p.y)) break;
      const receiver = config.receivers.findIndex(r => r.x === p.x && r.y === p.y);
      if (receiver >= 0) { if (config.receivers[receiver].color === color) reached.add(receiver); break; }
      const crystal = config.prisms.find(v => v.x === p.x && v.y === p.y); if (crystal) color = crystal.color;
      const mirror = config.mirrors.findIndex(v => v.x === p.x && v.y === p.y);
      if (mirror >= 0) direction = orientations[mirror] ? [3, 2, 1, 0][direction] : [1, 0, 3, 2][direction];
    }
  }
  return reached.size === config.receivers.length;
}
function solveLight(engine: GameEngine, c: Campaign, chapter: number) {
  const config = c.chapters[chapter].config as unknown as LightConfig, free = config.mirrors.map((m, i) => !m.fixed ? i : -1).filter(n => n >= 0);
  let solution: boolean[] | undefined;
  for (let combination = 0; combination < 2 ** free.length; combination++) {
    const orientations = config.mirrors.map(m => m.slash); free.forEach((n, bit) => { orientations[n] = !!(combination & 2 ** bit); });
    if (illuminated(config, orientations)) { solution = orientations; break; }
  }
  expect(solution, `Optical chamber ${chapter + 1} must have a physical solution`).toBeDefined();
  config.mirrors.forEach((mirror, i) => { if (solution![i] !== mirror.slash) tap(engine, 35 + mirror.x * 64 + 32, 101 + mirror.y * 64 + 32); });
  expect(engine.view().status).toBe("playing"); // A preview alone cannot complete a chamber.
  press(engine, "alt");
}

const solvers: Record<string, (engine: GameEngine, c: Campaign, chapter: number) => void> = { ptv: solveTavern, kkn: solveKitchen, sft: solveTactics, mmr: solveDeck, cbz: solveBazaar, lmc: solveLight };
for (const c of STRATEGY_CAMPAIGNS) {
  for (let chapter = 0; chapter < c.chapters.length; chapter++) {
    test(`${c.title}: chapter ${chapter + 1} can be won through its actual rules`, () => {
      const engine = createStrategyEngine({ campaign: c, chapterIndex: chapter });
      expect(engine.view().status).toBe("playing");
      solvers[c.slug](engine, c, chapter);
      expect(engine.view().status, JSON.stringify(engine.save().data)).toBe("won");
      const completed = createStrategyEngine({ campaign: c, chapterIndex: chapter, restored: engine.save() });
      expect(completed.save()).toEqual(engine.save()); expect(completed.view().status).toBe("won");
    });
  }
}

test("management, combat, economy and optics all have genuine failure states", () => {
  const tavern = createStrategyEngine({ campaign: campaign("ptv"), chapterIndex: 0 });
  for (let i = 0; i < 4; i++) { tap(tavern, 60, 390); press(tavern, "action"); press(tavern, "alt"); }
  expect(tavern.view().status).toBe("lost");
  const kitchen = createStrategyEngine({ campaign: campaign("kkn"), chapterIndex: 0 });
  for (let i = 0; i < 40 && kitchen.view().status === "playing"; i++) { tap(kitchen, 50 + 2 * 232, 390); press(kitchen, "action"); }
  expect(kitchen.view().status).toBe("lost");
  const tactics = createStrategyEngine({ campaign: campaign("sft"), chapterIndex: 0 });
  for (let i = 0; i < 40 && tactics.view().status === "playing"; i++) press(tactics, "alt");
  expect(tactics.view().status).toBe("lost");
  const deck = createStrategyEngine({ campaign: campaign("mmr"), chapterIndex: 0 });
  for (let i = 0; i < 30 && deck.view().status === "playing"; i++) press(deck, "alt");
  expect(deck.view().status).toBe("lost");
  const bazaar = createStrategyEngine({ campaign: campaign("cbz"), chapterIndex: 0 });
  for (let i = 0; i < 5; i++) press(bazaar, "alt");
  expect(bazaar.view().status).toBe("lost");
  const light = createStrategyEngine({ campaign: campaign("lmc"), chapterIndex: 0 });
  for (let i = 0; i < 5; i++) press(light, "alt");
  expect(light.view().status).toBe("lost");
});

test("all six strategy engines resume exact decisions and reject foreign or malformed saves", () => {
  for (const c of STRATEGY_CAMPAIGNS) {
    const engine = createStrategyEngine({ campaign: c, chapterIndex: 0 });
    press(engine, "right"); press(engine, "action"); press(engine, "alt");
    const checkpoint = engine.save(), resumed = createStrategyEngine({ campaign: c, chapterIndex: 0, restored: checkpoint });
    expect(resumed.save()).toEqual(checkpoint); expect(resumed.view()).toEqual(engine.view());
    for (const button of ["right", "action", "alt", "down", "left", "action"] as GameButton[]) { press(engine, button); press(resumed, button); expect(resumed.save()).toEqual(engine.save()); }
    expect(() => createStrategyEngine({ campaign: c, chapterIndex: 1, restored: checkpoint })).toThrow("Invalid");
    expect(() => createStrategyEngine({ campaign: c, chapterIndex: 0, restored: { ...checkpoint, version: 900 } })).toThrow("Invalid");
    expect(() => createStrategyEngine({ campaign: c, chapterIndex: 0, restored: { ...checkpoint, data: { impossible: true } } })).toThrow("Invalid");
    expect(() => createStrategyEngine({ campaign: c, chapterIndex: 0, restored: { ...checkpoint, checksum: "invalid" } })).toThrow("Invalid");
    expect(() => createStrategyEngine({ campaign: c, chapterIndex: -1 })).toThrow("out of range");
  }
});

test("strategy snapshots validate their structure even when the checksum is recomputed", () => {
  const checksum = (value: unknown) => { const text = JSON.stringify(value); let n = 2166136261; for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619); return (n >>> 0).toString(16); };
  for (const c of STRATEGY_CAMPAIGNS) {
    const engine = createStrategyEngine({ campaign: c, chapterIndex: 0 }), saved = engine.save();
    const fields = saved.data as Record<string, unknown>;
    const malformed = c.slug === "ptv" ? { ...fields, ingredient: 99 } : c.slug === "sft" || c.slug === "lmc" ? { ...fields, cursor: { x: -1, y: 99 } } : { ...fields, selected: 99 };
    expect(() => createStrategyEngine({ campaign: c, chapterIndex: 0, restored: { ...saved, data: malformed, checksum: checksum(malformed) } })).toThrow("Invalid");
  }
});

test("pantry depletion ends a shift and simultaneous controls preserve a restorable terminal state", () => {
  const c = campaign("ptv"), engine = createStrategyEngine({ campaign: c, chapterIndex: 4 });
  press(engine, "action"); press(engine, "alt");
  expect(engine.view().status).toBe("lost"); expect(engine.view().message).toContain("pantry");
  const first = createStrategyEngine({ campaign: c, chapterIndex: 0 });
  for (let i = 0; i < 30 && first.view().status === "playing"; i++) first.update(0.016, { held: new Set(), pressed: new Set(["action", "alt"]) });
  expect(createStrategyEngine({ campaign: c, chapterIndex: 0, restored: first.save() }).save()).toEqual(first.save());
});

test("deck drafting changes the deck and bazaar values peak then decay", () => {
  const deckCampaign = campaign("mmr"), engine = createStrategyEngine({ campaign: deckCampaign, chapterIndex: 0 });
  solveDeck(engine, deckCampaign, 0);
  const deckSave = data<{ deck: number[] }>(engine); expect(deckSave.deck).toHaveLength(10); expect(deckSave.deck).toContain(7);
  const bazaar = createStrategyEngine({ campaign: campaign("cbz"), chapterIndex: 0 });
  press(bazaar, "action"); press(bazaar, "alt"); press(bazaar, "down");
  const ripe = bazaar.save(); press(bazaar, "action"); expect(data<{ cash: number }>(bazaar).cash).toBe(15);
  const faded = createStrategyEngine({ campaign: campaign("cbz"), chapterIndex: 0, restored: ripe }); press(faded, "alt"); press(faded, "down"); press(faded, "action"); expect(data<{ cash: number }>(faded).cash).toBe(10);
});
