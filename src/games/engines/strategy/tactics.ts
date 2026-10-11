import type { EngineOptions, EngineView, GameInput } from "../../types";
import { Strategy, type Choice, type Point, copy, keys, int, record, dist, dirs, drawSprite, heading, panel, text, meter, glow, particles } from "./common";
type Unit = Point & { hp: number; max: number; ap: number; guard: number; cooldown: number };
type Echo = Point & { hp: number; max: number; damage: number; kind: number; intent: Point[]; charge: number };
type Config = { width: number; height: number; walls: number[][]; hazards: number[][]; cover: number[][]; enemies: { x: number; y: number; hp: number; damage: number; kind: number }[]; mission: string; objectives: number[][]; exit: number[]; turns: number; waves: number };
type State = { phase: string; clock: number; message: string; selected: number; cursor: Point; ability: string; units: Unit[]; enemies: Echo[]; turn: number; objectives: boolean[]; relay: number; cart: Point; escorted: number; waves: number; rescued: number; kills: number };
const NAMES = ["Mara · Starblade", "Ivo · Longbow", "Sen · Lantern shield"];
const SPRITES = ["knight", "ranger", "guardian"];
export class TacticsEngine extends Strategy<State> {
  private c: Config;
  constructor(o: EngineOptions) {
    super(o); this.c = o.campaign.chapters[o.chapterIndex].config as unknown as Config; const c = this.c;
    const initial: State = { phase: "plan", clock: 0, message: "Enemy attack tiles are marked before your turn. Move clear, use push and cover, and complete the mission together.", selected: 0, cursor: { x: 1, y: 3 }, ability: "attack", units: [0, 1, 2].map((_, i) => ({ x: 1, y: 2 + i, hp: 32, max: 32, ap: 2, guard: 0, cooldown: 0 })), enemies: c.enemies.map(e => ({ ...e, max: e.hp, intent: [], charge: 0 })), turn: 1, objectives: c.objectives.map(() => false), relay: 30, cart: { x: 1, y: 5 }, escorted: 0, waves: 0, rescued: 0, kills: 0 };
    this.load(initial, s => {
      if (!["plan", "battle", "won", "lost"].includes(s.phase) || !int(s.selected, 0, 2) || !this.point(s.cursor) || !["attack", "move", "push", "volley", "ward", "mend", "interact"].includes(s.ability) || !int(s.turn, 1, c.turns + 1) || !int(s.relay, 0, 30) || !this.point(s.cart) || !int(s.escorted, 0, 9) || !int(s.waves, 0, c.waves) || !int(s.rescued, 0, 8) || !int(s.kills, 0, 60)) return false;
      if (!Array.isArray(s.units) || s.units.length !== 3 || !s.units.every(u => keys(u, ["x", "y", "hp", "max", "ap", "guard", "cooldown"]) && this.point(u) && int(u.max, 32, 56) && int(u.hp, 0, u.max) && int(u.ap, 0, 3) && int(u.guard, 0, 16) && int(u.cooldown, 0, 3))) return false;
      if (!Array.isArray(s.enemies) || s.enemies.length > 30 || !s.enemies.every(e => keys(e, ["x", "y", "hp", "damage", "kind", "max", "intent", "charge"]) && this.point(e) && int(e.hp, 0, e.max) && int(e.max, 1, 80) && int(e.damage, 1, 10) && int(e.kind, 0, 3) && int(e.charge, 0, 2) && Array.isArray(e.intent) && e.intent.length <= 8 && e.intent.every(p => this.point(p)))) return false;
      if (!Array.isArray(s.objectives) || s.objectives.length !== c.objectives.length || !s.objectives.every(v => typeof v === "boolean")) return false;
      return s.kills === s.enemies.filter(e => !e.hp).length && (s.phase !== "won" || this.complete(s)) && (s.phase !== "lost" || s.units.every(u => !u.hp) || !s.relay || s.turn > c.turns);
    });
  }
  private point(p: unknown): p is Point { return record(p) && int(p.x, 0, this.c.width - 1) && int(p.y, 0, this.c.height - 1); }
  private at(a: Point, b: Point) { return a.x === b.x && a.y === b.y; }
  private terrain(p: Point, name: "walls" | "cover" | "hazards") { return this.c[name].some(([x, y]) => x === p.x && y === p.y); }
  private occupied(p: Point, ignore?: Unit) { return this.s.units.some(u => u !== ignore && u.hp > 0 && this.at(p, u)) || this.s.enemies.some(e => e.hp > 0 && this.at(p, e)); }
  private path(a: Point, b: Point, ignore?: Unit): Point[] {
    const queue: Point[][] = [[a]], seen = new Set([`${a.x},${a.y}`]);
    while (queue.length) { const path = queue.shift()!, p = path[path.length - 1]; if (this.at(p, b)) return path.slice(1); for (const d of dirs) { const n = { x: p.x + d.x, y: p.y + d.y }, id = `${n.x},${n.y}`; if (!this.point(n) || seen.has(id) || this.terrain(n, "walls") || this.occupied(n, ignore) && !this.at(n, b)) continue; seen.add(id); queue.push([...path, n]); } } return [];
  }
  private visible(a: Point, b: Point) { const steps = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 4; for (let i = 1; i < steps; i++) if (this.terrain({ x: Math.round(a.x + (b.x - a.x) * i / steps), y: Math.round(a.y + (b.y - a.y) * i / steps) }, "walls")) return false; return true; }
  private choices(): Choice[] {
    const s = this.s; if (s.phase === "plan") return [{ id: "deploy", label: "Deploy the squad", description: `${this.c.mission} mission. Enemy intentions are visible before every turn.` }, ...this.upgradeChoices(["Tempered weapons", "Travel cloaks", "Lantern medicine", "Tactical training"])];
    if (s.phase !== "battle") return [];
    const u = s.units[s.selected];
    return [...NAMES.map((name, i) => ({ id: `unit:${i}`, label: `${name} · ${s.units[i].hp} HP / ${s.units[i].ap} AP`, disabled: !s.units[i].hp })),
      { id: "skill:attack", label: "Basic attack", description: s.selected === 1 ? "Range four; 5 damage. Stone blocks sight." : "Adjacent; 7 damage." },
      { id: "skill:move", label: "Reposition", description: "Move up to three tiles for one AP." },
      { id: s.selected === 0 ? "skill:push" : s.selected === 1 ? "skill:volley" : "skill:ward", label: s.selected === 0 ? "Shield-break shove" : s.selected === 1 ? "Piercing volley" : "Lantern ward", description: s.selected === 0 ? "Adjacent: 5 damage and push two tiles; hazards deal eight extra." : s.selected === 1 ? "Two AP: shoot a target and nearby echoes for nine damage." : "One AP: grant nearby allies 10 guard.", disabled: u.cooldown > 0 },
      { id: "skill:mend", label: "Mend an ally", description: "Two AP: heal a nearby ally for eight. Uses the medicine skill.", disabled: u.ap < 2 || u.cooldown > 0 },
      { id: "skill:interact", label: "Rescue / repair / claim", description: "One AP, within one tile of a mission marker." },
      { id: "end", label: "End squad turn", description: "Unused AP grants guard; the marked enemy attacks resolve." }];
  }
  choose(id: string) {
    if (this.upgrade(id)) return; const s = this.s;
    if (id === "deploy" && s.phase === "plan") { s.phase = "battle"; s.units.forEach(u => { u.hp = u.max = 32 + this.p.upgrades[1] * 8; }); this.plan(); s.message = "Squad deployed. Red tiles show the next enemy strikes. Choose a skill and target a tile."; return; }
    if (s.phase !== "battle") return; if (id === "end") { this.end(); return; }
    const c = this.choices().find(n => n.id === id); if (!c || c.disabled) return;
    if (id.startsWith("unit:")) { s.selected = Number(id.split(":")[1]); s.cursor = { x: s.units[s.selected].x, y: s.units[s.selected].y }; s.ability = "attack"; }
    else if (id.startsWith("skill:")) { s.ability = id.split(":")[1]; s.message = `${s.ability} selected. Target a tile and press A.`; }

  }
  private command(p: Point) {
    const s = this.s; if (!this.point(p) || s.phase !== "battle") return; s.cursor = copy(p); const u = s.units[s.selected];
    const ally = s.units.findIndex(v => v.hp > 0 && this.at(p, v)); if (ally >= 0 && !["mend", "interact", "ward"].includes(s.ability)) { s.selected = ally; return; } if (!u.hp || !u.ap) { s.message = "This ally has no actions. Select another or end the turn."; return; }
    const enemy = s.enemies.find(e => e.hp > 0 && this.at(e, p)), range = s.selected === 1 ? 4 : 1;
    if (s.ability === "move" || s.ability === "attack" && !enemy) { const path = this.path(u, p, u); if (!path.length || path.length > 3 + this.p.upgrades[3] || this.occupied(p, u) || this.terrain(p, "walls")) { s.message = "That tile is blocked or too far for one move."; return; } u.x = p.x; u.y = p.y; u.ap--; if (this.terrain(p, "hazards")) { u.hp = Math.max(0, u.hp - 5); this.emit("hit"); } this.emit("step"); }
    else if (s.ability === "interact") {
      const i = this.c.objectives.findIndex(([x, y], i) => !s.objectives[i] && dist(u, { x, y }) <= 1 && p.x === x && p.y === y); if (i < 0) { s.message = "Stand beside an unfinished mission marker to interact."; return; } s.objectives[i] = true; s.rescued++; u.ap--; s.message = this.c.mission === "rescue" ? "A survivor is free. Their lantern joins yours." : "Mission marker secured."; this.emit("collect");
    } else if (s.ability === "ward" && s.selected === 2 && !u.cooldown) { s.units.filter(a => a.hp && dist(a, u) <= 3).forEach(a => a.guard = 10 + this.p.upgrades[2] * 2); u.ap--; u.cooldown = 2; this.emit("craft"); }
    else if (s.ability === "mend" && ally >= 0 && u.ap >= 2 && !u.cooldown && dist(u, p) <= 3) { const a = s.units[ally]; a.hp = Math.min(a.max, a.hp + 8 + this.p.upgrades[2] * 4); u.ap -= 2; u.cooldown = 2; this.emit("collect"); }
    else if (enemy && dist(u, p) <= range && this.visible(u, p)) {
      if (s.ability === "volley" && s.selected === 1 && u.ap >= 2 && !u.cooldown) { s.enemies.filter(e => e.hp && dist(e, p) <= 1).forEach(e => this.damage(e, 9 + this.p.upgrades[0] * 2)); u.ap -= 2; u.cooldown = 2; this.emit("shoot"); }
      else if (s.ability === "push" && s.selected === 0 && !u.cooldown) { this.damage(enemy, 5 + this.p.upgrades[0]); const d = { x: Math.sign(enemy.x - u.x), y: Math.sign(enemy.y - u.y) }; for (let i = 0; i < 2 && enemy.hp; i++) { const next = { x: enemy.x + d.x, y: enemy.y + d.y }; if (!this.point(next) || this.terrain(next, "walls") || this.occupied(next)) { this.damage(enemy, 4); break; } enemy.x = next.x; enemy.y = next.y; if (this.terrain(next, "hazards")) this.damage(enemy, 8); } u.ap--; u.cooldown = 2; this.emit("strike"); }
      else if (s.ability === "attack") { this.damage(enemy, (s.selected === 1 ? 5 : 7) + this.p.upgrades[0] * 2); u.ap--; this.emit(s.selected === 1 ? "shoot" : "strike"); }
      else return;
      s.message = "The echo staggers. Its marked strike still points at the old target tile.";
    } else { s.message = "Target is outside that skill's range or blocked by stone."; return; }
    this.check();
  }
  private damage(e: Echo, n: number) { const alive = e.hp > 0; e.hp = Math.max(0, e.hp - n); if (alive && !e.hp) { this.s.kills++; this.emit("collect"); } }
  private plan() { const s = this.s; s.enemies.filter(e => e.hp).forEach(e => { const target = [...s.units.filter(u => u.hp)].sort((a, b) => dist(a, e) - dist(b, e))[0]; if (!target) return; e.intent = [copy({ x: target.x, y: target.y })]; if (e.kind === 3) dirs.forEach(d => { const p = { x: target.x + d.x, y: target.y + d.y }; if (this.point(p)) e.intent.push(p); }); }); }
  private end() {
    const s = this.s; s.units.forEach(u => u.guard += u.ap * 2); s.enemies.filter(e => e.hp).forEach(e => {
      let struck = false; s.units.filter(u => u.hp).forEach(u => { if (e.intent.some(p => this.at(p, u)) && dist(e, u) <= (e.kind === 1 || e.kind === 3 ? 5 : 2) && this.visible(e, u)) { const cover = this.terrain(u, "cover") ? 2 : 0; const damage = Math.max(0, e.damage - u.guard - cover); u.guard = Math.max(0, u.guard - e.damage); u.hp = Math.max(0, u.hp - damage); struck = true; if (damage) this.emit("hit"); } });
      if (this.c.mission === "defend" && dist(e, { x: 5, y: 3 }) <= 2) s.relay = Math.max(0, s.relay - 2);
      if (!struck) { const target = [...s.units.filter(u => u.hp)].sort((a, b) => dist(e, a) - dist(e, b))[0]; if (target) { const path = this.path(e, target); for (const p of path.slice(0, e.kind === 3 ? 1 : 2)) { if (this.occupied(p)) break; e.x = p.x; e.y = p.y; } } }
    });
    s.turn++; s.units.forEach(u => { u.ap = u.hp ? 2 : 0; u.guard = 0; u.cooldown = Math.max(0, u.cooldown - 1); });
    if (this.c.mission === "escort" && s.enemies.every(e => !e.hp) && s.units.some(u => u.hp && dist(u, s.cart) <= 3)) { s.cart.x = Math.min(10, s.cart.x + 1); s.escorted++; this.emit("engine"); }
    if ((this.c.mission === "defend" || this.c.mission === "escort") && s.waves < this.c.waves && s.turn % 3 === 0) { s.waves++; const x = this.c.width - 2, y = s.waves % 2 ? 1 : 6; s.enemies.push({ x, y, hp: 9 + this.options.chapterIndex, max: 9 + this.options.chapterIndex, damage: 3 + Math.floor(this.options.chapterIndex / 2), kind: 1, intent: [], charge: 0 }); s.message = "A new echo wave arrives at the ridge."; }
    this.plan(); this.check();
  }
  private complete(s = this.s) { const c = this.c, cleared = s.enemies.every(e => !e.hp), objectives = s.objectives.every(Boolean); if (c.mission === "defend") return s.turn >= 9 && cleared && s.waves === c.waves && s.relay > 0; if (c.mission === "escort") return s.cart.x >= 10 && cleared && s.waves === c.waves; return cleared && objectives && s.units.some(u => u.hp && u.x === c.exit[0] && u.y === c.exit[1]); }
  private check() { const s = this.s; if (this.complete()) { s.phase = "won"; s.message = "The mission is complete. Your squad carries its new experience home."; this.award(); } else if (s.units.every(u => !u.hp) || !s.relay || s.turn > this.c.turns) { s.phase = "lost"; s.message = "The squad's lantern goes dark. Reposition outside marked attacks and use cover and ward skills."; this.emit("fail"); } }
  update(dt: number, input: GameInput) {
    if (["won", "lost"].includes(this.s.phase)) return; if (this.s.phase === "plan") { this.controls(input, this.choices()); this.pointerChoices(input, this.choices()); return; }
    const s = this.s; s.clock += Math.max(0, Math.min(dt, .25)); const move = (x: number, y: number) => { s.cursor.x = Math.max(0, Math.min(this.c.width - 1, s.cursor.x + x)); s.cursor.y = Math.max(0, Math.min(this.c.height - 1, s.cursor.y + y)); }; if (input.pressed.has("left")) move(-1, 0); if (input.pressed.has("right")) move(1, 0); if (input.pressed.has("up")) move(0, -1); if (input.pressed.has("down")) move(0, 1); if (input.pressed.has("action")) this.command(s.cursor); if (input.pressed.has("alt")) this.end(); if (input.pointer?.pressed) { const p = { x: Math.floor((input.pointer.x - 32) / 56), y: Math.floor((input.pointer.y - 82) / 48) }; this.command(p); }
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.s, c = this.c; heading(ctx, this.options, `${c.mission.toUpperCase()} · TURN ${s.turn}/${c.turns}`);
    // Inlaid ruined stone, broken colonnades, moss, water and drifting crystal dust.
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const p = { x, y }, xx = 32 + x * 56, yy = 82 + y * 48;
      ctx.fillStyle = this.terrain(p, "walls") ? "#263442" : this.terrain(p, "hazards") ? "#743d50" : this.terrain(p, "cover") ? "#4b674f" : (x + y) % 2 ? "#455366" : "#3e4b5c"; ctx.fillRect(xx + 1, yy + 1, 54, 46); ctx.strokeStyle = "#9bb2b921"; ctx.strokeRect(xx + 3, yy + 3, 50, 42);
      if (this.terrain(p, "walls")) { panel(ctx, xx + 7, yy - 4, 43,  44, "#758096", "#c0bec5"); ctx.fillStyle = "#3b4559"; ctx.fillRect(xx + 12, yy + 5, 6, 28); ctx.fillRect(xx + 24, yy + 5, 5, 28); } else if (this.terrain(p, "cover")) drawSprite(ctx, "herb", xx + 28, yy + 25, 52); else if (this.terrain(p, "hazards")) { drawSprite(ctx, "crystal", xx + 28, yy + 25, 52); glow(ctx, xx + 28, yy + 25, 39, "#ed6dac3c"); }
      if (s.enemies.some(e => e.hp && e.intent.some(t => this.at(t, p)))) { ctx.fillStyle = "#f2606450"; ctx.fillRect(xx + 2, yy + 2, 52, 44); ctx.strokeStyle = "#ec8379"; ctx.lineWidth = 2; ctx.strokeRect(xx + 5, yy + 5, 46, 38); }
      if (s.cursor.x === x && s.cursor.y === y) { ctx.strokeStyle = "#ffe8ad"; ctx.lineWidth = 3; ctx.strokeRect(xx + 2, yy + 2, 52, 44); }
    }
    c.objectives.forEach(([x, y], i) => { drawSprite(ctx, c.mission === "rescue" ? "chest" : c.mission === "disrupt" ? "beacon" : "crystal", 60 + x * 56, 103 + y * 48, 57, { alpha: s.objectives[i] ? .35 : 1 }); if (!s.objectives[i]) glow(ctx, 60 + x * 56, 103 + y * 48, 40, "#c8dc8d42"); });
    drawSprite(ctx, "portal", 60 + c.exit[0] * 56, 103 + c.exit[1] * 48, 63);
    if (c.mission === "escort") drawSprite(ctx, "wood", 60 + s.cart.x * 56, 103 + s.cart.y * 48, 68); if (c.mission === "defend") { drawSprite(ctx, "beacon", 340, 247, 75); meter(ctx, 312, 281, 56, s.relay / 30); }
    s.enemies.filter(e => e.hp).forEach(e => { const x = 60 + e.x * 56, y = 103 + e.y * 48; drawSprite(ctx, e.kind === 3 ? "thornbeast" : e.kind === 1 ? "wisp" : "wolf", x, y - Math.sin(s.clock + e.x) * 2, e.kind === 3 ? 85 : 65); meter(ctx, x - 21, y + 25, 42, e.hp / e.max, "#ea918e"); });
    s.units.filter(u => u.hp).forEach((u, i) => { const x = 60 + u.x * 56, y = 103 + u.y * 48; if (i === s.selected) glow(ctx, x, y, 49, "#d6dc8d5c"); drawSprite(ctx, SPRITES[i], x, y, 69); meter(ctx, x - 23, y + 26, 46, u.hp / u.max, "#acd6b0"); for (let a = 0; a < u.ap; a++) { ctx.fillStyle = "#ffe3a2"; ctx.fillRect(x - 10 + a * 14, y + 36, 9, 5); } });
    panel(ctx, 725, 82, 204, 380, "#142235ec"); text(ctx, "SQUAD", 742, 113, 19, "#d5daf2"); s.units.forEach((u, i) => { drawSprite(ctx, SPRITES[i], 756, 153 + i * 85, 56); text(ctx, NAMES[i].split(" · ")[0], 789, 149 + i * 85, 17, s.selected === i ? "#ffe1a3" : "#d2dfe0"); text(ctx, `${u.hp}/${u.max} HP`, 789, 174 + i * 85, 13); text(ctx, `${u.ap} AP  ${u.guard} guard`, 744, 197 + i * 85, 13); }); text(ctx, `Skill: ${s.ability}`, 741, 409, 14, "#f1d6a1"); text(ctx, `Markers ${s.objectives.filter(Boolean).length}/${s.objectives.length}`, 741, 437, 13);
    particles(ctx, s.clock * .2, 860, 495, "#a9b9e5", 16); if (s.phase === "plan") this.decisionOverlay(ctx, `Mission equipment · ${this.p.credits} marks`, this.choices()); text(ctx, "ARROWS CURSOR · A TARGET SKILL · X END TURN · RED = NEXT STRIKE", 480, 521, 14, "#ccd4e7", "center");
  }
  view(): EngineView {
    const s = this.s, u = s.units[s.selected], e = s.enemies.find(e => e.hp && this.at(e, s.cursor)), ally = s.units.findIndex(a => a.hp && this.at(a, s.cursor)), boss = s.enemies.find(e => e.kind === 3 && e.hp > 0);
    return { ...this.viewBase(), choices: this.choices(), choiceMode: s.phase === "plan" ? "modal" : "panel", choicePrompt: "Squad commands", selection: `${NAMES[s.selected]}: ${u.hp}/${u.max} HP, ${u.ap} AP, ${u.guard} guard, at (${u.x + 1},${u.y + 1}). ${s.ability} selected. Cursor (${s.cursor.x + 1},${s.cursor.y + 1}): ${e ? "echo " + e.hp + " HP, strike " + e.damage : ally >= 0 ? NAMES[ally] : this.terrain(s.cursor, "walls") ? "stone wall" : this.terrain(s.cursor, "hazards") ? "crystal hazard: five damage on entry" : this.terrain(s.cursor, "cover") ? "cover: reduces enemy hits by two" : "open terrain"}. ${s.enemies.filter(e => e.hp).map(e => `Echo (${e.x + 1},${e.y + 1}) aims at ${e.intent.map(p => `(${p.x + 1},${p.y + 1})`).join(" ")}`).join(". ")}`, ...(boss ? { boss: { name: "Fallen star sentinel", health: boss.hp, max: boss.max } } : {}), stats: [{ label: "Turn", value: s.turn }, { label: "Echoes", value: s.enemies.filter(e => e.hp).length }, { label: "Mission", value: this.c.mission }, { label: "Markers", value: `${s.objectives.filter(Boolean).length}/${s.objectives.length}` }, { label: "Relay", value: s.relay }] };
  }
}
