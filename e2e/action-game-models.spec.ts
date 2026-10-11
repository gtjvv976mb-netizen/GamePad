import { expect, test } from '@playwright/test';
import { ACTION_CAMPAIGNS } from '../src/games/campaigns/action';
import { createActionEngine } from '../src/games/engines/action';
import type { Campaign, GameButton, GameEngine, GameInput } from '../src/games/types';

type Model = { x: number; y: number; vx: number; vy: number; angle: number; progress: number; cargo: number; energy: number; health: number; cooldown: number; checkpoint: number; grounded: boolean; jumps: number; time: number; items: boolean[]; entities: { x: number; y: number; hp: number; kind: number }[] };
const state = (engine: GameEngine) => engine.save() as unknown as Model;
const controls = (held: GameButton[] = [], pressed: GameButton[] = []): GameInput => ({ held: new Set(held), pressed: new Set(pressed) });
const step = (engine: GameEngine, held: GameButton[], pressed: GameButton[] = []) => engine.update(1 / 60, controls(held, pressed));
const delta = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// A real navigation controller follows safe geometry; it never alters game state or objectives.
function route(campaign: Campaign, chapter: number, from: number[], to: number[]) {
  const c = campaign.chapters[chapter].config;
  const walls = (c.buildings ?? c.walls ?? []) as number[][], rocks = (c.rocks ?? []) as number[][];
  const size = 20, world = (c.world??[960,540]) as number[], cols = Math.ceil(world[0]/size), rows = Math.ceil(world[1]/size);
  const blocked = (x: number, y: number) => x < 30 || x > world[0]-30 || y < 30 || y > world[1]-30 || walls.some(([rx, ry, w, h]) => x > rx - 21 && x < rx + w + 21 && y > ry - 21 && y < ry + h + 21) || rocks.some(([rx, ry, r]) => Math.hypot(x - rx, y - ry) < r + 35);
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
  for (let n = 0; n < 50000 && engine.view().status === 'playing'; n++) {
    const s=state(engine);let goal=points[s.progress%points.length];
    const direction=[goal[0]-s.x,goal[1]-s.y],dd=Math.hypot(...direction);
    const mine=(game.chapters[chapter].config.mines as number[][]).find(m=>distance([s.x,s.y],m)<165&&(m[0]-s.x)*direction[0]+(m[1]-s.y)*direction[1]>0);
    if(mine){const nx=-direction[1]/dd,ny=direction[0]/dd,side=(s.x-mine[0])*nx+(s.y-mine[1])*ny>=0?1:-1;goal=[mine[0]+nx*side*62,mine[1]+ny*side*62];}
    const desired=Math.atan2(goal[1]-s.y,goal[0]-s.x),error=delta(desired-s.angle);
    const held: GameButton[] = [], desiredSpeed = Math.abs(error) > 0.6 ? 65 : Math.min(145, distance([s.x, s.y], goal) * 1.1 + 35);
    if (error > 0.035) held.push('right'); if (error < -0.035) held.push('left');
    const forward=s.vx*Math.cos(s.angle)+s.vy*Math.sin(s.angle);
    if (forward < desiredSpeed - 5) held.push('up'); if (forward > desiredSpeed + 5) held.push('down');
    step(engine, held);
  }
}
function playCargo(engine: GameEngine, game: Campaign, chapter: number) {
  const c = game.chapters[chapter].config;
  const pods = (c.pods ?? c.stops) as number[][], base = (c.base ?? c.hub) as number[];
  for(const valve of (c.valves??[]) as number[][]){travel(engine,game,chapter,valve,game.slug==='osv');step(engine,[],['action']);}
  for (let attempts=0;attempts<20&&state(engine).progress<pods.length&&engine.view().status==='playing';attempts++){
    const n=state(engine).progress,target=pods[n];
    if(game.slug==='slc'&&state(engine).health<75){travel(engine,game,chapter,base);for(let frame=0;frame<1500&&state(engine).health<99;frame++)step(engine,[]);}
    if (game.slug === 'slc') { travel(engine, game, chapter, ((c.pickups as number[][]|undefined)?.[n]??base)); step(engine, [], ['action']); }
    travel(engine, game, chapter, target, game.slug === 'osv'); step(engine, ['alt'], ['action']);
    if (game.slug === 'osv') { travel(engine, game, chapter, base, true); step(engine, ['alt'], ['action']); }
  }
}
function playDive(engine: GameEngine, game: Campaign, chapter: number) {
  const c = game.chapters[chapter].config, air = c.air as number[][];
  for(const valve of (c.valves??[]) as number[][]){travel(engine,game,chapter,valve);step(engine,[],['action']);}
  for (const target of c.relics as number[][]) {
    const s = state(engine), nearest = air.slice().sort((a, b) => distance(a, [s.x, s.y]) - distance(b, [s.x, s.y]))[0];
    travel(engine, game, chapter, nearest);
    for (let n = 0; n < 160 && state(engine).energy < Number(c.oxygen) - 0.1; n++) step(engine, []);
    travel(engine, game, chapter, target); step(engine, [], ['action']);
  }
  travel(engine, game, chapter, c.exit as number[]); step(engine, [], ['action']);
}
function playArena(engine: GameEngine,game:Campaign,chapter:number,stopAtBoss=false) {
  for (let n = 0; n < 18000 && engine.view().status === 'playing'; n++) {
    const s = state(engine), alive = s.entities.filter(e => e.hp > 0), closest = alive.slice().sort((a, b) => distance([s.x, s.y], [a.x, a.y]) - distance([s.x, s.y], [b.x, b.y]))[0];
    if(stopAtBoss&&alive.some(e=>e.kind===6))return;
    if(!closest){travel(engine,game,chapter,[865,270]);step(engine,[],['action']);continue;}
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
  const targets = [...game.chapters[chapter].config.route as number[][], game.chapters[chapter].config.exit as number[]];
  for (const target of targets) {
    if(target===targets[targets.length-1]){for(let frame=0;frame<1600&&engine.view().status==='playing';frame++){const s=state(engine),boss=s.entities.find(e=>e.kind===2&&e.hp>0);if(!boss)break;const held:GameButton[]=[];if(boss.x>s.x+5)held.push('right');if(boss.x<s.x-5)held.push('left');if(s.vy<0)held.push('action');const press:GameButton[]=[];if(s.grounded)press.push('action');if(Math.abs(boss.x-s.x)<95&&s.cooldown<=0)press.push('alt');step(engine,held,press);}}
    for (let n = 0; n < 1100 && engine.view().status === 'playing'; n++) {
      const s = state(engine), dx = target[0] - s.x, dy = target[1] - s.y;
      if (Math.hypot(dx, dy) < 19 && s.grounded) break;
      const held: GameButton[] = [], press: GameButton[] = [];
      if (dx > 7) held.push('right'); if (dx < -7) held.push('left');
      if (s.vy<0)held.push('action');
      if (s.grounded && Math.abs(dx)>18) press.push('action');
      // Delay the second jump until approaching the apex; this is ordinary double-jump input.
      if (!s.grounded && s.jumps === 1 && s.vy > -75 && (dy < -12 || Math.abs(dx)>50)) press.push('action');
      const enemy=s.entities.find(e=>e.hp>0&&Math.hypot(e.x-s.x,e.y-s.y)<80);
      if(enemy&&n%20===0)press.push('alt');
      if(enemy&&Math.abs(dx)<30&&s.grounded)press.push('action');
      step(engine, held, press);
    }
  }
}
function complete(engine:GameEngine,game:Campaign,chapter:number){
 if(game.slug==='ndp')playRace(engine,game,chapter);
 if(game.slug==='osv'||game.slug==='slc')playCargo(engine,game,chapter);
 if(game.slug==='dpt')playDive(engine,game,chapter);
 if(game.slug==='gla')playArena(engine,game,chapter);
 if(game.slug==='rrn')playPlatform(engine,game,chapter);
}
for (const game of ACTION_CAMPAIGNS) {
  test(`${game.title}: every authored chapter is completable through its actual controls`, async () => {
    for (let chapter = 0; chapter < game.chapters.length; chapter++) {
      const engine = createActionEngine({ campaign: game, chapterIndex: chapter });
      if (game.slug === 'ndp') playRace(engine, game, chapter);
      if (game.slug === 'osv' || game.slug === 'slc') playCargo(engine, game, chapter);
      if (game.slug === 'dpt') playDive(engine, game, chapter);
      if (game.slug === 'gla') playArena(engine,game,chapter);
      if (game.slug === 'rrn') playPlatform(engine, game, chapter);
      expect(engine.view().status, `${game.slug} chapter ${chapter + 1}: ${JSON.stringify(engine.view())} at ${JSON.stringify(state(engine))}`).toBe('won');
      expect(engine.progression!().completed).toEqual([chapter]);
      const recovered=createActionEngine({campaign:game,chapterIndex:chapter,restored:engine.save()});
      expect(recovered.progression!()).toEqual(engine.progression!());
      if(game.slug==='rrn')expect(state(engine).checkpoint).toBe(2);
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

    for (let n = 0; n < 18000 && engine.view().status === 'playing'; n++) {
      const s = state(engine); let held: GameButton[] = [];
      if (game.slug === 'ndp') held = ['up'];
      if(game.slug==='osv'){const rock=(game.chapters[chapterIndex].config.rocks as number[][])[0];if(s.x<rock[0])held.push('right');else held.push('left');if(s.y<rock[1])held.push('down');else held.push('up');}
      if (game.slug === 'slc') held = ['right'];
      if (game.slug === 'rrn') held = ['right'];
      step(engine, held);
    }
    expect(engine.view().status, game.slug).toBe('lost');
    expect(createActionEngine(options).save()).toEqual(initial);
  }
});

for(const game of ACTION_CAMPAIGNS)test(`${game.slug}: earned equipment persists and a replay cannot farm modules`,()=>{
 const options={campaign:game,chapterIndex:0},engine=createActionEngine(options);complete(engine,game,0);expect(engine.view().status).toBe('won');
 const earned=engine.progression!(),tokens=earned.tokens as number;expect(tokens).toBeGreaterThan(0);
 const choice=engine.view().choices!.find(c=>!c.disabled)!;engine.choose!(choice.id);
 expect(engine.progression!().tokens).toBe(tokens-1);expect(engine.progression!().upgrades).toEqual([choice.id]);
 const purchased=engine.progression!();engine.choose!(choice.id);expect(engine.progression!()).toEqual(purchased);
 const resumed=createActionEngine({...options,restored:engine.save()});expect(resumed.progression!()).toEqual(purchased);
 const replay=createActionEngine({...options,progression:purchased});complete(replay,game,0);expect(replay.view().status).toBe('won');expect(replay.progression!()).toEqual(purchased);
 expect(()=>createActionEngine({...options,progression:{...purchased,tokens:99}})).toThrow(/progression/);
 expect(()=>createActionEngine({...options,progression:{...purchased,upgrades:[choice.id,choice.id]}})).toThrow(/progression/);
});

test('Hover steering carries lateral inertia, rivals drive and boosting spends charge',()=>{
 const game=ACTION_CAMPAIGNS.find(c=>c.slug==='ndp')!,engine=createActionEngine({campaign:game,chapterIndex:0});
 for(let n=0;n<90;n++)step(engine,['up']);const before=state(engine);
 for(let n=0;n<16;n++)step(engine,['up','right']);const turning=state(engine);
 expect(Math.abs(delta(Math.atan2(turning.vy,turning.vx)-turning.angle))).toBeGreaterThan(.035);
 expect(distance([turning.entities[0].x,turning.entities[0].y],[before.entities[0].x,before.entities[0].y])).toBeGreaterThan(10);
 for(let n=0;n<20;n++)step(engine,['up','action']);expect(state(engine).energy).toBeLessThan(100);
 const save=engine.save();expect(engine.events!().some(e=>e.type==='engine')).toBe(true);expect(engine.events!()).toEqual([]);expect(engine.save()).toEqual(save);
});

test('Salvage towing has a physical trailing crate, and wreck airlocks require interaction',()=>{
 const game=ACTION_CAMPAIGNS.find(c=>c.slug==='osv')!,engine=createActionEngine({campaign:game,chapterIndex:2}),c=game.chapters[2].config;
 const valve=(c.valves as number[][])[0];travel(engine,game,2,valve,true);step(engine,[],['action']);expect(engine.save().flags).toEqual([true,false]);
 const pod=(c.pods as number[][])[0];travel(engine,game,2,pod,true);step(engine,[],['action']);expect(state(engine).cargo).toBe(0);
 for(let n=0;n<90;n++)step(engine,['right','action']);
 const saved=engine.save();expect(Math.hypot(Number(saved.cargoX)-state(engine).x,Number(saved.cargoY)-state(engine).y)).toBeGreaterThan(25);
 expect(()=>createActionEngine({campaign:game,chapterIndex:2,restored:{...saved,cargoHealth:101}})).toThrow(/invalid/);
});

test('Business pickups distinguish courier jobs and a collision damages a fragile parcel',()=>{
 const game=ACTION_CAMPAIGNS.find(c=>c.slug==='slc')!,engine=createActionEngine({campaign:game,chapterIndex:0}),c=game.chapters[0].config;
 step(engine,[],['action']);travel(engine,game,0,(c.stops as number[][])[0]);step(engine,[],['action']);expect(state(engine).progress).toBe(1);
 travel(engine,game,0,(c.pickups as number[][])[1]);step(engine,[],['action']);expect(state(engine).cargo).toBe(1);const health=state(engine).health;
 for(let n=0;n<140;n++)step(engine,['left','down']);expect(state(engine).health).toBeLessThan(health);expect(Number(engine.save().cargoHealth)).toBeLessThan(100);
});

test('Diving air drains away from vents and pressure valves change the level state',()=>{
 const game=ACTION_CAMPAIGNS.find(c=>c.slug==='dpt')!,engine=createActionEngine({campaign:game,chapterIndex:0});
 const initial=state(engine).energy;for(let n=0;n<300;n++)step(engine,[]);expect(state(engine).energy).toBeLessThan(initial-4);
 const valve=(game.chapters[0].config.valves as number[][])[0];travel(engine,game,0,valve);step(engine,[],['action']);expect(engine.save().flags).toEqual([true]);
 const before=state(engine).energy;for(let n=0;n<120;n++)step(engine,[]);expect(state(engine).energy).toBeGreaterThanOrEqual(before);
});

test('Platform jumping responds to hold duration and stage geometry contains moving and crumbling ledges',()=>{
 const game=ACTION_CAMPAIGNS.find(c=>c.slug==='rrn')!,a=createActionEngine({campaign:game,chapterIndex:0}),b=createActionEngine({campaign:game,chapterIndex:0});
 step(a,[]);step(b,[]);step(a,['action'],['action']);step(b,['action'],['action']);
 for(let n=0;n<25;n++){step(a,['action']);step(b,[]);}expect(state(a).y).toBeLessThan(state(b).y-10);
 expect(game.chapters[3].config.motions).not.toEqual([]);expect(game.chapters[3].config.fragile).not.toEqual([]);
 const save=a.save();expect(()=>createActionEngine({campaign:game,chapterIndex:0,restored:{...save,coyote:.3}})).toThrow(/invalid/);
});

test('Right-stick aim overrides autoaim, and the arena boss escalates its real projectile pattern',()=>{
 const game=ACTION_CAMPAIGNS.find(c=>c.slug==='gla')!,aimed=createActionEngine({campaign:game,chapterIndex:0});
 for(let n=0;n<65;n++)step(aimed,[]);
 aimed.update(1/60,{...controls(['action']),aim:{x:0,y:1}});
 const shot=(aimed.save().projectiles as {vx:number;vy:number;enemy:boolean}[]).find(p=>!p.enemy)!;
 expect(Math.abs(shot.vx)).toBeLessThan(.001);expect(shot.vy).toBeGreaterThan(500);
 const bossEngine=createActionEngine({campaign:game,chapterIndex:0});playArena(bossEngine,game,0,true);
 expect(bossEngine.view().boss).toMatchObject({name:'Gate Sentinel',health:24,max:24});
 const burst=(engine:GameEngine)=>{
  for(let n=0;n<220;n++){
   const before=engine.save(),phase=(before.entities as {phase:number;kind:number}[]).find(e=>e.kind===6)!.phase;
   step(engine,[]);
   const after=engine.save(),next=(after.entities as {phase:number;kind:number}[]).find(e=>e.kind===6)!.phase;
   if(Math.floor(next/3.1)>Math.floor(phase/3.1))return (after.projectiles as {enemy:boolean;ttl:number}[]).filter(p=>p.enemy&&p.ttl>2.97).length;
  }
  throw new Error('Boss never attacked');
 };
 expect(burst(bossEngine)).toBe(8);
 for(let n=0;n<600&&bossEngine.view().boss!.health>=12;n++)step(bossEngine,['action']);
 expect(bossEngine.view().boss!.health).toBeLessThan(12);expect(bossEngine.view().status).toBe('playing');
 expect(burst(bossEngine)).toBe(12);
});

test('Every action biome renders valid gradients without mutating its simulation',()=>{
 let commands=0;
 const gradient={addColorStop(_offset:number,color:string){expect(color).toMatch(/^#(?:[a-f\d]{6}|[a-f\d]{8})$/i);}};
 const ctx=new Proxy({}, {get(_target,key){if(key==='createLinearGradient'||key==='createRadialGradient')return()=>gradient;return()=>{commands++;};},set(){return true;}}) as CanvasRenderingContext2D;
 for(const game of ACTION_CAMPAIGNS)for(let chapterIndex=0;chapterIndex<game.chapters.length;chapterIndex++){
  const engine=createActionEngine({campaign:game,chapterIndex});for(let n=0;n<40;n++)step(engine,['right','action']);
  const saved=engine.save(),before=commands;engine.render(ctx,960,540);expect(engine.save()).toEqual(saved);expect(commands-before).toBeGreaterThan(40);
 }
});
