import type { EngineOptions, EngineView, GameInput } from "../../types";
import { Strategy, type Choice, type Point, finite, int, nums, keys, record, drawSprite, heading, panel, text, meter, glow, particles, hit, wrap } from "./common";
export const DISHES = [
  { name: "Moss dumplings", heat: 1, grill: 3.4, sprite: "herb", color: "#96db93" },
  { name: "Tide noodles", heat: 2, grill: 4.2, sprite: "berry", color: "#84d6ea" },
  { name: "Ember skewers", heat: 3, grill: 5, sprite: "spice", color: "#ffb276" },
];
type Giant = { name: string; appetite: number[]; health: number; attack: number };
type Config = { guests: Giant[]; hull: number; heatLimit: number; stock: number[]; limit: number };
type State = { phase: string; clock: number; message: string; guest: number; hp: number; craving: number; selected: number; stock: number[]; heat: number; hull: number; combo: number; best: number; meals: number; stage: "idle" | "chop" | "grill" | "season" | "plate"; stageTime: number; cuts: number; quality: number; flipped: boolean; chef: Point; warning: Point | null; stomp: number; dodge: number; vent: number; coins: number; seasoning: number };
export class KitchenEngine extends Strategy<State> {
  private c: Config;
  constructor(o: EngineOptions) {
    super(o); this.c = o.campaign.chapters[o.chapterIndex].config as unknown as Config; const c = this.c;
    const initial: State = { phase: "plan", clock: 0, message: "Giant meals need chopping, a timed grill flip, seasoning and plating. Cravings change after every course. Dodge the red stomp circle.", guest: 0, hp: c.guests[0].health, craving: 0, selected: 0, stock: [...c.stock], heat: 0, hull: c.hull, combo: 0, best: 0, meals: 0, stage: "idle", stageTime: 0, cuts: 0, quality: 0, flipped: false, chef: { x: 4, y: 4 }, warning: null, stomp: 17, dodge: 0, vent: 0, coins: 0, seasoning: 0 };
    this.load(initial, s => ["plan", "cooking", "won", "lost"].includes(s.phase) && int(s.guest, 0, c.guests.length - 1) && int(s.hp, 0, c.guests[s.guest].health) && int(s.craving, 0, 200) && int(s.selected, 0, 2) && nums(s.stock, 3, 0, 100) && s.stock.length === 3 && finite(s.heat, 0, c.heatLimit + 10) && int(s.hull, 0, c.hull + 36) && int(s.combo, 0, 100) && int(s.best, 0, 100) && s.best >= s.combo && int(s.meals, 0, 200) && ["idle", "chop", "grill", "season", "plate"].includes(s.stage) && finite(s.stageTime, 0, c.limit + .25) && int(s.cuts, 0, 3) && int(s.quality, 0, 4) && typeof s.flipped === "boolean" && this.point(s.chef) && (!s.warning || this.point(s.warning)) && finite(s.stomp, 0, 20) && finite(s.dodge, 0, 8) && finite(s.vent, 0, 5) && int(s.coins, 0, 10000) && int(s.seasoning, 0, 2) && (s.phase !== "won" || s.guest === c.guests.length - 1 && s.hp === 0) && (s.hp > 0 || s.phase === "won" || s.phase === "lost") && (s.phase !== "lost" || !s.hull || s.clock >= c.limit || s.stock.every(n => n === 0) && s.stage === "idle"));
  }
  private point(v: unknown): v is Point { return record(v) && keys(v, ["x", "y"]) && finite(v.x, .5, 8.5) && finite(v.y, .5, 5.5); }
  private craving() { const g = this.c.guests[this.s.guest]; return g.appetite[this.s.craving % g.appetite.length]; }
  private choices(): Choice[] {
    const s = this.s;
    if (s.phase === "plan") return [{ id: "start", label: "Light the kitchen", description: "Start the banquet. Keep the stove cool and the monster happy." }, ...this.upgradeChoices(["Moonsteel knives", "Water cooling", "Wide serving tray", "Reinforced floor"])];
    if (s.phase !== "cooking") return [];
    const options: Choice[] = [];
    if (s.stage === "idle") DISHES.forEach((d, i) => options.push({ id: `dish:${i}`, label: `Chop ${d.name}`, description: `${s.stock[i]} portions; +${d.heat} stove heat.`, disabled: !s.stock[i] || s.vent > 0 }));
    if (s.stage === "chop") { options.push({ id: "cut", label: `Knife cut ${s.cuts + 1}/3`, description: s.stageTime >= .6 && s.stageTime <= 1.7 ? "Rhythm window is open. Cut now for quality." : "Cut when the marker is between 0.6 and 1.7 seconds." }); }
    if (s.stage === "grill") options.push({ id: "flip", label: "Flip the grill", description: s.flipped ? "Already flipped. Wait for the course to finish grilling." : `Perfect window ${DISHES[s.selected].grill.toFixed(1)}–${(DISHES[s.selected].grill + 1.3).toFixed(1)}s. Current ${s.stageTime.toFixed(1)}s.`, disabled: s.flipped });
    if (s.stage === "season") ["Garden", "Sea", "Fire"].forEach((name, i) => options.push({ id: `season:${i}`, label: `${name} seasoning`, description: `Match ${DISHES[this.craving()].name}'s flavor to add satisfaction.` }));
    if (s.stage === "plate") options.push({ id: "serve", label: "Plate and serve", description: `Quality ${s.quality}/4; current craving ${DISHES[this.craving()].name}.` });
    options.push({ id: "vent", label: "Vent the stove", description: "Cool five heat. The chef stops work for two seconds.", disabled: s.vent > 0 || s.heat < 1 }, { id: "dodge", label: "Dash clear of the stomp", description: s.warning ? "Move across the kitchen before the monster stomps." : "A short dash; recharge takes five seconds.", disabled: s.dodge > 0 });
    return options;
  }
  choose(id: string) {
    if (this.upgrade(id)) return; const s = this.s;
    if (id === "start" && s.phase === "plan") { s.phase = "cooking"; s.hull += this.p.upgrades[3] * 12; s.message = "Kelp smoke rises. A waits for the highlighted cooking action; X vents or dodges danger."; this.emit("engine"); return; }
    if (s.phase !== "cooking") return; const choice = this.choices().find(c => c.id === id); if (!choice || choice.disabled) return;
    if (id.startsWith("dish:")) { s.selected = Number(id.split(":")[1]); s.stock[s.selected]--; s.stage = "chop"; s.stageTime = 0; s.cuts = 0; s.quality = 0; s.flipped = false; s.chef = { x: 2, y: 3.7 }; s.message = `Chopping ${DISHES[s.selected].name}. Time three cuts in the rhythm window.`; this.emit("craft"); }
    else if (id === "cut") { if (s.stageTime >= .6 / (1 + this.p.upgrades[0] * .2) && s.stageTime <= 1.7) s.quality = Math.min(3, s.quality + 1); s.cuts++; s.stageTime = 0; this.emit("strike", .5); if (s.cuts === 3) { s.stage = "grill"; s.chef = { x: 4.5, y: 3.7 }; s.heat += Math.max(1, DISHES[s.selected].heat - this.p.upgrades[1] * .4); s.message = "Grill sizzling. Flip while the gold timing band is open."; } }
    else if (id === "flip") { const d = DISHES[s.selected]; s.flipped = true; if (s.stageTime >= d.grill && s.stageTime <= d.grill + 1.3 + this.p.upgrades[2] * .25) s.quality = Math.min(4, s.quality + 1); else { s.quality = Math.max(0, s.quality - 1); s.message = "The flip missed the perfect band. The course can still be served."; } this.emit("craft"); }
    else if (id.startsWith("season:")) { s.seasoning = Number(id.split(":")[1]); s.stage = "plate"; s.chef = { x: 6.8, y: 3.7 }; s.message = "The plate is ready. Serve before the monster's next craving."; this.emit("craft"); }
    else if (id === "serve") {
      const matched = s.selected === this.craving(), seasoned = s.seasoning === this.craving(); s.combo = matched ? s.combo + 1 : 0; s.best = Math.max(s.best, s.combo);
      const satisfaction = matched ? 5 + s.quality * 2 + (seasoned ? 2 : 0) + Math.min(4, s.combo) : 2 + s.quality;
      s.hp = Math.max(0, s.hp - satisfaction); s.meals++; s.craving++; s.coins += matched ? 8 + s.quality : 3; s.stage = "idle"; s.stageTime = 0;
      s.message = `${this.c.guests[s.guest].name} ${matched ? "loves" : "accepts"} the course. ${satisfaction} satisfaction; chain ${s.combo}.`; this.emit("collect");
      if (!s.hp) { if (s.guest === this.c.guests.length - 1) { s.phase = "won"; s.message = "The final giant lays down its claws. Your banquet has changed the city."; this.award(); } else { s.guest++; s.hp = this.c.guests[s.guest].health; s.craving = 0; s.heat = Math.max(0, s.heat - 3); s.hull = Math.min(this.c.hull + this.p.upgrades[3] * 12, s.hull + 5); s.message = `${this.c.guests[s.guest].name} joins the banquet. New cravings, new temper.`; this.emit("dialogue"); } }
    } else if (id === "vent") { s.heat = Math.max(0, s.heat - 5 - this.p.upgrades[1]); s.vent = 2; s.chef = { x: 1, y: 4.5 }; this.emit("splash"); }
    else if (id === "dodge") { const p = s.warning ?? s.chef; s.chef = { x: p.x < 4.5 ? 7.5 : 1.5, y: p.y < 3 ? 4.8 : 1.6 }; s.dodge = 5; this.emit("dash"); }
  }
  update(dt: number, input: GameInput) {
    const s = this.s; if (["won", "lost"].includes(s.phase)) return;
    if (s.phase === "plan") { this.controls(input, this.choices()); this.pointerChoices(input, this.choices()); return; }
    const step = Math.min(.25, Math.max(0, dt)); s.clock += step; s.dodge = Math.max(0, s.dodge - step); s.vent = Math.max(0, s.vent - step);
    if (s.stage === "idle") { if (input.pressed.has("left")) s.selected = wrap(s.selected - 1, 3); if (input.pressed.has("right")) s.selected = wrap(s.selected + 1, 3); }
    if (input.pressed.has("action")) this.choose(s.stage === "idle" ? `dish:${s.selected}` : s.stage === "chop" ? "cut" : s.stage === "grill" ? "flip" : s.stage === "season" ? `season:${s.selected}` : "serve");
    if (input.pressed.has("alt")) this.choose(s.warning ? "dodge" : "vent");
    if (input.pointer?.pressed) { const p = input.pointer; if (p.y > 404) { const i = Math.floor((p.x - 160) / 214); if (i >= 0 && i < 3) { s.selected = i; if (s.stage === "idle") this.choose(`dish:${i}`); else if (s.stage === "season") this.choose(`season:${i}`); } } else if (hit(p, 304, 215, 194, 177) && s.stage === "grill") this.choose("flip"); }
    const speed = step * 2; if (input.held.has("left")) s.chef.x = Math.max(.5, s.chef.x - speed); if (input.held.has("right")) s.chef.x = Math.min(8.5, s.chef.x + speed); if (input.held.has("up")) s.chef.y = Math.max(.5, s.chef.y - speed); if (input.held.has("down")) s.chef.y = Math.min(5.5, s.chef.y + speed);
    if (s.stage !== "idle" && s.vent === 0) s.stageTime += step;
    if (s.stage === "grill") {
      const d = DISHES[s.selected]; if (s.stageTime >= d.grill + 2 && s.flipped) { s.stage = "season"; s.stageTime = 0; s.message = "Grill complete. Choose garden, sea or fire seasoning."; }
      else if (s.stageTime >= d.grill + 4) { s.stage = "idle"; s.stageTime = 0; s.combo = 0; s.heat += 2; s.hull = Math.max(0, s.hull - 3); s.message = "The course burned. Flip before the grill overheats."; this.emit("fail"); }
    }
    if (s.heat > this.c.heatLimit + this.p.upgrades[1]) { s.hull = Math.max(0, s.hull - 1); s.heat = Math.max(0, s.heat - 1); s.message = "Stove pressure damaged the kitchen. Vent between courses."; this.emit("hit"); }
    s.stomp = Math.max(0, s.stomp - step);
    if (s.stomp <= 2 && !s.warning) { s.warning = { ...s.chef }; s.message = "The floor is glowing red. Dash away before the giant stomps!"; }
    if (!s.stomp) { if (s.warning && Math.hypot(s.chef.x - s.warning.x, s.chef.y - s.warning.y) < 2) { s.hull = Math.max(0, s.hull - this.c.guests[s.guest].attack); s.combo = 0; this.emit("hit"); } s.warning = null; s.stomp = 17 - Math.min(4, this.options.chapterIndex); }
    if (s.phase !== "won" && (!s.hull || s.clock >= this.c.limit || s.stock.every(n => n === 0) && s.stage === "idle")) { s.phase = "lost"; s.message = "The banquet failed. Match cravings, flip in the gold band, and dodge telegraphed stomps."; this.emit("fail"); }
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.s, g = this.c.guests[s.guest], d = DISHES[s.selected]; heading(ctx, this.options, `CHAIN ${s.combo} · ${s.coins} shells`);
    // Moonlit waterfront, immense guest silhouette, tiled kitchen and sea spray.
    const sky = ctx.createLinearGradient(0, 72, 0, 245); sky.addColorStop(0, "#32565d"); sky.addColorStop(1, "#162d42"); ctx.fillStyle = sky; ctx.fillRect(25, 72, 910, 174);
    glow(ctx, 140, 118, 78, "#d4ffff45"); ctx.fillStyle = "#c9dbd0"; ctx.beginPath(); ctx.arc(140, 118, 26, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 35; i++) { const x = i * 33, y = 187 + Math.sin(i + s.clock * .6) * 5; ctx.strokeStyle = "#9bbbbb30"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 25, y); ctx.stroke(); }
    drawSprite(ctx, "monster", 739, 170 + Math.sin(s.clock * .8) * 4, 244, { flip: true }); glow(ctx, 750, 192, 96, DISHES[this.craving()].color + "35");
    panel(ctx, 493, 87, 200, 94, "#15242fe8"); text(ctx, g.name, 507, 112, 18, "#b2e9be"); text(ctx, `CRAVES ${DISHES[this.craving()].name}`, 507, 136, 12); meter(ctx, 507, 151, 169, 1 - s.hp / g.health, "#a6e7a3");
    panel(ctx, 28, 246, 903, 237, "#4f6567", "#b0c2b1"); for (let y = 250; y < 477; y += 36) for (let x = 33; x < 930; x += 45) { ctx.fillStyle = (x + y) % 2 ? "#536a6b" : "#687c78"; ctx.fillRect(x, y, 42, 33); }
    [205, 419, 633].forEach((x, i) => { panel(ctx, x - 79, 259, 158, 88, ["#b69567", "#484d53", "#a8b4a3"][i], "#ddcea9"); text(ctx, ["CHOP", "GRILL", "SEASON / PLATE"][i], x, 286, 16, "#ffe7b1", "center"); drawSprite(ctx, i === 1 ? "ember" : d.sprite, x, 325, 50); if (i === 1 && s.stage === "grill") { glow(ctx, x, 320, 75, "#ff995d55"); particles(ctx, s.clock * 2, x, 306, "#f5c886"); } });
    if (s.warning) { const x = 100 + s.warning.x * 80, y = 251 + s.warning.y * 30; ctx.strokeStyle = "#ff6262"; ctx.lineWidth = 5; ctx.fillStyle = "#f9444439"; ctx.beginPath(); ctx.ellipse(x, y, 83, 35, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); text(ctx, "STOMP!", x, y - 37, 18, "#ffb5a0", "center"); }
    drawSprite(ctx, "chef", 100 + s.chef.x * 80, 250 + s.chef.y * 30, 105);
    panel(ctx, 34,  81, 374, 93, "#162833dc"); text(ctx, `HULL ${s.hull}   HEAT ${s.heat.toFixed(1)}/${this.c.heatLimit}`, 49, 109, 16, "#dcf4dd"); meter(ctx, 49, 120, 341, s.hull / (this.c.hull + this.p.upgrades[3] * 12), "#91d7b8"); meter(ctx, 49, 143, 341, s.heat / this.c.heatLimit, "#ffa771");
    if (s.stage === "grill" || s.stage === "chop") { panel(ctx, 232, 365, 510, 38, "#101b27e8"); const max = s.stage === "grill" ? d.grill + 4 : 2.5; ctx.fillStyle = "#b9cc78"; const a = s.stage === "grill" ? d.grill : .6, b = s.stage === "grill" ? d.grill + 1.3 : 1.7; ctx.fillRect(243 + a / max * 478, 377, (b - a) / max * 478, 12); ctx.fillStyle = "#ffefe0"; ctx.fillRect(243 + Math.min(1, s.stageTime / max) * 478, 372, 5, 24); text(ctx, s.stage.toUpperCase(), 170, 391, 13, "#fff5da", "right"); }
    DISHES.forEach((dish, i) => { panel(ctx, 160 + i * 214, 413, 204,  64, s.selected === i ? "#294d50" : "#1b3036", dish.color); drawSprite(ctx, dish.sprite, 183 + i * 214, 441, 46); text(ctx, dish.name, 215 + i * 214, 440, 13, dish.color); text(ctx, `${s.stock[i]} portions · +${dish.heat} heat`, 215 + i * 214, 461, 11); });
    if (s.phase === "plan") this.decisionOverlay(ctx, `Prepare the banquet · ${this.p.credits} marks`, this.choices()); text(ctx, "A COOKING ACTION · X VENT / DASH · FLIP IN THE GOLD BAND", 480, 521, 15, "#c2e2cf", "center");
  }
  view(): EngineView {
    const s = this.s, g = this.c.guests[s.guest], d = DISHES[s.selected];
    return { ...this.viewBase(), choices: this.choices(), choicePrompt: s.phase === "plan" ? "Kitchen equipment" : "Cooking workflow", choiceMode: s.phase === "plan" ? "modal" : "panel", boss: { name: g.name, health: s.hp, max: g.health }, selection: `${g.name} craves ${DISHES[this.craving()].name}; ${s.hp} appetite left. Selected ${d.name}, ${s.stock[s.selected]} portions, +${d.heat} heat. Stage ${s.stage}, ${s.stageTime.toFixed(1)} seconds; ${s.cuts}/3 knife cuts; quality ${s.quality}/4.${s.stage === "grill" ? ` Flip between ${d.grill} and ${d.grill + 1.3} seconds.` : ""}${s.warning ? ` STOMP in ${s.stomp.toFixed(1)} seconds: dash away.` : ""}`, stats: [{ label: "Hull", value: s.hull }, { label: "Heat", value: `${s.heat.toFixed(1)}/${this.c.heatLimit}` }, { label: "Chain", value: s.combo }, { label: "Courses", value: s.meals }, { label: "Time", value: `${Math.ceil(this.c.limit - s.clock)}s` }] };
  }
}
