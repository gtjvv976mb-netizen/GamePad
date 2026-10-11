import { expect, test } from '@playwright/test';
import { ACTION_CAMPAIGNS } from '../src/games/campaigns/action';
import { createActionEngine } from '../src/games/engines/action';
import type { Campaign, GameButton, GameEngine, GameInput } from '../src/games/types';

type Model = { x: number; y: number; vx: number; vy: number; angle: number; progress: number; cargo: number; energy: number; health: number; grounded: boolean; jumps: number; time: number; items: boolean[]; entities: { x: number; y: number; hp: number; kind: number }[] };
const state = (engine: GameEngine) => engine.save() as unknown as Model;
const controls = (held: GameButton[] = [], pressed: GameButton[] = []): GameInput => ({ held: new Set(held), pressed: new Set(pressed) });
const step = (engine: GameEngine, held: GameButton[], pressed: GameButton[] = []) => engine.update(1 / 60, controls(held, pressed));
const delta = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// A real navigation controller follows safe geometry; it never alters game state or objectives.
function route(campaign: Campaign, chapter: number, from: number[], to: number[]) {
  const c = campaign.chapters[chapter].config;
  const walls = (c.buildings ?? c.walls ?? []) as number[][], rocks = (c.rocks ?? []) as number[][];
  const size = 20, cols = 48, rows = 27;
  const blocked = (x: number, y: number) => x < 30 || x > 930 || y < 30 || y > 510 || walls.some(([rx, ry, w, h]) => x > rx - 21 && x < rx + w + 21 && y > ry - 21 && y < ry + h + 21) || rocks.some(([rx, ry, r]) => Math.hypot(x - rx, y - ry) < r + 35);
  const index = (p: number[]) => Math.round(p[1] / size) * cols + Math.round(p[0] / size);
  const point = (id: number) => [(id % cols) * size, Math.floor(id / cols) * size];
  let start = index(from), end = index(to);
  const nearest = (id: number) => {
    if (!blocked(...point(id) as [number, number])) return id;
    let best = id, d = Infinity;
    for (let n = 0; n < cols * rows; n++) if (!blocked(...point(n) as [number, number])) { const dd = distance(point(id), point(n)); if (dd < d) { d = dd; best = n; } } return best;
  };
  start = nearest(start); end = nearest(end);
  const queue = [start], prev = new Map<number, number>([[start, start]]);
  for (let cursor = 0; cursor < queue.length && !prev.has(end); cursor++) {
    const node = queue[cursor], [x, y] = point(node);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx * size, ny = y + dy * size, id = index([nx, ny]);
      if (nx >= 0 && nx < cols * size && ny >= 0 && ny < rows * size && !blocked(nx, ny) && !prev.has(id)) { prev.set(id, node); queue.push(id); }
    }
  }
  if (!prev.has(end)) throw new Error(`No route for ${campaign.slug} ${chapter}: ${to}`);
  const path = [to]; let n = end; while (n !== start) { path.unshift(point(n)); n = prev.get(n)!; }
  return path;
}
function travel(engine: GameEngine, game: Campaign, chapter: number, target: number[], inertial = false) {
  const path = route(game, chapter, [state(engine).x, state(engine).y], target);
  for (const waypoint of path) {
    for (let n = 0; n < 600 && engine.view().status === 'playing'; n++) {
      const s = state(engine), dx = waypoint[0] - s.x, dy = waypoint[1] - s.y, d = Math.hypot(dx, dy);
      if (d < (inertial ? 12 : 9) && (!inertial || Math.hypot(s.vx, s.vy) < 32)) break;
      const held: GameButton[] = [];
      const px = inertial ? dx * 3 - s.vx * 1.2 : dx, py = inertial ? dy * 3 - s.vy * 1.2 : dy;
      if (px > 4) held.push('right'); if (px < -4) held.push('left'); if (py > 4) held.push('down'); if (py < -4) held.push('up');
      if (inertial && d < 50) held.push('alt');
      step(engine, held);
    }
  }
}
function playRace(engine: GameEngine, game: Campaign, chapter: number) {
  const points = game.chapters[chapter].config.points as number[][];
  for (let n = 0; n < 20000 && engine.view().status === 'playing'; n++) {
    const s = state(engine), goal = points[s.progress % points.length], desired = Math.atan2(goal[1] - s.y, goal[0] - s.x), error = delta(desired - s.angle);
    const held: GameButton[] = [], desiredSpeed = Math.abs(error) > 0.6 ? 65 : Math.min(145, distance([s.x, s.y], goal) * 1.1 + 35);
    if (error > 0.035) held.push('right'); if (error < -0.035) held.push('left');
    if (s.vx < desiredSpeed - 5) held.push('up'); if (s.vx > desiredSpeed + 5) held.push('down');
    step(engine, held);
  }
}
function playCargo(engine: GameEngine, game: Campaign, chapter: number) {
  const c = game.chapters[chapter].config;
  const pods = (c.pods ?? c.stops) as number[][], base = (c.base ?? c.hub) as number[];
  for (const target of pods) {
    if (game.slug === 'slc') { travel(engine, game, chapter, base); step(engine, [], ['action']); }
    travel(engine, game, chapter, target, game.slug === 'osv'); step(engine, ['alt'], ['action']);
    if (game.slug === 'osv') { travel(engine, game, chapter, base, true); step(engine, ['alt'], ['action']); }
  }
}
function playDive(engine: GameEngine, game: Campaign, chapter: number) {
  const c = game.chapters[chapter].config, air = c.air as number[][];
  for (const target of c.relics as number[][]) {
    const s = state(engine), nearest = air.slice().sort((a, b) => distance(a, [s.x, s.y]) - distance(b, [s.x, s.y]))[0];
    travel(engine, game, chapter, nearest);
    for (let n = 0; n < 160 && state(engine).energy < Number(c.oxygen) - 0.1; n++) step(engine, []);
    travel(engine, game, chapter, target); step(engine, [], ['action']);
  }
  travel(engine, game, chapter, c.exit as number[]); step(engine, [], ['action']);
}
function playArena(engine: GameEngine) {
  for (let n = 0; n < 18000 && engine.view().status === 'playing'; n++) {
    const s = state(engine), alive = s.entities.filter(e => e.hp > 0), closest = alive.slice().sort((a, b) => distance([s.x, s.y], [a.x, a.y]) - distance([s.x, s.y], [b.x, b.y]))[0];
    if (!closest) { step(engine, ['action']); continue; }
    const dx = s.x - closest.x, dy = s.y - closest.y, d = Math.hypot(dx, dy) || 1;
    // Orbit the perimeter clockwise, with a small push away from the closest sentry.
    const phase = s.time * 0.38, target = [480 + Math.cos(phase) * 340, 270 + Math.sin(phase) * 180];
    let vx = target[0] - s.x, vy = target[1] - s.y;
    if (d < 100) { vx += dx / d * 150; vy += dy / d * 150; }
    const held: GameButton[] = ['action']; if (vx > 10) held.push('right'); if (vx < -10) held.push('left'); if (vy > 10) held.push('down'); if (vy < -10) held.push('up');
    step(engine, held, d < 60 ? ['alt'] : []);
  }
}
function playPlatform(engine: GameEngine, game: Campaign, chapter: number) {
  const targets = [...game.chapters[chapter].config.runes as number[][], game.chapters[chapter].config.exit as number[]];
  for (const target of targets) {
    for (let n = 0; n < 1100 && engine.view().status === 'playing'; n++) {
      const s = state(engine), dx = target[0] - s.x, dy = target[1] - s.y;
      if (Math.hypot(dx, dy) < 19 && s.grounded) break;
      const held: GameButton[] = [], press: GameButton[] = [];
      if (dx > 7) held.push('right'); if (dx < -7) held.push('left');
      if (s.grounded && dy < -25) press.push('action');
      // Delay the second jump until approaching the apex; this is ordinary double-jump input.
      if (!s.grounded && s.jumps === 1 && s.vy > -75 && dy < -12) press.push('action');
      step(engine, held, press);
    }
  }
}
for (const game of ACTION_CAMPAIGNS) {
  test(`${game.title}: every authored chapter is completable through its actual controls`, async () => {
    for (let chapter = 0; chapter < game.chapters.length; chapter++) {
      const engine = createActionEngine({ campaign: game, chapterIndex: chapter });
      if (game.slug === 'ndp') playRace(engine, game, chapter);
      if (game.slug === 'osv' || game.slug === 'slc') playCargo(engine, game, chapter);
      if (game.slug === 'dpt') playDive(engine, game, chapter);
      if (game.slug === 'gla') playArena(engine);
      if (game.slug === 'rrn') playPlatform(engine, game, chapter);
      expect(engine.view().status, `${game.slug} chapter ${chapter + 1}: ${JSON.stringify(engine.view())} at ${JSON.stringify(state(engine))}`).toBe('won');
    }
  });
  test(`${game.title}: saved simulation resumes exactly and malformed saves are rejected`, async () => {
    const options = { campaign: game, chapterIndex: 0 };
    const original = createActionEngine(options);
    for (let n = 0; n < 45; n++) step(original, ['right', 'action'], n === 0 ? ['action'] : []);
    const saved = original.save(), restored = createActionEngine({ ...options, restored: saved });
    expect(restored.save()).toEqual(saved);
    for (let n = 0; n < 90; n++) { const i = controls(['down', 'action'], n % 25 === 0 ? ['alt'] : []); original.update(1 / 60, i); restored.update(1 / 60, i); }
    expect(restored.save()).toEqual(original.save());
    expect(() => createActionEngine({ ...options, restored: { ...saved, x: NaN } })).toThrow(/invalid/);
    expect(() => createActionEngine({ ...options, restored: { ...saved, time: -1 } })).toThrow(/invalid/);
    if (game.slug === 'gla') {
      const entities = saved.entities as Record<string, unknown>[];
      expect(() => createActionEngine({ ...options, restored: { ...saved, entities: entities.map((e, n) => n ? e : { ...e, hp: 0.5 }) } })).toThrow(/invalid/);
    }
    expect(() => createActionEngine({ ...options, restored: { ...saved, chapter: 99 } })).toThrow(/invalid/);
    expect(() => createActionEngine({ ...options, restored: { ...saved, items: [true, true, true, true, true, true, true, true] } })).toThrow(/invalid/);
  });
}

test('Action campaigns can fail, and retry starts a clean chapter', async () => {
  for (const game of ACTION_CAMPAIGNS) {
    const chapterIndex = game.slug === 'rrn' ? 1 : 0, options = { campaign: game, chapterIndex };
    const engine = createActionEngine(options), initial = engine.save();
    if (game.slug === 'osv') travel(engine, game, chapterIndex, [480, 230], true);
    for (let n = 0; n < 18000 && engine.view().status === 'playing'; n++) {
      const s = state(engine); let held: GameButton[] = [];
      if (game.slug === 'ndp') held = ['up'];
      if (game.slug === 'osv') held = s.x < 480 ? ['right'] : s.y < 285 ? ['down'] : ['up'];
      if (game.slug === 'slc') held = ['right'];
      if (game.slug === 'rrn') held = s.x < 320 ? ['right'] : [];
      step(engine, held);
    }
    expect(engine.view().status, game.slug).toBe('lost');
    expect(createActionEngine(options).save()).toEqual(initial);
  }
});
