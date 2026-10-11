import type { EngineOptions, EngineView, GameInput } from "../../types";
import { Strategy, type Choice, type Point, copy, int, nums, keys, record, dirs, drawSprite, heading, panel, text, glow, particles } from "./common";
export type Mirror = Point & { slash: boolean; fixed?: boolean; splitter?: boolean };
export type Prism = Point & { color: number; movable?: boolean };
export type Room = { name: string; width: number; height: number; emitters: (Point & { dir: number; color: number })[]; mirrors: Mirror[]; receivers: (Point & { color: number })[]; walls: number[][]; prisms: Prism[]; shutters: Point[]; charges: number };
type Config = { rooms: Room[] };
type State = { phase: string; clock: number; message: string; room: number; cursor: Point; rotations: boolean[]; prisms: Prism[]; shutters: boolean[]; carrying: number; pulses: number; mode: string; medals: number[]; completed: number; flash: number; moves: number };
export type Trace = { beams: { from: Point; to: Point; color: number }[]; lit: boolean[]; loops: number };
/** Finite optical simulation shared by preview and committed pulses. No randomness. */
export function traceRoom(room: Room, rotations: boolean[], prisms: Prism[], shutters: boolean[], carrying = -1): Trace {
  const beams: Trace["beams"] = [], lit = room.receivers.map(() => false), queue = room.emitters.map(e => ({ ...e })), seen = new Set<string>(); let loops = 0;
  while (queue.length) {
    const beam = queue.shift()!; let { x, y, dir, color } = beam;
    for (let step = 0; step < 160; step++) {
      const d = dirs[dir], p = { x: x + d.x, y: y + d.y }; if (p.x < 0 || p.y < 0 || p.x >= room.width || p.y >= room.height) break;
      const id = `${p.x},${p.y},${dir},${color}`; if (seen.has(id)) { loops++; break; } seen.add(id); beams.push({ from: { x, y }, to: p, color }); x = p.x; y = p.y;
      if (room.walls.some(([xx, yy]) => x === xx && y === yy) || room.shutters.some((s, i) => s.x === x && s.y === y && !shutters[i])) break;
      const receiver = room.receivers.findIndex(r => r.x === x && r.y === y); if (receiver >= 0) { if (room.receivers[receiver].color === color) lit[receiver] = true; break; }
      const prism = prisms.find((p, i) => i !== carrying && p.x === x && p.y === y); if (prism) color = prism.color;
      const index = room.mirrors.findIndex(m => m.x === x && m.y === y); if (index >= 0) { const reflected = rotations[index] ? [3, 2, 1, 0][dir] : [1, 0, 3, 2][dir]; if (room.mirrors[index].splitter) queue.push({ x, y, dir: reflected, color }); else dir = reflected; }
    }
  }
  return { beams, lit, loops };
}
const COLORS = ["#ffd875", "#87d7ff", "#d4a5ff"];
export class LightEngine extends Strategy<State> {
  private c: Config;
  constructor(o: EngineOptions) {
    super(o); this.c = o.campaign.chapters[o.chapterIndex].config as unknown as Config; const r = this.c.rooms[0];
    const initial: State = { phase: "plan", clock: 0, message: "Explore three chambers. Rotate mirrors, divide light with splitters, move color crystals, and open mechanical shutters. Every lantern must glow in the same pulse.", room: 0, cursor: { x: 0, y: 0 }, rotations: r.mirrors.map(m => m.slash), prisms: copy(r.prisms), shutters: r.shutters.map(() => false), carrying: -1, pulses: 0, mode: "explore", medals: [], completed: 0, flash: 0, moves: 0 };
    this.load(initial, s => {
      if (!["plan", "puzzle", "door", "won", "lost"].includes(s.phase) || !int(s.room, 0, this.c.rooms.length - 1) || !["explore", "precision"].includes(s.mode) || !int(s.pulses, 0, 1000) || !int(s.completed, 0, this.c.rooms.length) || !int(s.moves, 0, 10000) || !nums(s.medals, 3, 0, 6) || !int(s.flash, 0, 60)) return false;
      const r = this.c.rooms[s.room]; if (!this.point(s.cursor, r) || !Array.isArray(s.rotations) || s.rotations.length !== r.mirrors.length || !s.rotations.every((v, i) => typeof v === "boolean" && (!r.mirrors[i].fixed || v === r.mirrors[i].slash)) || !Array.isArray(s.shutters) || s.shutters.length !== r.shutters.length || !s.shutters.every(v => typeof v === "boolean") || !int(s.carrying, -1, Math.max(-1, r.prisms.length - 1)) || s.carrying >= 0 && !r.prisms[s.carrying].movable) return false;
      if (!Array.isArray(s.prisms) || s.prisms.length !== r.prisms.length || !s.prisms.every((p, i) => keys(p, Object.keys(r.prisms[i])) && this.point(p, r) && p.color === r.prisms[i].color && p.movable === r.prisms[i].movable && (p.movable || p.x === r.prisms[i].x && p.y === r.prisms[i].y))) return false;
      if ((s.phase === "puzzle" || s.phase === "plan") && s.completed !== s.room) return false;
      if (s.medals.length !== s.completed || s.phase === "door" && (s.completed !== s.room + 1 || !traceRoom(r, s.rotations, s.prisms, s.shutters, s.carrying).lit.every(Boolean))) return false;
      return (s.phase !== "won" || s.completed === this.c.rooms.length && s.room === this.c.rooms.length - 1 && traceRoom(r, s.rotations, s.prisms, s.shutters, s.carrying).lit.every(Boolean)) && (s.phase !== "lost" || s.mode === "precision" && s.pulses >= r.charges + this.p.upgrades[0]);
    });
  }
  private point(p: unknown, room = this.c.rooms[this.s?.room ?? 0]): p is Point { return record(p) && int(p.x, 0, room.width - 1) && int(p.y, 0, room.height - 1); }
  private room() { return this.c.rooms[this.s.room]; }
  private preview(hypothetical = false) { const s = this.s; if (hypothetical && this.p.upgrades[2] && s.carrying >= 0 && this.dropAllowed(s.cursor)) { const prisms = copy(s.prisms); prisms[s.carrying].x = s.cursor.x; prisms[s.carrying].y = s.cursor.y; return traceRoom(this.room(), s.rotations, prisms, s.shutters); } return traceRoom(this.room(), s.rotations, s.prisms, s.shutters, s.carrying); }
  private choices(): Choice[] {
    const s = this.s, r = this.room();
    if (s.phase === "plan") return [{ id: "mode:explore", label: "Explore the temple", description: "Unlimited pulses. Experiment freely and follow the living preview." }, { id: "mode:precision", label: "Precision expedition", description: `${r.charges} pulses per chamber. Earn extra medals for careful routing.` }, ...this.upgradeChoices(["Reserve lanterns (+precision charge)", "Survey lens (beam-stop clues)", "Crystal gloves (placement preview)", "Temple lore (efficient-route medals)"])];
    if (s.phase === "door") return [{ id: "continue", label: "Enter the next chamber", description: "The lantern gate is open. A deeper optical challenge waits." }];
    if (s.phase !== "puzzle") return [];
    return [{ id: "pulse", label: "Release a light pulse", description: `${this.preview().lit.filter(Boolean).length}/${r.receivers.length} lanterns in the preview.${s.mode === "precision" ? " " + (r.charges + this.p.upgrades[0] - s.pulses) + " charges left." : " Unlimited exploration pulses."}` },
      ...r.mirrors.map((m, i) => ({ id: `mirror:${i}`, label: `${m.splitter ? "Splitter" : "Mirror"} (${m.x + 1},${m.y + 1}) ${s.rotations[i] ? "/" : "\\"}`, description: m.splitter ? "Transmits forward and reflects a second beam; rotate the reflected branch." : m.fixed ? "Ancient stone ring: fixed orientation." : "Rotate to bend the beam through ninety degrees.", disabled: !!m.fixed })),
      ...r.shutters.map((p, i) => ({ id: `shutter:${i}`, label: `${s.shutters[i] ? "Close" : "Open"} shutter (${p.x + 1},${p.y + 1})`, description: "A mechanical gate blocks every color when closed." })),
      ...s.prisms.map((p, i) => ({ id: `pick:${i}`, label: `Carry ${["gold", "blue", "violet"][p.color]} crystal (${p.x + 1},${p.y + 1})`, description: "Pick it up, move the cursor, then place it on an empty beam tile.", disabled: !p.movable || s.carrying >= 0 })),
      { id: "drop", label: `Place crystal at (${s.cursor.x + 1},${s.cursor.y + 1})`, description: "A crystal recolors every beam crossing its tile.", disabled: s.carrying < 0 || !this.dropAllowed(s.cursor) },
      { id: "hint", label: "Read the survey lens", description: "Inspect paths and receiver colors without spending a pulse." },
    ];
  }
  private dropAllowed(p: Point) { const r = this.room(), s = this.s; return this.point(p) && !r.walls.some(([x, y]) => x === p.x && y === p.y) && ![...r.mirrors, ...r.receivers, ...r.emitters, ...r.shutters].some(v => v.x === p.x && v.y === p.y) && !s.prisms.some((v, i) => i !== s.carrying && v.x === p.x && v.y === p.y); }
  choose(id: string) {
    if (this.upgrade(id)) return; const s = this.s;
    if (id.startsWith("mode:") && s.phase === "plan" && ["explore", "precision"].includes(id.split(":")[1])) { s.mode = id.split(":")[1]; s.phase = "puzzle"; s.message = "Trace the preview. Turn movable mirrors, then pulse when every receiver has its own color."; return; }
    if (id === "continue" && s.phase === "door") { s.room++; const r = this.room(); s.rotations = r.mirrors.map(m => m.slash); s.prisms = copy(r.prisms); s.shutters = r.shutters.map(() => false); s.carrying = -1; s.pulses = 0; s.moves = 0; s.phase = "puzzle"; s.message = `${r.name}. Splitters transmit forward and reflect a second branch; crystals can recolor either branch.`; this.emit("dialogue"); return; }
    if (s.phase !== "puzzle") return; const c = this.choices().find(c => c.id === id); if (!c || c.disabled) return;
    if (id.startsWith("mirror:")) { const i = Number(id.split(":")[1]); s.rotations[i] = !s.rotations[i]; s.cursor = { x: this.room().mirrors[i].x, y: this.room().mirrors[i].y }; s.moves++; this.emit("craft", .4); }
    else if (id.startsWith("shutter:")) { const i = Number(id.split(":")[1]); s.shutters[i] = !s.shutters[i]; s.moves++; this.emit("engine", .5); }
    else if (id.startsWith("pick:")) { s.carrying = Number(id.split(":")[1]); s.cursor = { x: s.prisms[s.carrying].x, y: s.prisms[s.carrying].y }; s.message = "Crystal lifted. Move to an empty tile on the intended color branch, then place it."; this.emit("collect"); }
    else if (id === "drop") { const p = s.prisms[s.carrying]; p.x = s.cursor.x; p.y = s.cursor.y; s.carrying = -1; s.moves++; this.emit("craft"); }
    else if (id === "hint") { const preview = this.preview(); s.message = `${preview.lit.filter(Boolean).length}/${preview.lit.length} receivers lit. ${this.room().receivers.map((r, i) => `${["Gold", "Blue", "Violet"][r.color]} at (${r.x + 1},${r.y + 1}): ${preview.lit[i] ? "connected" : "needs a path"}`).join(". ")}. Follow every branch past shutters and color crystals.${this.p.upgrades[1] ? " Closed shutters: " + this.room().shutters.filter((_,i) => !s.shutters[i]).map(p => `(${p.x+1},${p.y+1})`).join(", ") + ". " + (this.p.upgrades[1] > 1 ? "Beam stops: " + preview.beams.filter(b => !preview.beams.some(n => n.from.x === b.to.x && n.from.y === b.to.y && n.color === b.color)).map(b => `(${b.to.x+1},${b.to.y+1})`).slice(0,8).join(", ") : "") + (this.p.upgrades[1] > 2 ? `. Optical loops: ${preview.loops}. Inspect mirrors at beam stops and crystals at color changes.` : "") : ""}`; }
    else if (id === "pulse") {
      s.pulses++; s.flash = 60; const preview = this.preview(); this.emit("splash");
      if (preview.lit.every(Boolean)) { s.completed++; s.medals.push((s.mode === "precision" ? Math.max(1, 4 - s.pulses) : 1) + (s.moves <= this.room().mirrors.length + this.room().shutters.length + 3 ? this.p.upgrades[3] : 0)); s.phase = s.completed === this.c.rooms.length ? "won" : "door"; s.message = "Every lantern answers. The chamber's gate rises from the tide."; if (s.phase === "won") this.award(); else this.emit("success"); }
      else if (s.mode === "precision" && s.pulses >= this.room().charges + this.p.upgrades[0]) { s.phase = "lost"; s.message = "The precision lantern is empty. Restart with a planned route, or explore freely."; this.emit("fail"); }
      else s.message = `${preview.lit.filter(Boolean).length}/${preview.lit.length} lanterns answered. The preview remains available for the next adjustment.`;
    }
  }
  update(dt: number, input: GameInput) {
    const s = this.s; if (["won", "lost"].includes(s.phase)) return; if (s.phase === "puzzle") { s.clock += Math.min(.25, Math.max(0, dt)); s.flash = Math.max(0, s.flash - 1); }
    if (s.phase === "plan" || s.phase === "door") { this.controls(input, this.choices()); this.pointerChoices(input, this.choices()); return; }
    const r = this.room(), shift = (x: number, y: number) => { s.cursor.x = Math.max(0, Math.min(r.width - 1, s.cursor.x + x)); s.cursor.y = Math.max(0, Math.min(r.height - 1, s.cursor.y + y)); }; if (input.pressed.has("left")) shift(-1, 0); if (input.pressed.has("right")) shift(1, 0); if (input.pressed.has("up")) shift(0, -1); if (input.pressed.has("down")) shift(0, 1);
    const action = () => { const m = r.mirrors.findIndex(m => m.x === s.cursor.x && m.y === s.cursor.y), shutter = r.shutters.findIndex(p => p.x === s.cursor.x && p.y === s.cursor.y), prism = s.prisms.findIndex(p => p.x === s.cursor.x && p.y === s.cursor.y); if (s.carrying >= 0) this.choose("drop"); else if (m >= 0) this.choose(`mirror:${m}`); else if (shutter >= 0) this.choose(`shutter:${shutter}`); else if (prism >= 0) this.choose(`pick:${prism}`); };
    if (input.pressed.has("action")) action(); if (input.pressed.has("alt")) this.choose("pulse"); if (input.pointer?.pressed) { const p = { x: Math.floor((input.pointer.x - 58) / 70), y: Math.floor((input.pointer.y - 88) /  60) }; if (this.point(p)) { const same = p.x === s.cursor.x && p.y === s.cursor.y; s.cursor = p; if (same || r.mirrors.some(m => m.x === p.x && m.y === p.y) || r.shutters.some(v => v.x === p.x && v.y === p.y)) action(); } }
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.s, r = this.room(), p = this.preview(true); heading(ctx, this.options, `CHAMBER ${s.room + 1}/3 · ${r.name}`);
    // Flooded marble temple framed with columns, roots and animated water reflections.
    ctx.fillStyle = "#183c4e"; ctx.fillRect(26, 75, 908, 427); for (let i = 0; i < 35; i++) { ctx.strokeStyle = "#74b7be19"; ctx.beginPath(); const y = 99 + i * 12; ctx.moveTo(25 + Math.sin(i + s.clock) * 10, y); ctx.lineTo(934 - Math.cos(i + s.clock) * 12, y); ctx.stroke(); }
    for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) { const xx = 58 + x * 70, yy = 88 + y * 60; ctx.fillStyle = r.walls.some(([a, b]) => a === x && b === y) ? "#35465a" : (x + y) % 2 ? "#456573" : "#3b5b68"; ctx.fillRect(xx + 1, yy + 1, 68, 58); ctx.strokeStyle = "#91bdbe25"; ctx.strokeRect(xx + 4, yy + 4, 62, 52); if ((x * 11 + y * 7) % 13 === 0) drawSprite(ctx, "herb", xx + 53, yy + 50, 40, { alpha: .5 }); if (r.walls.some(([a, b]) => a === x && b === y)) { panel(ctx, xx + 4, yy - 8, 62, 60, "#7a919b", "#acb9ba"); ctx.fillStyle = "#3d5a67"; ctx.fillRect(xx + 30, yy - 2, 5, 42); } }
    p.beams.forEach((b, i) => { const x = 93 + b.from.x * 70, y = 118 + b.from.y * 60, xx = 93 + b.to.x * 70, yy = 118 + b.to.y * 60; ctx.strokeStyle = COLORS[b.color] + "30"; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(xx, yy); ctx.stroke(); ctx.strokeStyle = COLORS[b.color]; ctx.lineWidth = s.flash ? 5 : 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(xx, yy); ctx.stroke(); const t = (s.clock * 1.5 + i * .17) % 1; glow(ctx, x + (xx - x) * t, y + (yy - y) * t, 11, COLORS[b.color] + "aa"); });
    r.mirrors.forEach((m, i) => { const x = 93 + m.x * 70, y = 118 + m.y * 60; drawSprite(ctx, "mirror", x, y, 65, { angle: s.rotations[i] ? -.785 : .785 }); ctx.strokeStyle = m.splitter ? "#f2d688" : m.fixed ? "#879fac" : "#e2eef0"; ctx.lineWidth = m.splitter ? 6 : 4; ctx.beginPath(); ctx.moveTo(x - 21, y + (s.rotations[i] ? 20 : -20)); ctx.lineTo(x + 21, y + (s.rotations[i] ? -20 : 20)); ctx.stroke(); if (m.fixed) { ctx.strokeStyle = "#667b85"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, 29, 0, Math.PI * 2); ctx.stroke(); } if (m.splitter) text(ctx, "+", x, y + 5, 21, "#fff4c6", "center"); });
    s.prisms.forEach((p, i) => { if (i === s.carrying) return; drawSprite(ctx, "crystal", 93 + p.x * 70, 118 + p.y * 60, 65); glow(ctx, 93 + p.x * 70, 118 + p.y * 60, 34, COLORS[p.color] + "6f"); if (p.movable) text(ctx, "↔", 93 + p.x * 70, 147 + p.y * 60, 16, COLORS[p.color], "center"); });
    r.shutters.forEach((p, i) => { const x = 93 + p.x * 70, y = 118 + p.y * 60; panel(ctx, x - 25, y - 25, 50, 50, s.shutters[i] ? "#16293580" : "#8b7961", "#d4bb8d"); text(ctx, s.shutters[i] ? "OPEN" : "GATE", x, y + 5, 11, "#ffeece", "center"); });
    r.emitters.forEach(e => { drawSprite(ctx, "beacon", 93 + e.x * 70, 118 + e.y * 60, 64); glow(ctx, 93 + e.x * 70, 118 + e.y * 60, 47, COLORS[e.color] + "65"); });
    r.receivers.forEach((v, i) => { const x = 93 + v.x * 70, y = 118 + v.y * 60; drawSprite(ctx, "beacon", x, y,  64); glow(ctx, x, y, p.lit[i] ? 66 : 22, COLORS[v.color] + (p.lit[i] ? "a0" : "40")); particles(ctx, s.clock, x, y - 12, p.lit[i] ? COLORS[v.color] : "#456173", 5); text(ctx, p.lit[i] ? "LIT" : ["G", "B", "V"][v.color], x, y + 29, 12, COLORS[v.color], "center"); });
    ctx.strokeStyle = "#fbebbf"; ctx.lineWidth = 3; ctx.strokeRect(60 + s.cursor.x * 70, 90 + s.cursor.y * 60, 66, 56); if (s.carrying >= 0) drawSprite(ctx, "crystal", 93 + s.cursor.x * 70, 118 + s.cursor.y * 60, 50, { alpha: .65 });
    panel(ctx, 782, 91, 145, 350, "#122936dc"); text(ctx, "LANTERNS", 854, 121, 17, "#e7e1b8", "center"); r.receivers.forEach((v, i) => { text(ctx, `${["GOLD", "BLUE", "VIOLET"][v.color]} ${p.lit[i] ? "✓" : "○"}`, 801, 154 + i * 30, 15, COLORS[v.color]); }); text(ctx, `${s.pulses} pulses`, 801, 283, 14); text(ctx, `${s.moves} moves`, 801, 311, 14); text(ctx, s.mode.toUpperCase(), 801, 339, 13); text(ctx, `MEDALS ${s.medals.reduce((a, b) => a + b, 0)}`, 801, 373, 14, "#ecd39e");
    if (s.phase === "plan" || s.phase === "door") this.decisionOverlay(ctx, s.phase === "door" ? "The lantern gate is open" : "Choose your expedition", this.choices()); text(ctx, "A ROTATE / LIFT / PLACE · X PULSE · SPLITTERS TRANSMIT AND REFLECT", 480, 521, 14, "#bfdce0", "center");
  }
  view(): EngineView {
    const s = this.s, r = this.room(), preview = this.preview(true), m = r.mirrors.findIndex(m => m.x === s.cursor.x && m.y === s.cursor.y), prism = s.prisms.findIndex(p => p.x === s.cursor.x && p.y === s.cursor.y), shutter = r.shutters.findIndex(p => p.x === s.cursor.x && p.y === s.cursor.y);
    return { ...this.viewBase(), choices: this.choices(), choiceMode: s.phase === "plan" || s.phase === "door" ? "modal" : "panel", choicePrompt: "Temple mechanisms", selection: `Chamber ${s.room + 1}: ${r.name}. Cursor (${s.cursor.x + 1},${s.cursor.y + 1}): ${m >= 0 ? `${r.mirrors[m].fixed ? "fixed " : ""}${r.mirrors[m].splitter ? "splitter" : "mirror"} ${s.rotations[m] ? "/" : "\\"}` : shutter >= 0 ? "shutter " + (s.shutters[shutter] ? "open" : "closed") : prism >= 0 ? `${["gold", "blue", "violet"][s.prisms[prism].color]} ${s.prisms[prism].movable ? "movable" : "fixed"} crystal` : "empty temple tile"}. ${s.carrying >= 0 ? "Carrying " + ["gold", "blue", "violet"][s.prisms[s.carrying].color] + " crystal. Place on an empty beam tile." + (this.p.upgrades[2] ? " Gloves show how its current cursor placement would affect the beams; place before pulsing." : "") : ""} Preview: ${r.receivers.map((v, i) => `${["gold", "blue", "violet"][v.color]} (${v.x + 1},${v.y + 1}) ${preview.lit[i] ? "lit" : "unlit"}`).join("; ")}. ${s.mode === "explore" ? "Unlimited pulses." : r.charges + this.p.upgrades[0] - s.pulses + " charges left."}`, stats: [{ label: "Room", value: `${s.room + 1}/3` }, { label: "Preview", value: `${preview.lit.filter(Boolean).length}/${preview.lit.length}` }, { label: "Pulses", value: s.pulses }, { label: "Moves", value: s.moves }, { label: "Medals", value: s.medals.reduce((a, b) => a + b, 0) }] };
  }
}
