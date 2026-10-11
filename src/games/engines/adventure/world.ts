import type { EngineOptions, EngineView, GameEngine, GameEvent, GameInput, GameStatus } from "../../types";
import { drawSprite } from "../../art";
import { ground, landmark, mechanism, wall } from "./scenery";

type Kind = "hcr" | "eov" | "ibl" | "sws";
type Progress = { v: 2; slug: Kind; coins: number; xp: number; blade: number; heart: number; tool: number; mast: number; rewards: string[] };
type Actor = { id: number; x: number; y: number; hp: number; max: number; phase: number; clock: number; kind: number };
type Shot = { x: number; y: number; vx: number; vy: number; life: number; hostile: boolean };
type State = { player: { x: number; y: number; vx: number; vy: number; angle: number; hp: number; stamina: number }; time: number; cooldown: number; hurt: number; dash: number; swing: number; picked: number[]; planted: { id: number; birth: number }[]; work: { id: number; hits: number }[]; wood: number; ore: number; blooms: number; supplies: number; beacons: number[]; puzzle: number[]; memory: number; crafted: boolean; side: boolean; lens: boolean; panel: string; enemies: Actor[]; shots: Shot[]; message: string; status: GameStatus; progress: Progress };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
const TILE = 92, W = 16 * TILE, H = 9 * TILE;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16); };
const integer = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: string[]) => object(v) && Object.keys(v).sort().join() === [...names].sort().join();
const finite = (v: unknown, min = 0, max = 1e6): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const hypot = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const center = (id: number) => ({ x: (id % 16 + .5) * TILE, y: (Math.floor(id / 16) + .5) * TILE });
const labels = ["SUN", "WAVE", "ROOT", "MOON"];

export class AdventureWorld implements GameEngine {
  private kind: Kind;
  private map: string;
  private s: State;
  private initialActors: Actor[];
  private particles: Particle[] = [];
  private feedback: GameEvent[] = [];
  private npc: { x: number; y: number };
  private caches: number[];
  private signature: string;
  constructor(private options: EngineOptions) {
    const { campaign, chapterIndex } = options;
    if (!["hcr", "eov", "ibl", "sws"].includes(campaign.slug) || !integer(chapterIndex, 0, 5)) throw new Error("Unknown adventure chapter");
    this.kind = campaign.slug as Kind;
    const cfg = this.config(), rows = cfg.map as string[];
    if (!Array.isArray(rows) || rows.length !== 9 || rows.some(row => typeof row !== "string" || row.length !== 16)) throw new Error("Invalid adventure world");
    this.map = rows.join(""); this.signature = hash(JSON.stringify(cfg));
    const start = center(this.ids("S")[0]);
    this.npc = { x: start.x + 130, y: start.y + 28 };
    this.caches = this.ids(".").filter(id => Math.floor(id / 16) > 2).filter((_, i) => i % 16 === 7).slice(0, 2);
    if (this.kind === "sws") this.caches = this.ids("~").filter(id => Math.floor(id / 16) > 2).filter((_, i) => i % 18 === 8).slice(0, 2);
    const base: Progress = { v: 2, slug: this.kind, coins: 0, xp: 0, blade: 0, heart: 0, tool: 0, mast: 0, rewards: [] };
    const progress = options.progression ? this.validateProgress(options.progression) : base;
    const foes = this.kind === "hcr" ? this.ids("MB") : this.kind === "sws" && chapterIndex >= 2 ? this.ids("X") : [];
    this.initialActors = foes.map((id, i) => ({ id, ...center(id), hp: this.kind === "hcr" ? this.map[id] === "B" ? chapterIndex === 5 && i === foes.length - 1 ? 130 : 56 : 24 : chapterIndex === 5 ? 80 : 48, max: 0, phase: 0, clock: 1 + i * .2, kind: this.kind === "sws" ? 3 : this.map[id] === "B" ? chapterIndex === 5 && i === foes.length - 1 ? 2 : 1 : 0 })).map(a => ({ ...a, max: a.hp }));
    this.s = { player: { ...start, vx: 0, vy: 0, angle: 0, hp: 100 + progress.heart * 20, stamina: 100 }, time: 0, cooldown: 0, hurt: 0, dash: 0, swing: 0, picked: [], planted: [], work: [], wood: 0, ore: 0, blooms: 0, supplies: 0, beacons: [], puzzle: this.kind === "eov" ? [0, 0, 0, 0] : [], memory: 0, crafted: false, side: false, lens: false, panel: "", enemies: clone(this.initialActors), shots: [], message: String(cfg.arrival ?? "Explore the world. Find its keeper, recover supplies and follow the landmark to your objective."), status: "playing", progress };
    if (options.restored) this.restore(options.restored);
  }
  private config() { return this.options.campaign.chapters[this.options.chapterIndex].config; }
  private ids(chars: string) { return [...this.map].map((c, id) => chars.includes(c) ? id : -1).filter(id => id >= 0); }
  private maxHp() { return 100 + this.s.progress.heart * 20; }
  private folioClue() {
    const total = this.ids("F").length, found = this.ids("F").filter(id => this.s.picked.includes(id)).length;
    if (found === total) return String(this.config().clue);
    if (!found) return "Recover the scattered folios to reveal this district's mechanism clue.";
    const chapter = this.options.chapterIndex;
    if ([1, 2].includes(chapter)) { const settings = chapter === 1 ? [3, 2, 0, 1] : [2, 0, 1, 3]; return `Folio ${found}/${total}: ${chapter === 1 ? "river valves" : "living shelves"}, west to east: ${settings.slice(0, Math.ceil(settings.length * found / total)).join(", ")}, … Recover the remaining pages.`; }
    return `Folio ${found}/${total}: ${this.sequence().slice(0, Math.ceil(this.sequence().length * found / total)).map(n => labels[n - 1]).join(" → ")} → … Recover the remaining pages.`;
  }
  private event(type: GameEvent["type"], strength = 1) { this.feedback.push({ type, strength }); }
  events() { return this.feedback.splice(0); }
  progression() { return clone(this.validateProgress(this.s.progress)); }
  private validateProgress(value: unknown): Progress {
    if (!keys(value, ["v", "slug", "coins", "xp", "blade", "heart", "tool", "mast", "rewards"]) || !object(value) || value.v !== 2 || value.slug !== this.kind || !integer(value.coins, 0, 10000) || !integer(value.xp, 0, 10000) || ![value.blade, value.heart, value.tool, value.mast].every(n => integer(n, 0, 5)) || !Array.isArray(value.rewards) || value.rewards.length > 250 || value.rewards.some(v => typeof v !== "string" || !/^[0-5]:(enemy|find|side|finish):\d+$/.test(v) || !integer(Number(v.split(":")[2]), 0, 143) || v.includes(":side:") && !v.endsWith(":0") || v.includes(":finish:") && Number(v.split(":")[2]) > 1) || new Set(value.rewards).size !== value.rewards.length) throw new Error("Invalid adventure progression");
    if (this.kind !== "ibl" && value.tool !== 0 || this.kind !== "sws" && value.mast !== 0 || this.kind === "eov" && (value.blade !== 0 || value.heart !== 0) || this.kind === "ibl" && value.blade !== 0) throw new Error("Invalid adventure progression equipment");
    return clone(value) as Progress;
  }
  private reward(type: string, id: number, coins: number, xp = 1) {
    const key = `${this.options.chapterIndex}:${type}:${id}`;
    if (this.s.progress.rewards.includes(key)) return;
    this.s.progress.rewards.push(key); this.s.progress.coins += coins; this.s.progress.xp += xp;
  }
  save() { const data = clone(this.s); return { v: 2, slug: this.kind, chapter: this.options.chapterIndex, signature: this.signature, data, checksum: hash(JSON.stringify(data)) }; }
  private restore(raw: Record<string, unknown>) {
    const fail = () => { throw new Error("Invalid adventure save; restart this chapter"); };
    if (!keys(raw, ["v", "slug", "chapter", "signature", "data", "checksum"]) || raw.v !== 2 || raw.slug !== this.kind || raw.chapter !== this.options.chapterIndex || raw.signature !== this.signature || !object(raw.data) || raw.checksum !== hash(JSON.stringify(raw.data))) fail();
    const d = raw.data as State;
    if (!keys(d, Object.keys(this.s)) || !keys(d.player, Object.keys(this.s.player))) fail();
    const p = d.player;
    if (!finite(p.x, 30, W - 30) || !finite(p.y, 30, H - 30) || ![p.vx, p.vy].every(n => finite(n, -500, 500)) || !finite(p.angle, -Math.PI, Math.PI) || !finite(p.stamina, 0, 100)) fail();
    const prog = this.validateProgress(d.progress);
    if (!finite(p.hp, 0, 100 + prog.heart * 20) || !finite(d.time) || ![d.cooldown, d.hurt, d.dash, d.swing].every(n => finite(n, 0, 3))) fail();
    const validIds = (arr: unknown, permitted: number[]) => Array.isArray(arr) && new Set(arr).size === arr.length && arr.every(id => integer(id, 0, 143) && permitted.includes(id));
    if (!validIds(d.picked, [...this.ids("KHFWO G"), ...this.caches]) || !validIds(d.beacons, this.kind === "sws" ? this.ids("B") : [])) fail();
    if (!Array.isArray(d.planted) || d.planted.length > this.ids("P").length || (this.kind !== "ibl" && d.planted.length > 0) || new Set(d.planted.map(b => b.id)).size !== d.planted.length || d.planted.some(b => !keys(b, ["id", "birth"]) || !this.ids("P").includes(b.id) || !finite(b.birth, 0, d.time))) fail();
    if (!Array.isArray(d.work) || d.work.length > this.ids("WO").length || new Set(d.work.map(w => w.id)).size !== d.work.length || d.work.some(b => !keys(b, ["id", "hits"]) || !this.ids("WO").includes(b.id) || !integer(b.hits, 0, 4))) fail();
    if (![d.wood, d.ore, d.blooms, d.supplies].every(n => integer(n, 0, 1000)) || !integer(d.memory, 0, (this.config().sequence as number[] | undefined)?.length ?? 0) || !Array.isArray(d.puzzle) || d.puzzle.length !== (this.kind === "eov" ? 4 : 0) || d.puzzle.some(n => !integer(n, 0, 3))) fail();
    const panelTypes = this.kind === "eov" ? ["", "npc", "puzzle"] : this.kind === "ibl" ? ["", "npc", "craft"] : ["", "npc", "upgrade"];
    if (![d.crafted, d.side, d.lens].every(n => typeof n === "boolean") || !panelTypes.includes(d.panel) || typeof d.message !== "string" || d.message.length > 1000 || !["playing", "won", "lost"].includes(d.status) || this.kind !== "ibl" && (d.crafted || d.wood !== 0 || d.ore !== 0 || d.blooms !== 0) || this.kind !== "sws" && d.supplies !== 0 || this.kind !== "eov" && d.lens) fail();
    if (!Array.isArray(d.enemies) || d.enemies.length !== this.initialActors.length || d.enemies.some((a, i) => !keys(a, Object.keys(this.initialActors[i])) || a.id !== this.initialActors[i].id || a.kind !== this.initialActors[i].kind || a.max !== this.initialActors[i].max || !integer(a.hp, 0, a.max) || !finite(a.x, 30, W - 30) || !finite(a.y, 30, H - 30) || !integer(a.phase, 0, 2) || !finite(a.clock, -1, 10))) fail();
    if (!Array.isArray(d.shots) || d.shots.length > 100 || d.shots.some(b => !keys(b, ["x", "y", "vx", "vy", "life", "hostile"]) || ![b.x, b.y, b.vx, b.vy].every(n => finite(n, -2000, 4000)) || !finite(b.life, 0, 3) || typeof b.hostile !== "boolean")) fail();
    this.s = clone(d);
    if ((this.s.status === "lost") !== (p.hp === 0) || this.s.status === "won" && (!this.goal() || hypot(this.s.player, center(this.ids("E")[0])) >= 74)) fail();
  }
  private burst(x: number, y: number, color: string, amount = 12) { for (let i = 0; i < amount; i++) { const a = i * 2.399; this.particles.push({ x, y, vx: Math.cos(a) * (40 + i * 3), vy: Math.sin(a) * (40 + i * 3), life: .6, color }); } }
  private locked() { return this.kind === "hcr" ? this.ids("K").some(id => !this.s.picked.includes(id)) : this.kind === "eov" ? !this.solved() : this.kind === "ibl" ? !this.s.crafted : false; }
  private blocked(x: number, y: number, radius = 19) {
    if (x < TILE + radius || y < TILE + radius || x > W - TILE - radius || y > H - TILE - radius) return true;
    for (const id of this.ids("#DR")) {
      const tile = this.map[id]; if (tile === "D" && !this.locked() || tile === "R" && (this.kind !== "sws" || Math.floor(this.s.time / 6) % 2 === 1)) continue;
      const c = center(id), rx = c.x - TILE / 2, ry = c.y - TILE / 2;
      if (Math.hypot(x - clamp(x, rx, rx + TILE), y - clamp(y, ry, ry + TILE)) < radius) return true;
    }
    return false;
  }
  private moveActor(a: { x: number; y: number }, dx: number, dy: number, radius = 19) { if (!this.blocked(a.x + dx, a.y, radius)) a.x += dx; if (!this.blocked(a.x, a.y + dy, radius)) a.y += dy; }
  private damage(amount: number) {
    if (this.s.hurt > 0 || this.s.dash > 0) return;
    this.s.player.hp = Math.max(0, this.s.player.hp - amount); this.s.hurt = .7; this.burst(this.s.player.x, this.s.player.y, "#f98786"); this.event("hit");
    if (this.s.player.hp === 0) { this.s.status = "lost"; this.s.panel = ""; this.s.message = "Your journey pauses here. Retry with your earned equipment and a better plan."; this.event("fail"); }
  }
  private shoot(from: { x: number; y: number }, to: { x: number; y: number }, hostile: boolean, speed = 350) { const a = Math.atan2(to.y - from.y, to.x - from.x); this.s.shots.push({ x: from.x, y: from.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 2.5, hostile }); this.event("shoot", hostile ? .4 : 1); }
  private kill(a: Actor) { if (a.hp > 0) return; this.reward("enemy", a.id, a.kind === 2 ? 30 : 12, 4); this.burst(a.x, a.y, "#f3ca7a", 22); this.s.message = a.kind === 2 ? "The Hollow King falls. Carry the crown into the public square." : "A guardian falls. Salvaged crowns can improve your equipment."; this.event("success", .4); }
  private sequence() { return this.config().sequence as number[]; }
  private solved() { const chapter = this.options.chapterIndex; return [1, 2].includes(chapter) ? this.s.puzzle.every((n, i) => n === ([1, 3, 2, 0][(i + chapter) % 4])) : chapter === 5 ? this.s.memory === this.sequence().length && this.s.puzzle.every(n => n === 1) : this.s.memory === this.sequence().length; }
  private goal() { const s = this.s; return this.kind === "hcr" ? this.ids("K").every(id => s.picked.includes(id)) && s.enemies.every(a => a.hp === 0) : this.kind === "eov" ? this.ids("F").every(id => s.picked.includes(id)) && this.solved() : this.kind === "ibl" ? s.crafted : this.ids("G").every(id => s.picked.includes(id)) && this.ids("B").every(id => s.beacons.includes(id)) && (this.options.chapterIndex !== 5 || s.enemies.every(a => a.hp === 0)); }
  private interact() {
    const s = this.s, p = s.player;
    const props = [...this.ids(this.kind === "hcr" ? "KH" : this.kind === "eov" ? "F1234" : this.kind === "ibl" ? "WOPH" : "GB"), ...this.caches].filter(id => !s.picked.includes(id) || this.map[id] === "P" || /[1-4]/.test(this.map[id]) || this.map[id] === "B" && !s.beacons.includes(id)).sort((a, b) => hypot(p, center(a)) - hypot(p, center(b)));
    const id = props[0], point = center(id), tile = this.map[id];
    if (id !== undefined && hypot(p, point) < 74) {
      if (this.caches.includes(id)) { s.picked.push(id); this.reward("find", id, 15, 2); s.message = "A hidden expedition cache: 15 crowns and a keeper's note. Two caches complete the optional request."; }
      else if (tile === "K" || tile === "F" || tile === "H" || tile === "G") {
        s.picked.push(id); this.reward("find", id, tile === "G" ? 10 : 5);
        s.message = tile === "F" ? `Archive folio recovered. ${this.folioClue()}` : tile === "G" ? "Recovered a landmark chart and 2 supplies. Beacons each need one." : tile === "K" ? "The ember lights a name inside your crown." : "A keeper's supplies restore 35 health.";
        if (tile === "H") p.hp = Math.min(this.maxHp(), p.hp + 35); if (tile === "G") s.supplies += 2;
      } else if (tile === "W" || tile === "O") {
        let work = s.work.find(a => a.id === id); if (!work) { work = { id, hits: 0 }; s.work.push(work); }
        work.hits++; this.burst(point.x, point.y, tile === "W" ? "#ae8253" : "#b5c6cd", 5); this.event("strike", .4);
        if (work.hits >= Math.max(1, (tile === "W" ? 3 : 4) - s.progress.tool)) { s.picked.push(id); if (tile === "W") s.wood++; else s.ore++; s.message = `${tile === "W" ? "Timber" : "Ore"} harvested. Tool upgrades make gathering faster.`; this.reward("find", id, 2); }
      } else if (tile === "P") {
        const bed = s.planted.find(b => b.id === id);
        if (!bed && s.wood > 0) { s.wood--; s.planted.push({ id, birth: s.time }); s.message = "Ironflower planted. It blooms in eight seconds and regrows after harvest."; }
        else if (bed && s.time - bed.birth >= 8) { s.blooms++; bed.birth = s.time; this.reward("find", id, 6); s.message = "Harvested an ironflower. This bed will regrow; extra flowers can help your neighbor."; }
        else s.message = bed ? "The seedling is growing. Explore, gather or tend another bed while it matures." : "Planting needs one timber beam.";
      } else if (tile === "B") { if (!s.beacons.includes(id) && s.supplies > 0) { s.supplies--; s.beacons.push(id); s.message = "A lighthouse cuts through the fog. The returning fleet answers."; this.event("success", .4); } else s.message = "A beacon needs one salvaged supply."; }
      else if (/[1-4]/.test(tile)) { if (!this.ids("F").every(f => s.picked.includes(f))) s.message = "Recover the folios before working this mechanism."; else { s.panel = "puzzle"; s.message = `Working the ${String(this.config().setpiece)}. ${String(this.config().clue)}`; } }
      this.burst(point.x, point.y, "#e6cf91", 8); this.event("collect", .5); return;
    }
    if (hypot(p, this.npc) < 82) { s.panel = "npc"; this.event("dialogue"); return; }
    if (hypot(p, center(this.ids("E")[0])) < 90 && !this.goal()) s.message = "This route opens when the chapter objective is complete. Check your journal and the keeper's advice.";
  }
  choose(id: string) {
    const s = this.s;
    if (s.status !== "playing") return;
    if (id === "close") { s.panel = ""; return; }
    if (s.panel === "npc") {
      if (id === "talk") { s.message = String(this.config().dialogue); this.event("dialogue"); }
      if (id === "request") { const ready = this.kind === "ibl" ? s.blooms > 0 : this.caches.every(cache => s.picked.includes(cache)); if (ready && !s.side) { if (this.kind === "ibl") s.blooms--; s.side = true; this.reward("side", 0, 20, 3); s.message = "The keeper's request is complete. Earned 20 crowns; your help is remembered."; this.event("success"); } else s.message = this.kind === "ibl" ? "Bring one spare ironflower after your repair. Your planted beds keep producing." : "Recover the two hidden expedition caches, then return for your reward."; }
      s.panel = ""; return;
    }
    const pHeal = () => { s.player.hp = this.maxHp(); };
    if (id.startsWith("buy:") && ["upgrade", "craft"].includes(s.panel)) {
      const stat = id.slice(4) as "blade" | "heart" | "tool" | "mast";
      const available = this.kind === "ibl" ? ["tool", "heart"] : this.kind === "sws" ? ["mast", "blade", "heart"] : ["blade", "heart"];
      if (!available.includes(stat)) return;
      const price = 15 + s.progress[stat] * 10;
      if (s.progress[stat] < 5 && s.progress.coins >= price) { s.progress.coins -= price; s.progress[stat]++; pHeal(); s.message = "Equipment upgraded. This improvement carries into later chapters."; this.event("craft"); }
      return;
    }
    if (s.panel === "craft" && id === "build") {
      const c = this.config();
      if (!s.crafted && s.wood >= Number(c.wood) && s.ore >= Number(c.ore) && s.blooms >= Number(c.bloom)) { s.wood -= Number(c.wood); s.ore -= Number(c.ore); s.blooms -= Number(c.bloom); s.crafted = true; this.reward("finish", 0, 20, 3); s.message = `The ${String(c.setpiece)} comes to life. The route into the next district is open.`; this.event("craft"); s.panel = ""; }
    }
    if (s.panel === "upgrade" && id === "repair") { const needed = this.ids("B").length - s.beacons.length; if (s.supplies > needed && s.player.hp < this.maxHp()) { s.supplies--; s.player.hp = Math.min(this.maxHp(), s.player.hp + 40); this.event("craft"); } }
    if (s.panel === "puzzle") {
      const chapter = this.options.chapterIndex;
      if (id.startsWith("rotate:")) { const i = Number(id.slice(7)); if (integer(i, 0, 3)) { s.puzzle[i] = (s.puzzle[i] + 1) % 4; this.event("engine", .5); } }
      if (id.startsWith("rune:") && ![1, 2].includes(chapter)) { const n = Number(id.slice(5)); if (n === this.sequence()[s.memory]) { s.memory++; this.event("success", .3); } else { s.memory = 0; s.message = "The mechanism resets gently. Consult the recovered folios and try the order again."; this.event("engine", .3); } }
      if (this.solved()) { s.panel = ""; s.message = "The mechanism resolves. Its light opens the archive passage."; this.reward("finish", 0, 20, 3); this.event("success"); }
    }
  }
  update(dt: number, input: GameInput) {
    const s = this.s; if (s.status !== "playing" || s.panel || !finite(dt, 0, 10)) return;
    let remaining = Math.min(.25, dt), first = true;
    while (remaining > .000001 && s.status === "playing" && !s.panel) { const step = Math.min(1 / 60, remaining); this.tick(step, first ? input : { ...input, pressed: new Set() }); remaining -= step; first = false; }
  }
  private tick(dt: number, input: GameInput) {
    const s = this.s, p = s.player;
    s.time += dt; s.cooldown = Math.max(0, s.cooldown - dt); s.hurt = Math.max(0, s.hurt - dt); s.dash = Math.max(0, s.dash - dt); s.swing = Math.max(0, s.swing - dt); p.stamina = Math.min(100, p.stamina + dt * 25);
    let ax = Number(input.held.has("right")) - Number(input.held.has("left")), ay = Number(input.held.has("down")) - Number(input.held.has("up"));
    if (input.pointer?.down) { const camera = this.camera(); const dx = input.pointer.x + camera.x - p.x, dy = input.pointer.y + camera.y - p.y, l = Math.hypot(dx, dy); if (l > 25) { ax = dx / l; ay = dy / l; } }
    const len = Math.hypot(ax, ay); if (len > 0) { ax /= len; ay /= len; p.angle = Math.atan2(ay, ax); }
    if (input.pressed.has("alt")) {
      if (this.kind === "hcr" && len > 0) { if (p.stamina >= 30) { s.dash = .24; p.stamina -= 30; this.event("dash"); } else s.message = "Dodge needs 30 stamina. Keep moving while it recovers."; }
      else if (this.kind === "eov") { s.lens = !s.lens; s.message = s.lens ? `Memory lens: ${this.folioClue()}` : "The archive's ordinary light returns."; this.event("engine", .3); }
      else { s.panel = this.kind === "ibl" ? "craft" : "upgrade"; this.event("dialogue", .4); return; }
    }
    const speed = s.dash > 0 ? 480 : this.kind === "sws" ? 185 + s.progress.mast * 15 : 185;
    if (this.kind === "sws") { const wind = Math.sin(s.time * .13 + this.options.chapterIndex) * 18; p.vx += (ax * speed + wind - p.vx) * dt * (input.held.has("alt") ? 8 : 2); p.vy += (ay * speed - p.vy) * dt * 2; }
    else { p.vx = ax * speed; p.vy = ay * speed; }
    this.moveActor(p, p.vx * dt, p.vy * dt, this.kind === "sws" ? 23 : 18);
    const pointerAction = input.pointer?.pressed && Math.hypot(input.pointer.x + this.camera().x - p.x, input.pointer.y + this.camera().y - p.y) < 75;
    if ((input.held.has("action") || input.pressed.has("action") || pointerAction) && s.cooldown <= 0) {
      s.cooldown = this.kind === "ibl" ? .3 : .36;
      const target = s.enemies.filter(a => a.hp > 0).sort((a, b) => hypot(p, a) - hypot(p, b))[0];
      if (this.kind === "hcr" && target && hypot(p, target) < 112 && [0.25, 0.5, 0.75].every(t => !this.blocked(p.x + (target.x - p.x) * t, p.y + (target.y - p.y) * t, 3))) { p.angle = Math.atan2(target.y - p.y, target.x - p.x); target.hp = Math.max(0, target.hp - (10 + s.progress.blade * 3)); s.swing = .18; this.burst(target.x, target.y, "#edc785", 8); this.event("strike"); this.kill(target); }
      else if (this.kind === "sws" && target && hypot(p, target) < 450) this.shoot(p, target, false, 480);
      else this.interact();
    }
    if (s.panel) return;
    for (const a of s.enemies) {
      if (a.hp <= 0) continue;
      const d = hypot(p, a); if (d > (this.kind === "sws" ? 600 : 370)) continue;
      a.clock = Math.max(-1, a.clock - dt);
      if (a.phase === 0) { if (d > (a.kind === 3 ? 260 : 74)) { const speed = a.kind === 0 ? 87 : a.kind === 3 ? 52 : 55; this.moveActor(a, (p.x - a.x) / d * dt * speed, (p.y - a.y) / d * dt * speed, 22); } if (a.clock <= 0 && d < (a.kind === 3 ? 500 : a.kind === 2 ? 240 : 110)) { a.phase = 1; a.clock = a.kind === 2 ? .8 : .6; } }
      else if (a.phase === 1 && a.clock <= 0) { if (a.kind === 3 || a.kind === 2 && a.hp < a.max * .65) { this.shoot(a, p, true, a.kind === 2 ? 240 : 200); if (a.kind === 2 && a.hp < a.max * .3) { this.shoot(a, { x: p.x - 60, y: p.y }, true, 240); this.shoot(a, { x: p.x + 60, y: p.y }, true, 240); } } else if (d < 120) this.damage(a.kind === 0 ? 7 : 12); a.phase = 2; a.clock = 1.25; }
      else if (a.phase === 2 && a.clock <= 0) { a.phase = 0; a.clock = .5; }
    }
    s.shots = s.shots.filter(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0 || this.blocked(b.x, b.y, 4)) return false; if (b.hostile && hypot(b, p) < 25) { this.damage(9); return false; } const hit = !b.hostile && s.enemies.find(a => a.hp > 0 && hypot(a, b) < 32); if (hit) { hit.hp = Math.max(0, hit.hp - 12 - s.progress.blade * 3); this.burst(hit.x, hit.y, "#ffd397"); this.kill(hit); return false; } return true; });
    if (this.kind === "ibl" && !s.crafted && this.options.chapterIndex >= 2 && Math.hypot(p.x - 750, p.y - 535) < 78 && Math.floor(s.time / 3) !== Math.floor((s.time - dt) / 3)) this.damage(2);
    if (this.kind === "sws" && len > 0 && Math.floor(s.time * 8) !== Math.floor((s.time - dt) * 8)) this.particles.push({ x: p.x - Math.cos(p.angle) * 34, y: p.y - Math.sin(p.angle) * 34, vx: 0, vy: 0, life: .6, color: "#bce0e7" });
    if (len > 0 && Math.floor(s.time * 2.5) !== Math.floor((s.time - dt) * 2.5)) this.event(this.kind === "sws" ? "splash" : "step", .25);
    if (this.kind === "sws" && this.ids("X").some(id => hypot(p, center(id)) < 90) && Math.floor(s.time / 2) !== Math.floor((s.time - dt) / 2)) this.damage(2);
    this.particles = this.particles.filter(a => { a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt; return a.life > 0; });
    if (s.status === "playing" && this.goal() && hypot(p, center(this.ids("E")[0])) < 74) { s.status = "won"; this.reward("finish", 1, 20, 3); s.message = this.options.campaign.chapters[this.options.chapterIndex].after; this.event("success"); }
  }
  private camera() { return { x: clamp(this.s.player.x - 480, 0, W - 960), y: clamp(this.s.player.y - 280, 0, H - 540) }; }
  view(): EngineView {
    const s = this.s, c = this.config(), p = s.player;
    const choices: NonNullable<EngineView["choices"]> = [];
    if (s.panel === "npc") choices.push({ id: "talk", label: "Ask the keeper", description: String(c.dialogue) }, { id: "request", label: s.side ? "Request complete" : "Help the keeper", description: this.kind === "ibl" ? "Bring one spare ironflower. Reward: 20 crowns." : "Find two hidden caches. Reward: 20 crowns.", disabled: s.side });
    if (["upgrade", "craft"].includes(s.panel)) {
      const stats = this.kind === "ibl" ? ["tool", "heart"] : this.kind === "sws" ? ["mast", "blade", "heart"] : ["blade", "heart"];
      for (const name of stats as ("tool" | "heart" | "mast" | "blade")[]) { const price = 15 + s.progress[name] * 10; choices.push({ id: `buy:${name}`, label: `${{ tool: "Sharper tools", heart: "Stronger vitality", mast: "Canvas & mast", blade: this.kind === "sws" ? "Cannon upgrade" : "Tempered blade" }[name]} · ${price} crowns`, description: `Level ${s.progress[name]}/5. Persists through the campaign.`, disabled: s.progress[name] >= 5 || s.progress.coins < price }); }
      if (this.kind === "ibl") choices.unshift({ id: "build", label: `Build ${String(c.setpiece)}`, description: `${c.wood} timber, ${c.ore} ore, ${c.bloom} blooms`, disabled: s.crafted || s.wood < Number(c.wood) || s.ore < Number(c.ore) || s.blooms < Number(c.bloom) });
      if (this.kind === "sws") choices.unshift({ id: "repair", label: "Repair 40 hull · 1 supply", description: "Beacon supplies are protected from accidental spending.", disabled: s.supplies <= this.ids("B").length - s.beacons.length || p.hp >= this.maxHp() });
    }
    if (s.panel === "puzzle") {
      const chapter = this.options.chapterIndex;
      if (![1, 2].includes(chapter)) for (let i = 1; i <= 4; i++) choices.push({ id: `rune:${i}`, label: `${labels[i - 1]} ${chapter === 4 ? "testimony" : "memory"}`, description: `Recovered order: ${this.sequence().map(n => labels[n - 1]).join(" → ")}. Step ${s.memory + 1}.` });
      if ([1, 2, 5].includes(chapter)) for (let i = 0; i < 4; i++) choices.push({ id: `rotate:${i}`, label: `${chapter === 1 ? "Water valve" : chapter === 2 ? "Rotating shelf" : "Public light"} ${i + 1}: ${s.puzzle[i]}`, description: String(c.clue) });
    }
    if (s.panel) choices.push({ id: "close", label: "Return to the world" });
    const stats = [{ label: this.kind === "sws" ? "Hull" : "Health", value: `${Math.ceil(p.hp)}/${this.maxHp()}` }, { label: "Crowns", value: s.progress.coins }, { label: "Experience", value: s.progress.xp }];
    if (this.kind === "hcr") stats.push({ label: "Embers", value: `${this.ids("K").filter(id => s.picked.includes(id)).length}/${this.ids("K").length}` }, { label: "Dodge stamina", value: Math.floor(p.stamina) });
    if (this.kind === "eov") stats.push({ label: "Folios", value: `${this.ids("F").filter(id => s.picked.includes(id)).length}/${this.ids("F").length}` }, { label: "Mechanism", value: this.solved() ? "Restored" : "Sealed" });
    if (this.kind === "ibl") stats.push({ label: "Timber / ore / blooms", value: `${s.wood} / ${s.ore} / ${s.blooms}` }, { label: "Repair", value: s.crafted ? "Complete" : String(c.setpiece) });
    if (this.kind === "sws") stats.push({ label: "Supplies", value: s.supplies }, { label: "Lights", value: `${s.beacons.length}/${this.ids("B").length}` }, { label: "Tide", value: Math.floor(s.time / 6) % 2 ? "High" : "Low" });
    const boss = s.enemies.find(a => a.kind === 2 && a.hp > 0);
    const guide = this.kind === "eov" ? this.folioClue() : this.kind === "ibl" ? "Hold primary to gather or tend beds. Secondary opens repairs and tools. Mature flowers regrow every eight seconds." : this.kind === "sws" ? "Steer against momentum. Primary fires or docks; secondary opens the shipyard. Low tide closes the pale reef shallows." : "Hold primary to swing or interact. Moving + secondary dodges; standing still + secondary opens equipment.";
    return { status: s.status, objective: this.options.campaign.chapters[this.options.chapterIndex].objective, message: s.message, selection: s.panel ? String(c.clue ?? c.dialogue) : guide, choices, choiceMode: "modal", choicePrompt: s.panel === "puzzle" ? String(c.setpiece) : s.panel ? "Expedition journal" : undefined, boss: boss ? { name: "The Hollow King", health: boss.hp, max: boss.max } : undefined, stats };
  }
  render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save(); ctx.scale(width / 960, height / 540);
    const s = this.s, camera = this.camera(), sea = this.kind === "sws", garden = this.kind === "ibl";
    const background = ctx.createLinearGradient(0, 0, 0, 540); background.addColorStop(0, sea ? "#1f667d" : garden ? "#476d46" : this.kind === "eov" ? "#27414d" : "#252933"); background.addColorStop(1, sea ? "#123c58" : garden ? "#293d33" : "#111b28"); ctx.fillStyle = background; ctx.fillRect(0, 0, 960, 540);
    ctx.save(); ctx.translate(-camera.x, -camera.y);
    for (let i = 0; i < 85; i++) { const x = (i * 173 + 92) % W, y = (i * 127 + 40) % H; ctx.strokeStyle = sea ? "#b7ebf333" : garden ? "#9db87925" : "#9badb719"; ctx.lineWidth = sea ? 2 : 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (sea ? 24 : 8), y + (sea ? Math.sin(s.time * 2 + i) * 3 : 4)); ctx.stroke(); }
    for (const id of this.ids("#DR")) { const tile = this.map[id], c = center(id); if (tile === "D" && !this.locked()) continue; if (tile === "R") { ctx.fillStyle = Math.floor(s.time / 6) % 2 ? "#a2c5bd46" : "#ccb991"; ctx.beginPath(); ctx.ellipse(c.x, c.y, 42, 29, .4, 0, Math.PI * 2); ctx.fill(); continue; }
      wall(ctx, this.kind, c.x, c.y, id); }
    ground(ctx, this.kind, s.time);
    landmark(ctx, this.kind, this.options.chapterIndex, s.time, this.kind === "eov" && this.solved());
    if (this.kind === "eov") {
      ctx.fillStyle = "#7d45523c"; ctx.fillRect(128, 320, W - 256, 134); ctx.strokeStyle = "#c1a76a44"; ctx.lineWidth = 3; ctx.strokeRect(140, 330, W - 280, 113);

    }
    if (garden) {
      const mx = 1090, my = 530, active = s.crafted;
      ctx.fillStyle = "#93705450"; ctx.beginPath(); ctx.ellipse(mx, my + 45, 95, 42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = active ? "#93dbb0" : "#7a8d80"; ctx.lineWidth = 7;
      if (this.options.chapterIndex === 3) { ctx.beginPath(); ctx.moveTo(mx - 23, my + 45); ctx.lineTo(mx, my - 90); ctx.lineTo(mx + 23, my + 45); ctx.stroke(); ctx.save(); ctx.translate(mx, my - 62); ctx.rotate(active ? s.time * .8 : -.2); for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = active ? "#a1c881" : "#687566"; ctx.beginPath(); ctx.ellipse(0, -42, 14, 46, .2, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
      else if ([1, 4].includes(this.options.chapterIndex)) { drawSprite(ctx, "fountain", mx, my - 10, 124, { alpha: active ? 1 : .5 }); ctx.strokeStyle = active ? "#9bdbe7" : "#737e85"; ctx.beginPath(); ctx.moveTo(mx - 90, my + 25); ctx.lineTo(mx - 35, my + 25); ctx.lineTo(mx - 35, my - 35); ctx.stroke(); }
      else if (this.options.chapterIndex === 2) { ctx.fillStyle = "#4c7795"; ctx.fillRect(mx - 96, my + 6, 192, 30); for (let i = 0; i < 7; i++) { ctx.fillStyle = active ? "#b38a5d" : "#655e50"; ctx.fillRect(mx - 82 + i * 25, my - 10, 21, 64); } }
      else { ctx.beginPath(); ctx.arc(mx, my + 40, 70, Math.PI, 0); ctx.stroke(); if (active) for (let i = 0; i < 5; i++) drawSprite(ctx, "flower", mx - 60 + i * 30, my - 20 - Math.sin(i / 4 * Math.PI) * 30, 44); }
      ctx.fillStyle = active ? "#c4e5ad" : "#c2c9b5"; ctx.font = "12px monospace"; ctx.textAlign = "center"; ctx.fillText(`${String(this.config().setpiece).toUpperCase()} · ${active ? "RESTORED" : "NEEDS REPAIR"}`, mx, my + 88); ctx.textAlign = "left";
      if (!active && this.options.chapterIndex >= 2) { ctx.fillStyle = "#8f667337"; ctx.beginPath(); ctx.ellipse(750, 535, 78, 38, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    if (sea) for (const id of this.ids("X")) { const c = center(id); const storm = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, 116); storm.addColorStop(0, "#57628d66"); storm.addColorStop(1, "#57628d00"); ctx.fillStyle = storm; ctx.fillRect(c.x - 116, c.y - 116, 232, 232); ctx.strokeStyle = "#9babc267"; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(c.x, c.y, 28 + i * 21, s.time * .7 + i, s.time * .7 + i + 4.1); ctx.stroke(); } }
    if (sea) for (const id of this.ids("B")) { const c = center(id); ctx.fillStyle = "#779178"; ctx.beginPath(); ctx.ellipse(c.x, c.y + 24, 68, 43, -.25, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#d5ceaa"; ctx.lineWidth = 7; ctx.stroke(); if (s.beacons.includes(id)) { const light = ctx.createRadialGradient(c.x, c.y - 40, 0, c.x, c.y - 40, 180); light.addColorStop(0, "#ffdd8155"); light.addColorStop(1, "#ffdd8100"); ctx.fillStyle = light; ctx.fillRect(c.x - 180, c.y - 220, 360, 360); } }
    const exit = center(this.ids("E")[0]); ctx.fillStyle = this.goal() ? "#a4e7c943" : "#d6bc8f19"; ctx.beginPath(); ctx.ellipse(exit.x, exit.y + 10, 63, 32, 0, 0, Math.PI * 2); ctx.fill(); drawSprite(ctx, "portal", exit.x, exit.y - 24, 100, { alpha: this.goal() ? 1 : .55 });
    const sprites: { y: number; draw: () => void }[] = [];
    for (const id of [...this.ids(this.kind === "hcr" ? "KH" : this.kind === "eov" ? "F1234" : garden ? "WOPH" : "GB"), ...this.caches]) { const c = center(id), tile = this.map[id]; if (s.picked.includes(id) && tile !== "P") continue; const sprite = this.caches.includes(id) ? "chest" : tile === "K" ? "ember" : tile === "F" ? "scroll" : tile === "H" ? "fountain" : tile === "W" ? "wood" : tile === "O" ? "crystal" : tile === "P" ? "flower" : tile === "B" ? "beacon" : tile === "G" ? "chest" : "mirror"; sprites.push({ y: c.y, draw: () => { if (/[1-4]/.test(tile)) { mechanism(ctx, c.x, c.y - 7, this.options.chapterIndex, Number(tile) - 1, s.puzzle[Number(tile) - 1], this.solved(), s.time); return; } if (tile === "P") { ctx.fillStyle = "#5d4736"; ctx.beginPath(); ctx.ellipse(c.x, c.y + 15, 39, 21, 0, 0, Math.PI * 2); ctx.fill(); const bed = s.planted.find(b => b.id === id); if (!bed) { ctx.fillStyle = "#ba9862"; ctx.fillRect(c.x - 18, c.y + 3, 36, 3); return; } const growth = clamp((s.time - bed.birth) / 8, .25, 1); drawSprite(ctx, "flower", c.x, c.y + 10 - growth * 18, 30 + growth * 52); return; } drawSprite(ctx, sprite, c.x, c.y - 7 + (tile === "K" || tile === "F" ? Math.sin(s.time * 2 + id) * 4 : 0), tile === "B" ? 110 : /[1-4]/.test(tile) ? 86 : 66, { alpha: tile === "B" && !s.beacons.includes(id) ? .6 : 1 }); if (/[1-4]/.test(tile)) { ctx.fillStyle = "#e8d5a4"; ctx.font = "13px monospace"; ctx.textAlign = "center"; ctx.fillText(labels[Number(tile) - 1], c.x, c.y + 42); } } }); }
    if (sea) { ctx.fillStyle = "#5e8b73"; ctx.beginPath(); ctx.ellipse(this.npc.x, this.npc.y + 20, 79, 54, -.2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#ccb994"; ctx.lineWidth = 7; ctx.stroke(); for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? "#92744c" : "#ae8856"; ctx.fillRect(this.npc.x - 99 + i * 18, this.npc.y + 42, 15, 30); } }
    sprites.push({ y: this.npc.y, draw: () => { drawSprite(ctx, this.kind === "eov" ? "scholar" : "merchant", this.npc.x, this.npc.y - 12, 78); ctx.fillStyle = "#f1d799"; ctx.font = "12px monospace"; ctx.textAlign = "center"; ctx.fillText("KEEPER · TALK", this.npc.x, this.npc.y + 42); } });
    for (const a of s.enemies) { if (a.hp <= 0) continue; sprites.push({ y: a.y, draw: () => { if (a.phase === 1) { ctx.fillStyle = "#ee795432"; ctx.strokeStyle = "#ffb67a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(a.x, a.y, a.kind === 2 ? 120 : 86, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } drawSprite(ctx, a.kind === 3 ? "pirate" : a.kind === 2 ? "thornbeast" : a.kind === 1 ? "sentinel" : "wisp", a.x, a.y - 12 + Math.sin(s.time * 3 + a.id) * 3, a.kind === 2 ? 116 : 80); ctx.fillStyle = "#19212e"; ctx.fillRect(a.x - 28, a.y - 64, 56, 5); ctx.fillStyle = "#f29e86"; ctx.fillRect(a.x - 28, a.y - 64, 56 * a.hp / a.max, 5); } }); }
    const p = s.player, walking = Math.hypot(p.vx, p.vy) > 20;
    sprites.push({ y: p.y, draw: () => { ctx.fillStyle = "#00000045"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 22, 26, 12, 0, 0, Math.PI * 2); ctx.fill(); if (s.dash > 0) { ctx.fillStyle = "#dab57566"; ctx.beginPath(); ctx.ellipse(p.x - Math.cos(p.angle) * 40, p.y - Math.sin(p.angle) * 40, 34, 16, p.angle, 0, Math.PI * 2); ctx.fill(); } drawSprite(ctx, sea ? "boat" : garden ? "gardener" : this.kind === "eov" ? "archivist" : "knight", p.x, p.y - 9 + (walking ? Math.sin(s.time * 13) * 3 : Math.sin(s.time * 2)), sea ? 105 : 86, { angle: sea ? p.angle + 5 * Math.PI / 6 : 0, flip: !sea && p.vx < -5, alpha: s.hurt > 0 && Math.floor(s.time * 16) % 2 ? .5 : 1 }); if (s.swing > 0) { ctx.strokeStyle = "#fff0bc"; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(p.x, p.y - 8, 68, p.angle - 1.1, p.angle + 1.1); ctx.stroke(); } } });
    sprites.sort((a, b) => a.y - b.y).forEach(a => a.draw()); ctx.textAlign = "left";
    for (const b of s.shots) { ctx.strokeStyle = b.hostile ? "#ef8f79" : "#ffdf97"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(b.x - b.vx * .03, b.y - b.vy * .03); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    for (const b of this.particles) { ctx.globalAlpha = b.life / .6; ctx.fillStyle = b.color; ctx.fillRect(b.x - 3, b.y - 3, 6, 6); } ctx.globalAlpha = 1; ctx.restore();
    const fog = ctx.createRadialGradient(480, 270, 110, 480, 270, 610); fog.addColorStop(0, "#07142700"); fog.addColorStop(1, this.kind === "eov" && s.lens ? "#75b7b733" : "#08142999"); ctx.fillStyle = fog; ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = "#0d192bc4"; ctx.beginPath(); ctx.roundRect(16, 16, 370, 68, 12); ctx.fill(); ctx.fillStyle = this.options.campaign.palette[2]; ctx.font = "bold 17px monospace"; ctx.fillText(String(this.config().setpiece).toUpperCase(), 30, 42); ctx.font = "12px monospace"; ctx.fillStyle = "#d8e4e8"; ctx.fillText(this.options.campaign.chapters[this.options.chapterIndex].title, 30, 66);
    ctx.fillStyle = "#0d192bc4"; ctx.beginPath(); ctx.roundRect(785, 16, 159, 118, 12); ctx.fill(); ctx.strokeStyle = "#869aab28"; for (const id of this.ids("#")) { const c = center(id); ctx.fillStyle = "#68768466"; ctx.fillRect(796 + c.x / W * 136, 28 + c.y / H * 82, 8, 7); } for (const [pos, color] of [[p, "#ffdc99"], [exit, "#adf2d0"]] as const) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(796 + pos.x / W * 136, 28 + pos.y / H * 82, 3, 0, Math.PI * 2); ctx.fill(); } ctx.font = "10px monospace"; ctx.fillStyle = "#e2dcbe"; ctx.fillText("YOU ●    EXIT ●", 804, 124);
    ctx.fillStyle = "#0d192bb8"; ctx.beginPath(); ctx.roundRect(16, 485, 928, 39, 10); ctx.fill(); ctx.fillStyle = "#e1e1d8"; ctx.font = "13px monospace"; ctx.fillText(`${this.kind === "sws" ? "HULL" : "HEALTH"} ${Math.ceil(p.hp)}    CROWNS ${s.progress.coins}    ${garden ? `WOOD ${s.wood}  ORE ${s.ore}  BLOOMS ${s.blooms}` : this.kind === "eov" ? "SECONDARY: MEMORY LENS" : sea ? "PRIMARY: CANNON / DOCK   SECONDARY: SHIPYARD" : "MOVE + SECONDARY: DODGE   STILL + SECONDARY: EQUIPMENT"}`, 29, 510);
    if (s.status !== "playing") { ctx.fillStyle = "#081528d9"; ctx.fillRect(0, 0, 960, 540); ctx.textAlign = "center"; ctx.fillStyle = "#f3d8a3"; ctx.font = "bold 30px monospace"; ctx.fillText(s.status === "won" ? "THE JOURNEY CONTINUES" : "A NEW ATTEMPT AWAITS", 480, 265); ctx.textAlign = "left"; } ctx.restore();
  }
}
