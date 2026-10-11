import type { Campaign, EngineFactory, EngineOptions, EngineView, GameButton, GameEngine, GameInput, GameStatus } from '../types';

type Point = [number, number];
type Rect = [number, number, number, number];
type Rock = [number, number, number];
type Entity = { x: number; y: number; vx: number; vy: number; hp: number; kind: number; phase: number };
type Projectile = { x: number; y: number; vx: number; vy: number; ttl: number; enemy: boolean };
type State = {
  version: number; slug: string; chapter: number; status: GameStatus;
  x: number; y: number; vx: number; vy: number; angle: number; health: number; energy: number;
  time: number; progress: number; cargo: number; items: boolean[]; entities: Entity[]; projectiles: Projectile[];
  cooldown: number; hurt: number; dash: number; jumps: number; grounded: boolean; direction: number;
};
type Config = {
  points?: Point[]; mines?: Point[]; width?: number; pods?: Point[]; rocks?: Rock[]; base?: Point;
  stops?: Point[]; buildings?: Rect[]; traffic?: Rect[]; hub?: Point;
  relics?: Point[]; air?: Point[]; walls?: Rect[]; currents?: number[][]; exit?: Point; oxygen?: number;
  waves?: number[][][]; start?: Point; platforms?: Rect[]; runes?: Point[]; spikes?: Rect[];
};
const W = 960, H = 540;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const length = (x: number, y: number) => Math.hypot(x, y);
const distance = (x: number, y: number, p: Point) => length(x - p[0], y - p[1]);
const has = (input: GameInput, button: GameButton) => input.held.has(button);
const pressed = (input: GameInput, button: GameButton) => input.pressed.has(button);
const axes = (i: GameInput) => {
  let x = Number(has(i, 'right')) - Number(has(i, 'left')), y = Number(has(i, 'down')) - Number(has(i, 'up'));
  const l = Math.hypot(x, y); if (l) { x /= l; y /= l; } return [x, y];
};
const circleRect = (x: number, y: number, radius: number, r: Rect) => length(x - clamp(x, r[0], r[0] + r[2]), y - clamp(y, r[1], r[1] + r[3])) < radius;
function segmentDistance(x: number, y: number, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return length(x - a[0] - dx * t, y - a[1] - dy * t);
}
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const numeric = (v: unknown, low: number, high: number) => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;

/** Each title has its own movement, resource and objective rules; shared code is drawing/save plumbing. */
class ActionEngine implements GameEngine {
  private s: State;
  private readonly c: Config;
  private readonly game: Campaign;
  private readonly chapter: number;
  constructor(options: EngineOptions) {
    this.game = options.campaign; this.chapter = options.chapterIndex;
    if (!Number.isInteger(this.chapter) || !this.game.chapters[this.chapter]) throw new Error('Unknown action chapter.');
    this.c = this.game.chapters[this.chapter].config as Config;
    const initial = this.c.start ?? this.c.base ?? this.c.hub ?? this.c.points?.[0] ?? [65, 105];
    const items = this.c.pods ?? this.c.stops ?? this.c.relics ?? this.c.runes ?? [];
    this.s = {
      version: 1, slug: this.game.slug, chapter: this.chapter, status: 'playing', x: initial[0], y: initial[1], vx: 0, vy: 0,
      angle: this.c.points ? Math.atan2(this.c.points[1][1] - initial[1], this.c.points[1][0] - initial[0]) : 0,
      health: this.game.slug === 'gla' ? 9 : this.game.slug === 'rrn' ? 3 : 100,
      energy: this.c.oxygen ?? 100, time: 0, progress: this.c.points ? 1 : 0, cargo: -1,
      items: items.map(() => false), entities: [], projectiles: [], cooldown: 0, hurt: 0, dash: 0, jumps: 0, grounded: false, direction: 1,
    };
    if (this.c.waves) this.spawnWave();
    if (options.restored) this.restore(options.restored);
  }
  private restore(value: Record<string, unknown>) {
    const v = value as unknown as State;
    const invalid = () => { throw new Error('This action save is invalid or belongs to a different chapter. Start the chapter again.'); };
    if (Object.keys(v).length !== Object.keys(this.s).length || Object.keys(this.s).some(key => !(key in v))) invalid();
    if (v.version !== 1 || v.slug !== this.game.slug || v.chapter !== this.chapter || !['playing', 'won', 'lost'].includes(v.status)) invalid();
    const fields: (keyof State)[] = ['x', 'y', 'vx', 'vy', 'angle', 'health', 'energy', 'time', 'progress', 'cargo', 'cooldown', 'hurt', 'dash', 'jumps', 'direction'];
    for (const f of fields) if (!numeric(v[f], -10000, 1000000)) invalid();
    if (!numeric(v.time, 0, 1000000) || !numeric(v.x, -50, W + 50) || !numeric(v.y, -100, H + 150) || !numeric(v.vx, -1000, 1000) || !numeric(v.vy, -1000, 1000) || !numeric(v.health, 0, this.game.slug === 'gla' ? 9 : this.game.slug === 'rrn' ? 3 : 100) || !numeric(v.energy, 0, this.c.oxygen ?? 100) || !numeric(v.cooldown, 0, 3) || !numeric(v.hurt, 0, 2) || !numeric(v.dash, 0, 1) || !Number.isInteger(v.progress) || !Number.isInteger(v.cargo) || !Number.isInteger(v.jumps) || v.jumps < 0 || v.jumps > 2 || typeof v.grounded !== 'boolean' || ![-1, 1].includes(v.direction)) invalid();
    if (!Array.isArray(v.items) || v.items.length !== this.s.items.length || v.items.some(item => typeof item !== 'boolean') || v.cargo < -1 || v.cargo >= Math.max(1, v.items.length)) invalid();
    const maximum = this.c.points ? this.c.points.length + 1 : this.c.waves?.length ?? v.items.length;
    if (v.progress < (this.c.points ? 1 : 0) || v.progress > maximum) invalid();
    if (!Array.isArray(v.entities) || v.entities.length > 12 || !Array.isArray(v.projectiles) || v.projectiles.length > 200) invalid();
    for (const e of v.entities) if (!e || !numeric(e.x, 10, W - 10) || !numeric(e.y, 10, H - 10) || !numeric(e.vx, -1000, 1000) || !numeric(e.vy, -1000, 1000) || !Number.isInteger(e.kind) || !numeric(e.kind, 0, 2) || !Number.isInteger(e.hp) || !numeric(e.hp, 0, e.kind === 2 ? 7 : e.kind === 1 ? 4 : 3) || !numeric(e.phase, 0, 1000000)) invalid();
    for (const p of v.projectiles) if (!p || !numeric(p.x, -50, W + 50) || !numeric(p.y, -50, H + 50) || !numeric(p.vx, -1000, 1000) || !numeric(p.vy, -1000, 1000) || !numeric(p.ttl, 0, 3) || typeof p.enemy !== 'boolean') invalid();
    if (this.c.waves) { const expected = v.progress === maximum ? 0 : this.c.waves[v.progress].length; if (v.entities.length !== expected) invalid(); }
    else if (v.entities.length || v.projectiles.length) invalid();
    if (this.c.pods && v.cargo >= 0 && v.items[v.cargo]) invalid();
    if (!(this.c.pods || this.c.stops) && v.cargo !== -1) invalid();
    if (this.c.stops && v.cargo >= 0 && v.cargo !== v.progress) invalid();
    if (!this.c.points && !this.c.waves && v.items.filter(Boolean).length !== v.progress) invalid();
    if (v.status === 'won' && (this.c.points || this.c.waves ? v.progress !== maximum : v.items.some(item => !item))) invalid();
    if (v.status === 'playing' && (v.health <= 0 || (this.c.oxygen && v.energy <= 0))) invalid();
    if (v.status === 'lost' && v.health > 0 && !(this.c.oxygen && v.energy === 0)) invalid();
    this.s = copy(v);
  }
  private spawnWave() {
    this.s.entities = (this.c.waves?.[this.s.progress] ?? []).map(([x, y, kind], n) => ({ x, y, vx: 0, vy: 0, hp: kind === 2 ? 7 : kind === 1 ? 4 : 3, kind, phase: n * 0.3 }));
  }
  private damage(amount: number, invulnerability = 0.85) {
    if (this.s.hurt > 0 || (this.game.slug === 'gla' && this.s.dash > 0)) return;
    this.s.health = Math.max(0, this.s.health - amount); this.s.hurt = invulnerability;
  }
  private move(dx: number, dy: number, walls: Rect[], radius = 14, hurtOnImpact = false) {
    const s = this.s;
    const nx = clamp(s.x + dx, radius + 12, W - radius - 12), ny = clamp(s.y + dy, radius + 12, H - radius - 12);
    if (!walls.some(r => circleRect(nx, s.y, radius, r))) s.x = nx;
    else { s.vx = 0; if (hurtOnImpact) this.damage(12); }
    if (!walls.some(r => circleRect(s.x, ny, radius, r))) s.y = ny;
    else { s.vy = 0; if (hurtOnImpact) this.damage(12); }
  }
  update(dt: number, input: GameInput) {
    if (this.s.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 0.25), first = true;
    while (remaining > 0.000001 && this.s.status === 'playing') {
      const step = Math.min(remaining, 1 / 60);
      const i = first ? input : { ...input, pressed: new Set<GameButton>() };
      this.s.time += step; this.s.cooldown = Math.max(0, this.s.cooldown - step); this.s.hurt = Math.max(0, this.s.hurt - step); this.s.dash = Math.max(0, this.s.dash - step);
      switch (this.game.slug) {
        case 'ndp': this.race(step, i); break;
        case 'osv': this.salvage(step, i); break;
        case 'slc': this.delivery(step, i); break;
        case 'dpt': this.dive(step, i); break;
        case 'gla': this.arena(step, i); break;
        case 'rrn': this.platform(step, i); break;
        default: throw new Error('Unknown action campaign.');
      }
      if (this.s.health <= 0 || (this.game.slug === 'dpt' && this.s.energy <= 0)) this.s.status = 'lost';
      remaining -= step; first = false;
    }
  }
  private race(dt: number, i: GameInput) {
    const s = this.s, points = this.c.points!;
    let speed = s.vx;
    s.angle += (Number(has(i, 'right')) - Number(has(i, 'left'))) * (has(i, 'alt') ? 3.9 : 2.65) * dt;
    if (has(i, 'up')) speed += 190 * dt;
    if (has(i, 'down')) speed -= 250 * dt;
    speed *= Math.exp(-(has(i, 'alt') ? 3.8 : 0.6) * dt);
    const boost = has(i, 'action') && s.energy > 3 && has(i, 'up');
    if (boost) { speed += 310 * dt; s.energy = Math.max(0, s.energy - 32 * dt); }
    else s.energy = Math.min(100, s.energy + 16 * dt);
    s.vx = clamp(speed, -100, boost ? 440 : 290);
    s.x = clamp(s.x + Math.cos(s.angle) * s.vx * dt, 15, W - 15); s.y = clamp(s.y + Math.sin(s.angle) * s.vx * dt, 15, H - 15);
    const trackDistance = Math.min(...points.map((p, n) => segmentDistance(s.x, s.y, p, points[(n + 1) % points.length])));
    if (trackDistance > this.c.width! / 2) { s.health = Math.max(0, s.health - 25 * dt); s.vx *= Math.exp(-1.5 * dt); }
    for (const mine of this.c.mines!) if (distance(s.x, s.y, mine) < 29) { this.damage(22); s.vx *= 0.985; }
    if (distance(s.x, s.y, points[s.progress % points.length]) < 44) {
      s.progress++; if (s.progress > points.length) s.status = 'won';
    }
  }
  private salvage(dt: number, i: GameInput) {
    const s = this.s, [ax, ay] = axes(i), acceleration = s.cargo >= 0 ? 185 : 270;
    s.vx += ax * acceleration * dt; s.vy += ay * acceleration * dt;
    const damping = Math.exp(-(has(i, 'alt') ? 6 : 0.22) * dt); s.vx *= damping; s.vy *= damping;
    const speed = length(s.vx, s.vy); if (speed > 240) { s.vx *= 240 / speed; s.vy *= 240 / speed; }
    const nx = clamp(s.x + s.vx * dt, 28, W - 28), ny = clamp(s.y + s.vy * dt, 28, H - 28);
    const rock = this.c.rocks!.find(r => distance(nx, ny, [r[0], r[1]]) < r[2] + (s.cargo >= 0 ? 23 : 15));
    if (rock) { this.damage(16); s.vx *= -0.55; s.vy *= -0.55; } else { s.x = nx; s.y = ny; }
    if (speed > 4) s.angle = Math.atan2(s.vy, s.vx);
    if (pressed(i, 'action')) {
      if (s.cargo >= 0 && distance(s.x, s.y, this.c.base!) < 57) { s.items[s.cargo] = true; s.cargo = -1; s.progress++; if (s.items.every(Boolean)) s.status = 'won'; }
      else if (s.cargo < 0) { const index = this.c.pods!.findIndex((p, n) => !s.items[n] && distance(s.x, s.y, p) < 45); if (index >= 0) s.cargo = index; }
    }
  }
  private delivery(dt: number, i: GameInput) {
    const s = this.s, [ax, ay] = axes(i), moving = !!(ax || ay), turbo = has(i, 'alt') && s.energy > 2;
    const speed = (turbo ? 250 : 155) * (s.energy <= 0 ? 0.25 : 1);
    s.vx = ax * speed; s.vy = ay * speed;
    this.move(s.vx * dt, s.vy * dt, this.c.buildings!, 15, true);
    if (moving) { s.angle = Math.atan2(ay, ax); s.energy = Math.max(0, s.energy - (turbo ? 12 : 1.5) * dt); }
    if (distance(s.x, s.y, this.c.hub!) < 48) s.energy = Math.min(100, s.energy + 36 * dt);
    for (const [x, y, vx, vy] of this.c.traffic!) {
      const tx = 45 + ((x - 45 + vx * s.time) % 870 + 870) % 870;
      const ty = 45 + ((y - 45 + vy * s.time) % 450 + 450) % 450;
      if (distance(s.x, s.y, [tx, ty]) < 28) this.damage(14, 1.1);
    }
    if (pressed(i, 'action')) {
      if (s.cargo < 0 && distance(s.x, s.y, this.c.hub!) < 52) s.cargo = s.progress;
      else if (s.cargo >= 0 && distance(s.x, s.y, this.c.stops![s.progress]) < 42) {
        s.items[s.progress] = true; s.progress++; s.cargo = -1; if (s.progress === s.items.length) s.status = 'won';
      }
    }
  }
  private dive(dt: number, i: GameInput) {
    const s = this.s, [ax, ay] = axes(i), burst = has(i, 'alt') && s.energy > 3, speed = burst ? 245 : 145;
    let vx = ax * speed, vy = ay * speed;
    for (const [x, y, w, h, cx, cy] of this.c.currents!) if (s.x > x && s.x < x + w && s.y > y && s.y < y + h) { vx += cx; vy += cy; }
    s.vx = vx; s.vy = vy; this.move(vx * dt, vy * dt, this.c.walls!, 13);
    if (ax || ay) s.angle = Math.atan2(ay, ax);
    const inAir = s.y < 70 || this.c.air!.some(p => distance(s.x, s.y, p) < 43);
    s.energy = clamp(s.energy + (inAir ? 10 : -(burst ? 2.2 : 1)) * dt, 0, this.c.oxygen!);
    if (pressed(i, 'action')) {
      this.c.relics!.forEach((p, n) => { if (!s.items[n] && distance(s.x, s.y, p) < 40) { s.items[n] = true; s.progress++; } });
      if (s.items.every(Boolean) && distance(s.x, s.y, this.c.exit!) < 48) s.status = 'won';
    }
  }
  private arena(dt: number, i: GameInput) {
    const s = this.s, walls = this.c.walls!, [ax, ay] = axes(i);
    if (pressed(i, 'alt') && s.cooldown <= 0 && (ax || ay)) { s.dash = 0.18; s.cooldown = 1.4; }
    const speed = s.dash > 0 ? 570 : 205;
    s.vx = ax * speed; s.vy = ay * speed; this.move(s.vx * dt, s.vy * dt, walls, 14);
    // energy is the independent weapon cooldown; dash uses cooldown.
    s.energy = Math.max(0, s.energy - dt * 100);
    const visible = (e: Entity) => !walls.some(r => {
      const samples = 16; for (let n = 1; n < samples; n++) if (circleRect(s.x + (e.x - s.x) * n / samples, s.y + (e.y - s.y) * n / samples, 2, r)) return true;
      return false;
    });
    const target = s.entities.filter(e => e.hp > 0 && visible(e)).sort((a, b) => length(a.x - s.x, a.y - s.y) - length(b.x - s.x, b.y - s.y))[0];
    if (has(i, 'action') && s.energy <= 0 && target) {
      const a = Math.atan2(target.y - s.y, target.x - s.x); s.angle = a; s.energy = 17;
      s.projectiles.push({ x: s.x, y: s.y, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, ttl: 1.8, enemy: false });
    }
    for (const e of s.entities) {
      if (e.hp <= 0) continue;
      e.phase += dt; const dx = s.x - e.x, dy = s.y - e.y, d = length(dx, dy) || 1;
      const move = e.kind === 1 && d < 240 ? -22 : e.kind === 2 ? 41 : e.kind === 1 ? 47 : 72;
      e.vx = dx / d * move; e.vy = dy / d * move;
      const nx = clamp(e.x + e.vx * dt, 25, W - 25), ny = clamp(e.y + e.vy * dt, 25, H - 25);
      if (!walls.some(r => circleRect(nx, e.y, 16, r))) e.x = nx;
      else if (!walls.some(r => circleRect(e.x, e.y + (s.y > e.y ? 60 : -60) * dt, 16, r))) e.y += (s.y > e.y ? 60 : -60) * dt;
      if (!walls.some(r => circleRect(e.x, ny, 16, r))) e.y = ny;
      if (distance(s.x, s.y, [e.x, e.y]) < 29) this.damage(1);
      if (e.kind === 1 && Math.floor(e.phase / 1.65) > Math.floor((e.phase - dt) / 1.65)) s.projectiles.push({ x: e.x, y: e.y, vx: dx / d * 180, vy: dy / d * 180, ttl: 3, enemy: true });
    }
    s.projectiles = s.projectiles.filter(p => {
      p.x += p.vx * dt; p.y += p.vy * dt; p.ttl -= dt;
      if (p.ttl <= 0 || p.x < 5 || p.x > W - 5 || p.y < 5 || p.y > H - 5 || walls.some(r => circleRect(p.x, p.y, 4, r))) return false;
      if (p.enemy) { if (distance(s.x, s.y, [p.x, p.y]) < 16) { this.damage(1); return false; } }
      else { const e = s.entities.find(e => e.hp > 0 && distance(e.x, e.y, [p.x, p.y]) < (e.kind === 2 ? 22 : 18)); if (e) { e.hp--; return false; } }
      return true;
    });
    if (s.entities.every(e => e.hp <= 0)) {
      s.progress++; s.projectiles = []; if (s.progress === this.c.waves!.length) { s.entities = []; s.status = 'won'; }
      else { this.spawnWave(); s.health = Math.min(9, s.health + 1); }
    }
  }
  private platform(dt: number, i: GameInput) {
    const s = this.s;
    const horizontal = Number(has(i, 'right')) - Number(has(i, 'left'));
    if (horizontal) s.direction = horizontal;
    if ((pressed(i, 'action') || pressed(i, 'up')) && s.jumps < 2) { s.vy = -435; s.jumps++; s.grounded = false; }
    if (pressed(i, 'alt') && s.cooldown <= 0) { s.dash = 0.14; s.cooldown = 0.9; }
    s.vx = s.dash > 0 ? s.direction * 480 : horizontal * 210;
    const previousBottom = s.y + 14;
    s.vy = Math.min(650, s.vy + 980 * dt);
    s.x = clamp(s.x + s.vx * dt, 14, W - 14); s.y += s.vy * dt; s.grounded = false;
    if (s.y < 14) { s.y = 14; s.vy = Math.max(0, s.vy); }
    if (s.vy >= 0) {
      const platform = this.c.platforms!.filter(([x, y, w]) => s.x + 11 > x && s.x - 11 < x + w && previousBottom <= y + 1 && s.y + 14 >= y).sort((a, b) => a[1] - b[1])[0];
      if (platform) { s.y = platform[1] - 14; s.vy = 0; s.grounded = true; s.jumps = 0; }
    }
    // Floating shelves are one-way: jump through from below, land on their illuminated tops.
    if (this.c.spikes!.some(r => circleRect(s.x, s.y, 12, r))) { this.damage(1, 1.4); s.vy = -360; }
    if (s.y > H + 55) s.health = 0;
    this.c.runes!.forEach((p, n) => { if (!s.items[n] && distance(s.x, s.y, p) < 30) { s.items[n] = true; s.progress++; } });
    if (s.items.every(Boolean) && distance(s.x, s.y, this.c.exit!) < 37) s.status = 'won';
  }
  view(): EngineView {
    const s = this.s, title = this.game.slug;
    const stats: EngineView['stats'] = title === 'ndp' ? [{ label: 'Gate', value: `${Math.min(s.progress, this.c.points!.length)}/${this.c.points!.length}` }, { label: 'Hull', value: `${Math.ceil(s.health)}%` }, { label: 'Boost', value: `${Math.floor(s.energy)}%` }]
      : title === 'osv' ? [{ label: 'Recovered', value: `${s.progress}/${s.items.length}` }, { label: 'Hull', value: `${Math.ceil(s.health)}%` }, { label: 'Tow', value: s.cargo >= 0 ? 'Loaded' : 'Empty' }]
      : title === 'slc' ? [{ label: 'Delivered', value: `${s.progress}/${s.items.length}` }, { label: 'Van', value: `${Math.ceil(s.health)}%` }, { label: 'Battery', value: `${Math.floor(s.energy)}%` }]
      : title === 'dpt' ? [{ label: 'Relics', value: `${s.progress}/${s.items.length}` }, { label: 'Air', value: `${s.energy.toFixed(1)}s` }]
      : title === 'gla' ? [{ label: 'Wave', value: `${Math.min(s.progress + 1, this.c.waves!.length)}/${this.c.waves!.length}` }, { label: 'Shield', value: s.health }, { label: 'Sentries', value: s.entities.filter(e => e.hp > 0).length }]
      : [{ label: 'Runes', value: `${s.progress}/${s.items.length}` }, { label: 'Hearts', value: s.health }, { label: 'Jump', value: s.jumps < 2 ? `${2 - s.jumps} available` : 'Land to refill' }];
    let message = '';
    if (s.status === 'lost') message = title === 'dpt' ? 'Your air ran out. Retry and plan stops at the bubble vents.' : title === 'rrn' ? 'The rift caught you. Retry the tower; all its runes are still within reach.' : 'Your craft is disabled. Retry the chapter and use braking, cover or evasive movement.';
    if (s.status === 'won') message = this.game.chapters[this.chapter].after;
    if (s.status === 'playing' && title === 'osv') message = s.cargo >= 0 ? 'Tow the cargo to the blue ring. Press Tractor inside the berth.' : 'Approach a gold crate and press Tractor. Hold Stabilize to stop.';
    if (s.status === 'playing' && title === 'slc') message = s.cargo >= 0 ? `Take parcel ${s.progress + 1} to its amber marker and press Deliver.` : 'Return to the blue depot and press Deliver to load the next parcel.';
    if (s.status === 'playing' && title === 'dpt') message = s.items.every(Boolean) ? 'All relics recovered. Reach the green seal and press Recover.' : 'Press Recover near a gold relic. Silver bubbles refill your air.';
    return { status: s.status, objective: this.game.chapters[this.chapter].objective, message, stats };
  }
  save(): Record<string, unknown> { return copy(this.s) as unknown as Record<string, unknown>; }
  render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save(); ctx.scale(width / W, height / H);
    const accent = this.game.palette[2], s = this.s;
    ctx.fillStyle = '#090d19'; ctx.fillRect(0, 0, W, H);
    const gradient = ctx.createRadialGradient(480, 230, 20, 480, 230, 560); gradient.addColorStop(0, this.game.palette[0]); gradient.addColorStop(1, '#060912'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.14; ctx.strokeStyle = accent; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } ctx.globalAlpha = 1;
    switch (this.game.slug) {
      case 'ndp': this.drawRace(ctx); break;
      case 'osv': this.drawSalvage(ctx); break;
      case 'slc': this.drawDelivery(ctx); break;
      case 'dpt': this.drawDive(ctx); break;
      case 'gla': this.drawArena(ctx); break;
      case 'rrn': this.drawPlatform(ctx); break;
    }
    if (this.game.slug !== 'rrn') this.drawCraft(ctx);
    ctx.fillStyle = '#060912cc'; ctx.fillRect(14, 13, 350, 31); ctx.fillStyle = accent; ctx.font = 'bold 14px monospace'; ctx.fillText(this.game.chapters[this.chapter].title.toUpperCase(), 26, 34);
    if (s.status === 'lost') { ctx.fillStyle = '#ff416822'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }
  private ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, label?: string) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.shadowBlur = 12; ctx.shadowColor = color;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; if (label) { ctx.fillStyle = color; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, x, y - radius - 10); } ctx.restore();
  }
  private box(ctx: CanvasRenderingContext2D, r: Rect, color: string) {
    ctx.fillStyle = '#0b1223'; ctx.fillRect(...r); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(...r);
    ctx.fillStyle = color + '55'; ctx.fillRect(r[0] + 4, r[1] + 4, r[2] - 8, 4);
  }
  private drawCraft(ctx: CanvasRenderingContext2D) {
    const s = this.s, accent = this.game.palette[2];
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle);
    if (s.hurt > 0 && Math.floor(s.time * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    if (this.game.slug === 'dpt') {
      ctx.fillStyle = accent; ctx.fillRect(-12, -7, 24, 14); ctx.fillStyle = '#ffffff'; ctx.fillRect(4, -5, 12, 10); ctx.fillStyle = '#ffe694'; ctx.fillRect(-19, -10, 6, 7); ctx.fillRect(-19, 3, 6, 7);
    } else if (this.game.slug === 'slc') {
      ctx.fillStyle = accent; ctx.fillRect(-17, -10, 34, 20); ctx.fillStyle = '#0b1325'; ctx.fillRect(4, -8, 8, 16); ctx.fillStyle = '#fff8db'; ctx.fillRect(15, -8, 3, 5); ctx.fillRect(15, 3, 3, 5);
    } else {
      ctx.fillStyle = accent; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(-14, -12); ctx.lineTo(-8, 0); ctx.lineTo(-14, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      const power = this.game.slug === 'ndp' ? Math.abs(s.vx) : length(s.vx, s.vy);
      if (power > 30) { ctx.fillStyle = this.game.palette[1]; ctx.beginPath(); ctx.moveTo(-12, -5); ctx.lineTo(-18 - Math.sin(s.time * 37) * 5 - power / 22, 0); ctx.lineTo(-12, 5); ctx.fill(); }
    }
    ctx.restore();
  }
  private drawRace(ctx: CanvasRenderingContext2D) {
    const points = this.c.points!, s = this.s, road = () => { ctx.beginPath(); points.forEach(([x, y], n) => n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; road(); ctx.strokeStyle = '#047e8355'; ctx.lineWidth = this.c.width! + 10; ctx.stroke();
    road(); ctx.strokeStyle = '#162137'; ctx.lineWidth = this.c.width!; ctx.stroke(); road(); ctx.strokeStyle = '#68d6cf44'; ctx.lineWidth = 2; ctx.setLineDash([14, 18]); ctx.stroke(); ctx.setLineDash([]);
    points.forEach((p, n) => { const active = n === s.progress % points.length; this.ring(ctx, p[0], p[1], active ? 43 : 31, active ? '#ffffff' : '#03f5d166', n === 0 ? 'FINISH' : String(n)); });
    this.c.mines!.forEach(([x, y]) => { this.ring(ctx, x, y, 22 + Math.sin(s.time * 3) * 3, '#ff44a9'); ctx.fillStyle = '#ff44a9'; ctx.fillRect(x - 6, y - 6, 12, 12); });
  }
  private drawSalvage(ctx: CanvasRenderingContext2D) {
    const s = this.s;
    for (let n = 0; n < 75; n++) { ctx.fillStyle = n % 3 ? '#8bacff77' : '#ffffff'; ctx.fillRect((n * 173 + 25) % W, (n * 97 + 12) % H, n % 3 ? 1 : 2, n % 3 ? 1 : 2); }
    this.c.rocks!.forEach(([x, y, r], n) => { ctx.fillStyle = '#313548'; ctx.strokeStyle = '#626680'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, rr = r * (0.87 + Math.sin(k * 7 + n) * 0.12); k ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke(); });
    this.ring(ctx, ...this.c.base!, 54, '#8bacff', 'UNLOAD / BERTH');
    this.c.pods!.forEach(([x, y], n) => { if (s.items[n] || s.cargo === n) return; this.box(ctx, [x - 13, y - 13, 26, 26], '#ffcc66'); ctx.fillStyle = '#ffcc66'; ctx.font = 'bold 13px monospace'; ctx.fillText(String(n + 1), x - 4, y + 5); });
    if (s.cargo >= 0) { const x = s.x - Math.cos(s.angle) * 35, y = s.y - Math.sin(s.angle) * 35; ctx.strokeStyle = '#ffcc66'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]); this.box(ctx, [x - 11, y - 11, 22, 22], '#ffcc66'); }
  }
  private drawDelivery(ctx: CanvasRenderingContext2D) {
    const s = this.s;
    this.c.buildings!.forEach((r, n) => { this.box(ctx, r, '#5f496d'); for (let x = r[0] + 17; x < r[0] + r[2] - 8; x += 23) for (let y = r[1] + 19; y < r[1] + r[3] - 8; y += 28) { ctx.fillStyle = (x + y + n) % 3 ? '#ffb65e88' : '#203049'; ctx.fillRect(x, y, 9, 8); } });
    this.ring(ctx, ...this.c.hub!, 45, '#67e8ff', 'DEPOT / CHARGE');
    this.c.stops!.forEach(([x, y], n) => { if (s.items[n]) return; this.ring(ctx, x, y, n === s.progress ? 31 : 20, n === s.progress ? '#ffb65e' : '#ffb65e55', String(n + 1)); });
    this.c.traffic!.forEach(([x, y, vx, vy]) => { const tx = 45 + ((x - 45 + vx * s.time) % 870 + 870) % 870, ty = 45 + ((y - 45 + vy * s.time) % 450 + 450) % 450; ctx.save(); ctx.translate(tx, ty); ctx.rotate(Math.atan2(vy, vx)); ctx.fillStyle = '#ff657d'; ctx.fillRect(-17, -9, 34, 18); ctx.fillStyle = '#ffbec8'; ctx.fillRect(8, -7, 5, 14); ctx.restore(); });
    if (s.cargo >= 0) { ctx.fillStyle = '#fff0ba'; ctx.fillRect(s.x - 4, s.y - 4, 8, 8); }
  }
  private drawDive(ctx: CanvasRenderingContext2D) {
    const s = this.s;
    ctx.fillStyle = '#78c8ea18'; ctx.fillRect(0, 45 + Math.sin(s.time) * 2, W, 24);
    this.c.walls!.forEach(r => { this.box(ctx, r, '#376474'); ctx.fillStyle = '#20423c'; for (let n = 0; n < r[2]; n += 12) ctx.fillRect(r[0] + n, r[1] - 4, 5, 8 + Math.sin(n) * 3); });
    this.c.currents!.forEach(([x, y, w, h, dx, dy]) => { ctx.fillStyle = '#59f2df10'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#59f2df66'; ctx.font = '20px monospace'; for (let px = x + 15; px < x + w; px += 48) for (let py = y + 25; py < y + h; py += 45) ctx.fillText(dx ? dx > 0 ? '›' : '‹' : dy > 0 ? '↓' : '↑', px, py); });
    this.c.air!.forEach(([x, y]) => { this.ring(ctx, x, y, 40, '#a8eaff77', 'AIR'); for (let n = 0; n < 6; n++) { ctx.strokeStyle = '#c0f6ff'; ctx.beginPath(); ctx.arc(x + Math.sin(n * 8 + s.time) * 20, y + 26 - ((s.time * 25 + n * 15) % 55), 3 + n % 3, 0, Math.PI * 2); ctx.stroke(); } });
    this.c.relics!.forEach(([x, y], n) => { if (s.items[n]) return; ctx.save(); ctx.translate(x, y); ctx.rotate(s.time * 0.6); ctx.fillStyle = '#ffe694'; ctx.shadowColor = '#ffe694'; ctx.shadowBlur = 15; ctx.fillRect(-9, -9, 18, 18); ctx.restore(); });
    this.ring(ctx, ...this.c.exit!, 31, s.items.every(Boolean) ? '#9bffa4' : '#517a66', 'EXIT SEAL');
  }
  private drawArena(ctx: CanvasRenderingContext2D) {
    const s = this.s; this.c.walls!.forEach(r => this.box(ctx, r, '#657362'));
    s.entities.forEach(e => { if (e.hp <= 0) return; const r = e.kind === 2 ? 21 : 16; ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.phase * (e.kind === 2 ? 0.4 : 1.2)); ctx.fillStyle = e.kind === 1 ? '#ffb565' : '#ff657d'; ctx.strokeStyle = '#ffb7bf'; ctx.lineWidth = 2; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.strokeRect(-r, -r, r * 2, r * 2); ctx.fillStyle = '#111521'; ctx.fillRect(-6, -6, 12, 12); ctx.restore(); ctx.fillStyle = '#ff657d'; ctx.fillRect(e.x - 18, e.y - r - 9, 36 * e.hp / (e.kind === 2 ? 7 : e.kind === 1 ? 4 : 3), 4); });
    s.projectiles.forEach(p => { ctx.fillStyle = p.enemy ? '#ff657d' : '#b6ff5c'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(p.x, p.y, p.enemy ? 5 : 3.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });
    if (s.dash > 0) this.ring(ctx, s.x, s.y, 25, '#b6ff5c');
  }
  private drawPlatform(ctx: CanvasRenderingContext2D) {
    const s = this.s;
    for (let n = 0; n < 35; n++) { ctx.fillStyle = '#a3a4ff66'; ctx.fillRect((n * 173 + 25) % W, (n * 97 + 12) % H, 2, 2); }
    this.c.platforms!.forEach(r => { this.box(ctx, r, '#a3a4ff'); ctx.fillStyle = '#a3a4ff44'; for (let x = r[0] + 7; x < r[0] + r[2]; x += 18) ctx.fillRect(x, r[1] + 7, 7, Math.min(r[3] - 7, 10)); });
    this.c.spikes!.forEach(([x, y, w, h]) => { ctx.fillStyle = '#ff657d'; for (let a = x; a < x + w; a += 16) { ctx.beginPath(); ctx.moveTo(a, y + h); ctx.lineTo(a + 8, y); ctx.lineTo(a + 16, y + h); ctx.fill(); } });
    this.c.runes!.forEach(([x, y], n) => { if (s.items[n]) return; ctx.save(); ctx.translate(x, y + Math.sin(s.time * 3 + n) * 3); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#fff19a'; ctx.shadowColor = '#fff19a'; ctx.shadowBlur = 12; ctx.fillRect(-8, -8, 16, 16); ctx.restore(); });
    this.ring(ctx, ...this.c.exit!, 26, s.items.every(Boolean) ? '#fff19a' : '#73718e', 'PORTAL');
    ctx.save(); ctx.translate(s.x, s.y); if (s.hurt > 0 && Math.floor(s.time * 14) % 2 === 0) ctx.globalAlpha = 0.4; ctx.fillStyle = '#a3a4ff'; ctx.fillRect(-10, -13, 20, 24); ctx.fillStyle = '#f0efff'; ctx.fillRect(s.direction > 0 ? 1 : -8, -10, 7, 6); ctx.fillStyle = '#7476cf'; ctx.fillRect(-10, 9, 8, 5); ctx.fillRect(2, 9, 8, 5); ctx.restore();
  }
}

export const createActionEngine: EngineFactory = options => new ActionEngine(options);
