import type { Campaign, EngineFactory, EngineOptions, EngineView, GameEngine, GameInput, GameStatus } from "../types";

// These games deliberately advance on player decisions. Nothing relies on a server,
// wall-clock date, downloaded art, or a random source outside the saved state.
type Point = { x: number; y: number };
const dirs: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const wrap = (n: number, length: number) => (n + length) % length;
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const hash = (text: string) => { let n = 2166136261; for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619); return (n >>> 0).toString(16); };
const int = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: string[]) => obj(v) && Object.keys(v).sort().join(",") === [...names].sort().join(",");
const list = (v: unknown, max: number, check: (item: unknown) => boolean): v is unknown[] => Array.isArray(v) && v.length <= max && v.every(check);
const numbers = (v: unknown, length: number, min: number, max: number): v is number[] => Array.isArray(v) && v.length === length && v.every(n => int(n, min, max));
const notice = (v: unknown): v is string => typeof v === "string" && v.length <= 300;
const inside = (p: Point, x: number, y: number, w: number, h: number) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
const tapped = (input: GameInput) => input.pointer?.pressed ? input.pointer : undefined;

function signature(options: EngineOptions) { return `${options.campaign.slug}:${options.chapterIndex}:${hash(JSON.stringify(options.campaign.chapters[options.chapterIndex].config))}`; }
function saveState<S>(options: EngineOptions, state: S): Record<string, unknown> {
  const data = clone(state);
  return { version: 1, signature: signature(options), data, checksum: hash(JSON.stringify(data)) };
}
function restoreState<S>(options: EngineOptions, initial: S, validate: (data: unknown) => boolean): S {
  if (!options.restored) return initial;
  const saved = options.restored;
  if (!keys(saved, ["version", "signature", "data", "checksum"]) || saved.version !== 1 || saved.signature !== signature(options) || saved.checksum !== hash(JSON.stringify(saved.data)) || !validate(saved.data)) {
    throw new Error(`Invalid ${options.campaign.title} chapter save. Restart this chapter to recover.`);
  }
  return clone(saved.data) as S;
}

function label(ctx: CanvasRenderingContext2D, value: string | number, x: number, y: number, size = 16, color = "#e5eafa", align: CanvasTextAlign = "left") {
  ctx.font = `${size >= 24 ? "bold " : ""}${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(String(value), x, y); ctx.textAlign = "left";
}
function lines(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size = 14, color = "#b4bdcc", maxLines = 5) {
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const words = value.split(" "); let line = "", row = 0;
  for (const word of words) {
    if (ctx.measureText(`${line} ${word}`).width > width && line) { label(ctx, line, x, y + row * (size + 7), size, color); line = word; row++; if (row >= maxLines) return; }
    else line += `${line ? " " : ""}${word}`;
  }
  label(ctx, line, x, y + row * (size + 7), size, color);
}
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke?: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, fraction: number, color: string, h = 8) {
  box(ctx, x, y, w, h, "#090f1f"); box(ctx, x, y, Math.max(2, w * Math.max(0, Math.min(1, fraction))), h, color);
}
function base(ctx: CanvasRenderingContext2D, campaign: Campaign, index: number, subtitle: string) {
  const gradient = ctx.createLinearGradient(0, 0, 960, 540); gradient.addColorStop(0, campaign.palette[0]); gradient.addColorStop(1, "#090f1c");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 960, 540);
  for (let x = 10; x < 960; x += 32) for (let y = 10; y < 540; y += 32) { ctx.fillStyle = (x + y) % 96 === 0 ? "#ffffff10" : "#ffffff04"; ctx.fillRect(x, y, 2, 2); }
  label(ctx, campaign.title.toUpperCase(), 30, 38, 26, campaign.palette[2]);
  label(ctx, `CHAPTER ${index + 1} / ${campaign.chapters.length}  ·  ${campaign.chapters[index].title}`, 30, 67, 15, "#c4ccda");
  label(ctx, subtitle, 930, 38, 15, campaign.palette[2], "right");
  ctx.strokeStyle = "#ffffff18"; ctx.beginPath(); ctx.moveTo(30, 82); ctx.lineTo(930, 82); ctx.stroke();
}
function footer(ctx: CanvasRenderingContext2D, text: string) { label(ctx, text, 480, 520, 14, "#a4b1c5", "center"); }
function pixel(ctx: CanvasRenderingContext2D, x: number, y: number, pattern: string[], color: string, scale = 5) {
  ctx.fillStyle = color; pattern.forEach((row, yy) => [...row].forEach((cell, xx) => { if (cell !== ".") ctx.fillRect(x + xx * scale, y + yy * scale, scale, scale); }));
}
const person = ["..XX..", ".XXXX.", ".XXXX.", "..XX..", "XXXXXX", ".XXXX.", ".X..X.", ".X..X."];

type BrewOrder = { name: string; recipe: number[]; tip: number };
type TavernConfig = { orders: BrewOrder[]; extraStock: number; budget: number; reputation: number };
type TavernState = { ingredient: number; guest: number; stock: number[]; brew: number[]; served: boolean[]; beats: number; reputation: number; coins: number; message: string };
const INGREDIENTS = [{ name: "Moon herb", color: "#9edf95", token: "H" }, { name: "Ruby berry", color: "#f993b7", token: "B" }, { name: "Sun grain", color: "#f5d777", token: "G" }, { name: "Ember spice", color: "#ffa56d", token: "E" }];

class TavernEngine implements GameEngine {
  private config: TavernConfig;
  private state: TavernState;
  constructor(private options: EngineOptions) {
    this.config = options.campaign.chapters[options.chapterIndex].config as unknown as TavernConfig;
    const c = this.config, stock = Array<number>(4).fill(c.extraStock); c.orders.forEach(o => o.recipe.forEach(n => stock[n]++));
    this.state = restoreState(options, { ingredient: 0, guest: 0, stock, brew: [], served: c.orders.map(() => false), beats: 0, reputation: c.reputation, coins: 0, message: "Read a ticket, mix its recipe in order, then serve that guest." }, d => {
      if (!keys(d, ["ingredient", "guest", "stock", "brew", "served", "beats", "reputation", "coins", "message"]) || !obj(d)) return false;
      if (!int(d.ingredient, 0, 3) || !int(d.guest, 0, c.orders.length - 1) || !numbers(d.stock, 4, 0, Math.max(...stock)) || !list(d.brew, 8, n => int(n, 0, 3)) || !Array.isArray(d.served) || d.served.length !== c.orders.length || !d.served.every(n => typeof n === "boolean") || !int(d.beats, 0, c.budget) || !int(d.reputation, 0, c.reputation) || !int(d.coins, 0, c.orders.reduce((sum, o) => sum + o.tip, 0)) || !notice(d.message)) return false;
      return d.coins === c.orders.reduce((sum, o, i) => sum + ((d.served as boolean[])[i] ? o.tip : 0), 0) && d.stock.every((n, i) => n <= stock[i]);
    });
  }
  private pantryExhausted() {
    const needed = Array<number>(4).fill(0), available = [...this.state.stock];
    this.config.orders.forEach((order, i) => { if (!this.state.served[i]) order.recipe.forEach(n => needed[n]++); });
    this.state.brew.forEach(n => available[n]++);
    return needed.some((n, i) => n > available[i]);
  }
  private status(): GameStatus { return this.state.served.every(Boolean) ? "won" : this.state.reputation <= 0 || this.state.beats >= this.config.budget || this.pantryExhausted() ? "lost" : "playing"; }
  update(_dt: number, input: GameInput) {
    if (this.status() !== "playing") return;
    const s = this.state, p = tapped(input), key = input.pressed;
    if (key.has("left")) s.ingredient = wrap(s.ingredient - 1, 4);
    if (key.has("right")) s.ingredient = wrap(s.ingredient + 1, 4);
    if (key.has("up")) s.guest = wrap(s.guest - 1, this.config.orders.length);
    if (key.has("down")) s.guest = wrap(s.guest + 1, this.config.orders.length);
    if (p) {
      for (let i = 0; i < 4; i++) if (inside(p, 42 + i * 140, 372, 128, 96)) s.ingredient = i;
      for (let i = 0; i < this.config.orders.length; i++) if (inside(p, 636, 98 + i * 49, 286, 43)) s.guest = i;
    }
    if (key.has("action")) {
      if (s.stock[s.ingredient] <= 0) s.message = "That jar is empty. Choose a stocked ingredient.";
      else if (s.brew.length >= 8) s.message = "The cauldron is full. Serve it to empty the brew.";
      else { s.stock[s.ingredient]--; s.brew.push(s.ingredient); s.beats++; s.message = `${INGREDIENTS[s.ingredient].name} added. Check the selected ticket.`; }
    }
    if (key.has("alt") && this.status() === "playing") {
      if (s.served[s.guest]) { s.message = "That traveler has already eaten. Select another ticket."; return; }
      if (s.brew.length === 0) { s.message = "The cauldron is empty. Add the recipe's ingredients first."; return; }
      const order = this.config.orders[s.guest];
      s.beats++;
      if (s.brew.length === order.recipe.length && s.brew.every((n, i) => n === order.recipe[i])) {
        s.served[s.guest] = true; s.coins += order.tip; s.message = `${order.name} is warmed. +${order.tip} crowns.`;
        const next = s.served.findIndex(n => !n); if (next >= 0) s.guest = next;
      } else { s.reputation--; s.message = "That recipe was wrong. The brew is wasted and trust falls by one."; }
      s.brew = [];
    }
    if (this.status() === "lost") s.message = s.reputation <= 0 ? "The travelers have lost faith. Restart the shift and read each recipe." : this.pantryExhausted() ? "The pantry cannot complete the remaining tickets. Restart and preserve each ingredient." : "The fire has faded before the last guest was served.";
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.state, c = this.config; base(ctx, this.options.campaign, this.options.chapterIndex, `${s.coins} crowns · TRUST ${s.reputation}`);
    box(ctx, 32, 98, 580, 258, "#160f27b8", "#9b6d9640");
    for (let i = 0; i < 6; i++) { ctx.fillStyle = "#7a4d3438"; ctx.fillRect(55 + i * 88, 119, 67, 11); ctx.fillRect(55 + i * 88, 133, 67, 9); }
    ctx.fillStyle = "#644241"; ctx.fillRect(52, 303, 540, 24); ctx.fillStyle = "#2c1e32"; ctx.fillRect(70, 327, 26, 22); ctx.fillRect(548, 327, 26, 22);
    pixel(ctx, 96, 206, person, "#cea676", 7); pixel(ctx, 496, 206, person, "#a191c9", 7);
    ctx.fillStyle = "#5b3c66"; ctx.beginPath(); ctx.ellipse(325, 258, 74, 55, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = "#917080"; ctx.fillRect(251, 247, 148, 13);
    ctx.fillStyle = s.brew.length ? INGREDIENTS[s.brew[s.brew.length - 1]].color : "#58476b"; ctx.beginPath(); ctx.ellipse(325, 247, 65, 14, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < s.brew.length; i++) box(ctx, 154 + i * 41, 156, 32, 34, INGREDIENTS[s.brew[i]].color);
    label(ctx, s.brew.length ? s.brew.map(n => INGREDIENTS[n].token).join(" → ") : "EMPTY CAULDRON", 325, 224, 19, "#f7e4e6", "center");
    label(ctx, "SHIFT FIRE", 55, 342, 12, "#d4aa9e"); bar(ctx, 174, 333, 412, 1 - s.beats / c.budget, "#edaf79");
    for (let i = 0; i < 4; i++) {
      box(ctx, 42 + i * 140, 372, 128, 96, s.ingredient === i ? "#594051" : "#231b35", s.ingredient === i ? INGREDIENTS[i].color : "#ffffff20");
      pixel(ctx, 90 + i * 140, 383, [".XX.", "XXXX", "XXXX", ".XX."], INGREDIENTS[i].color, 7);
      label(ctx, INGREDIENTS[i].name, 106 + i * 140, 430, 13, "#ebdfe8", "center"); label(ctx, `JAR ${s.stock[i]}`, 106 + i * 140, 453, 13, INGREDIENTS[i].color, "center");
    }
    c.orders.forEach((o, i) => {
      const y = 98 + i * 49; box(ctx, 636, y, 286, 43, s.served[i] ? "#243e39" : s.guest === i ? "#65454f" : "#27223b", s.guest === i ? "#f7c292" : "#ffffff15");
      label(ctx, s.served[i] ? `✓ ${o.name}` : o.name, 650, y + 17, 13, s.served[i] ? "#aee4bb" : "#f1d4bd");
      label(ctx, s.served[i] ? "SERVED" : o.recipe.map(n => INGREDIENTS[n].token).join(" → "), 650, y + 34, 13, "#f4e6df");
    });
    footer(ctx, "← → INGREDIENT   ↑ ↓ GUEST   ENTER ADD   X SERVE   ·   H HERB / B BERRY / G GRAIN / E EMBER");
  }
  view(): EngineView {
    const s = this.state, order = this.config.orders[s.guest], ingredient = INGREDIENTS[s.ingredient];
    const selection = `${order.name}${s.served[s.guest] ? " (served)" : ""}. Recipe: ${order.recipe.map(n => INGREDIENTS[n].name).join(" → ")}. Selected jar: ${ingredient.name}, ${s.stock[s.ingredient]} left. Brew: ${s.brew.length ? s.brew.map(n => INGREDIENTS[n].name).join(" → ") : "empty"}.`;
    return { status: this.status(), objective: this.options.campaign.chapters[this.options.chapterIndex].objective, message: s.message, selection, stats: [{ label: "Served", value: `${s.served.filter(Boolean).length}/${s.served.length}` }, { label: "Trust", value: s.reputation }, { label: "Fire beats", value: this.config.budget - s.beats }, { label: "Tips", value: s.coins }] };
  }
  save() { return saveState(this.options, this.state); }
}

type KaijuConfig = { guests: { name: string; appetite: number[]; health: number; attack: number }[]; hull: number; heatLimit: number; stock: number[] };
type KaijuState = { selected: number; guest: number; health: number; hull: number; heat: number; stock: number[]; craving: number; chain: number; beats: number; message: string };
const DISHES = [{ name: "Moss bun", flavor: 0, power: 3, heat: 2, color: "#96db9e", tag: "MOSS" }, { name: "Tide dumpling", flavor: 1, power: 3, heat: 1, color: "#8fd9f1", tag: "TIDE" }, { name: "Thunder skewer", flavor: 2, power: 4, heat: 3, color: "#f4c36f", tag: "THUNDER" }, { name: "Galaxy feast", flavor: -1, power: 5, heat: 5, color: "#d6a6f9", tag: "ANY FLAVOR" }];
class KitchenEngine implements GameEngine {
  private config: KaijuConfig;
  private state: KaijuState;
  constructor(private options: EngineOptions) {
    this.config = options.campaign.chapters[options.chapterIndex].config as unknown as KaijuConfig;
    const c = this.config;
    this.state = restoreState(options, { selected: 0, guest: 0, health: c.guests[0].health, hull: c.hull, heat: 0, stock: [...c.stock], craving: 0, chain: 0, beats: 0, message: "Match the next craving. Keep heat below the stove limit." }, d => {
      if (!keys(d, ["selected", "guest", "health", "hull", "heat", "stock", "craving", "chain", "beats", "message"]) || !obj(d)) return false;
      return int(d.selected, 0, 3) && int(d.guest, 0, c.guests.length) && int(d.health, 0, Math.max(...c.guests.map(g => g.health))) && int(d.hull, 0, c.hull) && int(d.heat, 0, c.heatLimit) && numbers(d.stock, 4, 0, Math.max(...c.stock)) && d.stock.every((n, i) => n <= c.stock[i]) && int(d.craving, 0, 1000) && int(d.chain, 0, 1000) && int(d.beats, 0, 1000) && notice(d.message) && (d.guest === c.guests.length ? d.health === 0 : d.health <= c.guests[d.guest].health);
    });
  }
  private status(): GameStatus { const s = this.state; return s.hull <= 0 || s.beats >= 1000 || s.stock.every(n => n === 0) && s.health > 0 ? "lost" : s.guest >= this.config.guests.length ? "won" : "playing"; }
  update(_dt: number, input: GameInput) {
    if (this.status() !== "playing") return;
    const s = this.state, c = this.config, key = input.pressed, p = tapped(input);
    if (key.has("left") || key.has("up")) s.selected = wrap(s.selected - 1, 4);
    if (key.has("right") || key.has("down")) s.selected = wrap(s.selected + 1, 4);
    if (p) for (let i = 0; i < 4; i++) if (inside(p, 34 + i * 232, 365, 222, 124)) s.selected = i;
    if (!key.has("action") && !key.has("alt")) return;
    const g = c.guests[s.guest];
    if (key.has("alt")) { s.heat = Math.max(0, s.heat - 4); s.message = "Steam released. The flavor chain is preserved."; }
    else {
      if (s.stock[s.selected] <= 0) { s.message = "That dish has no supplies left. Choose another meal."; return; }
      const dish = DISHES[s.selected]; s.stock[s.selected]--; s.heat += dish.heat;
      if (s.heat > c.heatLimit) { s.hull = Math.max(0, s.hull - 7); s.heat = c.heatLimit; s.chain = 0; s.message = "The stove overheated! Kitchen −7. Vent before cooking again."; }
      else {
        const match = dish.flavor < 0 || dish.flavor === g.appetite[s.craving % g.appetite.length];
        if (match) { s.chain++; const power = dish.power + Math.min(5, s.chain - 1); s.health = Math.max(0, s.health - power); s.craving++; s.message = `Perfect ${dish.tag.toLowerCase()}! Satisfaction +${power}. Chain ${s.chain}.`; }
        else { s.health = Math.max(0, s.health - 1); s.hull = Math.max(0, s.hull - 2); s.chain = 0; s.message = "Wrong craving. The guest is still hungry; kitchen −2."; }
      }
    }
    s.beats++;
    if (s.health <= 0 && s.hull > 0) {
      s.guest++; s.craving = 0; s.chain = 0;
      if (s.guest < c.guests.length) { s.health = c.guests[s.guest].health; s.message = `${g.name} is satisfied! ${c.guests[s.guest].name} approaches.`; }
      else { s.message = "Every guest is satisfied. Your kitchen has won their friendship."; return; }
    } else if (s.beats % 3 === 0) { s.hull = Math.max(0, s.hull - g.attack); s.message += ` Hungry stomp: −${g.attack} kitchen.`; }
    if (this.status() === "lost") s.message = "The kitchen cannot keep serving. Restart and manage heat between matching meals.";
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.state, c = this.config, g = c.guests[Math.min(s.guest, c.guests.length - 1)];
    base(ctx, this.options.campaign, this.options.chapterIndex, `GUEST ${Math.min(c.guests.length, s.guest + 1)}/${c.guests.length}  ·  CHAIN ${s.chain}`);
    box(ctx, 34, 99, 536, 248, "#152e37", "#74a6a448");
    for (let i = 0; i < 5; i++) { ctx.fillStyle = "#95d0d517"; ctx.fillRect(61 + i * 99, 116, 66, 93); }
    const tint = DISHES[g.appetite[s.craving % g.appetite.length]].color;
    pixel(ctx, 232, 130, ["..XX......XX..", ".XXXX....XXXX.", "XXXXXXXXXXXXXX", "XXXXXXXXXXXXXX", "XX..XXXXXX..XX", "XXXXXX..XXXXXX", ".XXXXXXXXXXXX.", "..XX..XX..XX..", ".XXX..XX..XXX."], tint, 12);
    ctx.fillStyle = "#1b203a"; ctx.fillRect(34, 318, 536, 29); label(ctx, g.name.toUpperCase(), 302, 337, 18, "#e8faed", "center");
    box(ctx, 593, 99, 333, 248, "#132332", "#bddfd133");
    label(ctx, "NEXT CRAVING", 612, 126, 14, "#bdcbd3"); label(ctx, DISHES[g.appetite[s.craving % g.appetite.length]].tag, 612, 161, 25, tint);
    label(ctx, "SATISFACTION NEEDED", 612, 190, 13); bar(ctx, 612, 202, 290, s.health / g.health, "#abc78b", 12); label(ctx, `${s.health} / ${g.health}`, 901, 193, 13, "#b7d796", "right");
    label(ctx, `STOVE HEAT ${s.heat}/${c.heatLimit}`, 612, 244, 14, s.heat > c.heatLimit - 3 ? "#ffa491" : "#f9cd99"); bar(ctx, 612, 255, 290, s.heat / c.heatLimit, "#fa9a74", 12);
    label(ctx, `KITCHEN ${s.hull}/${c.hull}`, 612, 298, 14, "#a9d6e9"); bar(ctx, 612, 310, 290, s.hull / c.hull, "#9acddc", 12);
    DISHES.forEach((dish, i) => {
      const x = 34 + i * 232; box(ctx, x, 365, 222, 124, i === s.selected ? "#31474b" : "#192b37", i === s.selected ? dish.color : "#ffffff20");
      pixel(ctx, x + 16, 387, ["..XXXX..", ".XXXXXX.", "XXXXXXXX", ".XXXXXX.", "..XXXX.."], dish.color, 7);
      label(ctx, dish.name, x + 82, 390, 13, dish.color); label(ctx, `${dish.power} SAT · ${dish.heat} HEAT`, x + 82, 413, 12, "#c9d7da");
      label(ctx, `PANTRY ${s.stock[i]}`, x + 17, 469, 13, "#dce4df"); label(ctx, dish.tag, x + 206, 469, 11, dish.color, "right");
    });
    footer(ctx, "← → SELECT DISH   ENTER COOK & FEED   X VENT −4 HEAT   ·   EVERY THIRD BEAT: HUNGRY STOMP");
  }
  view(): EngineView {
    const s = this.state, dish = DISHES[s.selected], guest = this.config.guests[Math.min(s.guest, this.config.guests.length - 1)];
    const craving = s.guest >= this.config.guests.length ? "Every guest is satisfied" : `${guest.name} craves ${DISHES[guest.appetite[s.craving % guest.appetite.length]].tag.toLowerCase()}. ${s.health} satisfaction still needed`;
    const selection = `${craving}. Selected dish: ${dish.name} (${dish.tag.toLowerCase()}), ${dish.power} satisfaction plus a matching combo, +${dish.heat} heat, ${s.stock[s.selected]} portions left. Vent removes 4 heat.`;
    return { status: this.status(), objective: this.options.campaign.chapters[this.options.chapterIndex].objective, message: s.message, selection, stats: [{ label: "Satisfied", value: `${s.guest}/${this.config.guests.length}` }, { label: "Kitchen", value: s.hull }, { label: "Heat", value: `${s.heat}/${this.config.heatLimit}` }, { label: "Combo", value: s.chain }] };
  }
  save() { return saveState(this.options, this.state); }
}

type TacticalConfig = { width: number; height: number; walls: number[][]; allies: number[][]; exit: number[]; enemies: { x: number; y: number; hp: number; damage: number }[]; health: number; turns: number };
type Ally = Point & { hp: number; ap: number; guard: number };
type TacticalState = { cursor: Point; selected: number; allies: Ally[]; enemies: { x: number; y: number; hp: number; damage: number }[]; turn: number; escaped: boolean; message: string };
const TACTIC_X = 35, TACTIC_Y = 105, TACTIC_CELL = 61;
class TacticsEngine implements GameEngine {
  private config: TacticalConfig;
  private state: TacticalState;
  constructor(private options: EngineOptions) {
    this.config = options.campaign.chapters[options.chapterIndex].config as unknown as TacticalConfig;
    const c = this.config, point = (p: unknown) => obj(p) && int(p.x, 0, c.width - 1) && int(p.y, 0, c.height - 1);
    this.state = restoreState(options, { cursor: { x: c.allies[0][0], y: c.allies[0][1] }, selected: 0, allies: c.allies.map(([x, y]) => ({ x, y, hp: c.health, ap: 2, guard: 0 })), enemies: clone(c.enemies), turn: 1, escaped: false, message: "Select a survivor; order movement or attack. Defeat echoes, then reach the gate." }, d => {
      if (!keys(d, ["cursor", "selected", "allies", "enemies", "turn", "escaped", "message"]) || !obj(d)) return false;
      if (!keys(d.cursor, ["x", "y"]) || !point(d.cursor) || !int(d.selected, 0, 1) || !Array.isArray(d.allies) || d.allies.length !== 2 || !d.allies.every(a => keys(a, ["x", "y", "hp", "ap", "guard"]) && point(a) && obj(a) && int(a.hp, 0, c.health) && int(a.ap, 0, 2) && int(a.guard, 0, 2)) || !Array.isArray(d.enemies) || d.enemies.length !== c.enemies.length || !d.enemies.every((e, i) => keys(e, ["x", "y", "hp", "damage"]) && point(e) && obj(e) && int(e.hp, 0, c.enemies[i].hp) && e.damage === c.enemies[i].damage) || !int(d.turn, 1, c.turns) || typeof d.escaped !== "boolean" || !notice(d.message)) return false;
      const living = [...d.allies, ...d.enemies].filter(a => a.hp > 0);
      return living.every(a => !c.walls.some(([x, y]) => a.x === x && a.y === y)) && new Set(living.map(a => `${a.x},${a.y}`)).size === living.length && (!d.escaped || d.enemies.every(e => e.hp === 0) && d.allies.some(a => a.hp > 0 && a.x === c.exit[0] && a.y === c.exit[1]));
    });
  }
  private status(): GameStatus { return this.state.escaped ? "won" : this.state.allies.every(a => a.hp <= 0) || this.state.turn >= this.config.turns ? "lost" : "playing"; }
  private blocked(p: Point) { const c = this.config, s = this.state; return p.x < 0 || p.y < 0 || p.x >= c.width || p.y >= c.height || c.walls.some(([x, y]) => p.x === x && p.y === y) || [...s.allies, ...s.enemies].some(a => a.hp > 0 && a.x === p.x && a.y === p.y); }
  private visible(a: Point, b: Point) {
    // Integer supercover sightline: a ray that touches a wall cannot shoot through it.
    const dx = b.x - a.x, dy = b.y - a.y, steps = Math.max(Math.abs(dx), Math.abs(dy)) * 4;
    for (let i = 1; i < steps; i++) { const x = Math.round(a.x + dx * i / steps), y = Math.round(a.y + dy * i / steps); if (this.config.walls.some(w => w[0] === x && w[1] === y)) return false; }
    return true;
  }
  private stepToward(from: Point, target: Point): Point | undefined {
    const queue: { p: Point; first?: Point }[] = [{ p: from }], seen = new Set([`${from.x},${from.y}`]);
    while (queue.length) {
      const { p, first } = queue.shift()!;
      if (distance(p, target) === 1) return first;
      for (const d of dirs) { const next = { x: p.x + d.x, y: p.y + d.y }, key = `${next.x},${next.y}`; if (!seen.has(key) && !this.blocked(next)) { seen.add(key); queue.push({ p: next, first: first ?? next }); } }
    }
    return undefined;
  }
  private order() {
    const s = this.state, p = s.cursor, ally = s.allies.findIndex(a => a.hp > 0 && a.x === p.x && a.y === p.y);
    if (ally >= 0) { s.selected = ally; s.message = `${ally === 0 ? "Mara" : "Ivo"} selected. ${s.allies[ally].ap} actions remain.`; return; }
    const unit = s.allies[s.selected]; if (unit.hp <= 0) { s.message = "Select the surviving ally."; return; }
    if (unit.ap <= 0) { s.message = "No actions remain for this survivor. Select the other or end the turn."; return; }
    const foe = s.enemies.find(e => e.hp > 0 && e.x === p.x && e.y === p.y), reach = s.selected === 0 ? 1 : 3;
    if (foe) {
      if (distance(unit, foe) > reach || !this.visible(unit, foe)) { s.message = `Target out of sight or range. ${s.selected === 0 ? "Blade range 1." : "Bow range 3."}`; return; }
      const damage = s.selected === 0 ? 4 : 3; foe.hp = Math.max(0, foe.hp - damage); unit.ap--; s.message = `Echo struck for ${damage}. ${foe.hp === 0 ? "It dissolves." : `${foe.hp} strength remains.`}`;
    } else if (distance(unit, p) === 1 && !this.blocked(p)) { unit.x = p.x; unit.y = p.y; unit.ap--; s.message = `${s.selected === 0 ? "Mara" : "Ivo"} advances. ${unit.ap} actions remain.`; }
    else { s.message = "Move one tile into open ground, or select an enemy in range."; return; }
    if (s.enemies.every(e => e.hp === 0) && s.allies.some(a => a.hp > 0 && a.x === this.config.exit[0] && a.y === this.config.exit[1])) { s.escaped = true; s.message = "The field is clear. Your squad has secured the gate."; }
  }
  private enemyTurn() {
    const s = this.state;
    s.allies.forEach(a => { a.guard = a.ap; });
    for (const e of s.enemies.filter(a => a.hp > 0)) {
      const living = s.allies.filter(a => a.hp > 0).sort((a, b) => distance(e, a) - distance(e, b)); if (!living.length) break;
      const target = living[0];
      if (distance(e, target) > 1) { const step = this.stepToward(e, target); if (step) { e.x = step.x; e.y = step.y; } }
      if (distance(e, target) === 1) { const damage = Math.max(0, e.damage - target.guard); target.hp = Math.max(0, target.hp - damage); }
    }
    s.turn++; s.allies.forEach(a => { a.ap = a.hp > 0 ? 2 : 0; a.guard = 0; });
    if (s.allies[s.selected].hp <= 0) s.selected = s.allies.findIndex(a => a.hp > 0) < 0 ? 0 : s.allies.findIndex(a => a.hp > 0);
    s.message = this.status() === "lost" ? "The squad cannot reach the gate. Restart and preserve actions for guard." : "Echoes advanced. Each survivor has two new actions.";
  }
  update(_dt: number, input: GameInput) {
    if (this.status() !== "playing") return;
    const s = this.state, key = input.pressed, p = tapped(input);
    if (key.has("left")) s.cursor.x = Math.max(0, s.cursor.x - 1);
    if (key.has("right")) s.cursor.x = Math.min(this.config.width - 1, s.cursor.x + 1);
    if (key.has("up")) s.cursor.y = Math.max(0, s.cursor.y - 1);
    if (key.has("down")) s.cursor.y = Math.min(this.config.height - 1, s.cursor.y + 1);
    if (p && inside(p, TACTIC_X, TACTIC_Y, this.config.width * TACTIC_CELL, this.config.height * TACTIC_CELL)) { s.cursor = { x: Math.floor((p.x - TACTIC_X) / TACTIC_CELL), y: Math.floor((p.y - TACTIC_Y) / TACTIC_CELL) }; this.order(); }
    else if (key.has("action")) this.order();
    if (key.has("alt") && this.status() === "playing") this.enemyTurn();
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.state, c = this.config; base(ctx, this.options.campaign, this.options.chapterIndex, `TURN ${s.turn}/${c.turns}  ·  ${s.enemies.filter(e => e.hp > 0).length} ECHOES`);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const xx = TACTIC_X + x * TACTIC_CELL, yy = TACTIC_Y + y * TACTIC_CELL, wall = c.walls.some(w => w[0] === x && w[1] === y);
      box(ctx, xx + 2, yy + 2, TACTIC_CELL - 4, TACTIC_CELL - 4, wall ? "#4b536d" : (x + y) % 2 === 0 ? "#27354f" : "#22304a", "#47546b50");
      if (wall) pixel(ctx, xx + 16, yy + 13, ["..XXX.", ".XXXXX", "XXXXXX", ".XXXXX", "..XXX."], "#8996b2", 5);
      if (x === c.exit[0] && y === c.exit[1]) { box(ctx, xx + 11, yy + 9, 39, 43, "#794da8", "#cc9fea"); label(ctx, "↗", xx + 31, yy + 38, 28, "#f1d9fc", "center"); }
      const unit = s.allies[s.selected];
      if (!wall && unit.hp > 0 && unit.ap > 0 && distance(unit, { x, y }) === 1 && !this.blocked({ x, y })) { ctx.fillStyle = "#a8d8f52e"; ctx.fillRect(xx + 7, yy + 7, 47, 47); }
    }
    s.enemies.filter(e => e.hp > 0).forEach(e => { const x = TACTIC_X + e.x * TACTIC_CELL, y = TACTIC_Y + e.y * TACTIC_CELL; pixel(ctx, x + 12, y + 9, ["..XX..", ".XXXX.", "XXXXXX", "XX..XX", ".XXXX.", "..XX.."], "#e7a2d7", 6); label(ctx, e.hp, x + 48, y + 54, 12, "#ffdcf5", "right"); });
    s.allies.forEach((a, i) => { if (a.hp <= 0) return; const x = TACTIC_X + a.x * TACTIC_CELL, y = TACTIC_Y + a.y * TACTIC_CELL; pixel(ctx, x + 16, y + 5, person, i === 0 ? "#bbd2f2" : "#e5d18f", 5); bar(ctx, x + 9, y + 49, 43, a.hp / c.health, "#8fe2b1", 5); if (s.selected === i) { ctx.strokeStyle = "#f0e3a0"; ctx.lineWidth = 3; ctx.strokeRect(x + 5, y + 5, 51, 51); } });
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.strokeRect(TACTIC_X + s.cursor.x * TACTIC_CELL + 1, TACTIC_Y + s.cursor.y * TACTIC_CELL + 1, 59, 59);
    box(ctx, 606, 105, 319, 366, "#101d32", "#7380a538");
    s.allies.forEach((a, i) => { const y = 133 + i * 101; label(ctx, i === 0 ? "MARA · BLADE" : "IVO · STAR BOW", 625, y, 20, s.selected === i ? "#f3dfac" : "#c4d4ec"); label(ctx, `HP ${a.hp}/${c.health}   ACTIONS ${a.ap}`, 625, y + 26, 14); bar(ctx, 625, y + 39, 276, a.hp / c.health, "#96d6b2"); label(ctx, i === 0 ? "4 damage · range 1" : "3 damage · range 3", 625, y + 69, 14, "#a6b5cd"); });
    label(ctx, "TACTICAL ORDERS", 625, 348, 16, "#cbacdf"); lines(ctx, "Each move or attack costs one action. End the turn to let echoes move. Every unused action blocks one damage from each adjacent attacker.", 625, 374, 277, 14);
    footer(ctx, "ARROWS CURSOR   ENTER SELECT / MOVE / ATTACK   X END TURN   ·   TAP TILES TO COMMAND");
  }
  view(): EngineView {
    const s = this.state, ally = s.allies[s.selected], p = s.cursor;
    const occupant = s.allies.findIndex(a => a.hp > 0 && a.x === p.x && a.y === p.y), foe = s.enemies.find(e => e.hp > 0 && e.x === p.x && e.y === p.y);
    const tile = occupant >= 0 ? `${occupant === 0 ? "Mara" : "Ivo"}, ${s.allies[occupant].hp} HP, ${s.allies[occupant].ap} actions` : foe ? `Echo, ${foe.hp} HP, ${foe.damage} attack` : this.config.walls.some(([x, y]) => p.x === x && p.y === y) ? "stone wall" : p.x === this.config.exit[0] && p.y === this.config.exit[1] ? "exit gate" : "open ground";
    const selection = `Selected ${s.selected === 0 ? "Mara" : "Ivo"}: ${ally.hp} HP, ${ally.ap} actions, at (${ally.x + 1}, ${ally.y + 1}). ${s.selected === 0 ? "Blade: 4 damage, range 1" : "Bow: 3 damage, range 3"}. Cursor (${p.x + 1}, ${p.y + 1}): ${tile}.`;
    return { status: this.status(), objective: this.options.campaign.chapters[this.options.chapterIndex].objective, message: s.message, selection, stats: [{ label: "Mara", value: `${s.allies[0].hp} HP` }, { label: "Ivo", value: `${s.allies[1].hp} HP` }, { label: "Echoes", value: s.enemies.filter(e => e.hp > 0).length }, { label: "Turn", value: s.turn }] };
  }
  save() { return saveState(this.options, this.state); }
}

type DeckConfig = { foes: { name: string; hp: number; attacks: number[] }[]; health: number; seed: number; starter: number[]; drafts: number[][] };
type DeckState = { selected: number; encounter: number; hp: number; enemyHp: number; energy: number; block: number; poison: number; turn: number; deck: number[]; draw: number[]; discard: number[]; hand: number[]; draft: boolean; rng: number; message: string };
const SPELLS = [
  { name: "Bone strike", cost: 1, damage: 5, shield: 0, heal: 0, energy: 0, poison: 0, color: "#dec8af", text: "Deal 5 damage." },
  { name: "Mossguard", cost: 1, damage: 0, shield: 7, heal: 0, energy: 0, poison: 0, color: "#a7d6a4", text: "Gain 7 guard this turn." },
  { name: "Marrow siphon", cost: 2, damage: 5, shield: 0, heal: 4, energy: 0, poison: 0, color: "#edb8b8", text: "Deal 5. Heal 4." },
  { name: "Wild sprout", cost: 0, damage: 0, shield: 0, heal: 0, energy: 2, poison: 0, color: "#b8e3ad", text: "Gain 2 energy." },
  { name: "Root meteor", cost: 3, damage: 13, shield: 0, heal: 0, energy: 0, poison: 0, color: "#e6bf77", text: "Deal 13 damage." },
  { name: "Thorn curse", cost: 1, damage: 2, shield: 0, heal: 0, energy: 0, poison: 3, color: "#c1a6df", text: "Deal 2. Add 3 lasting poison." },
  { name: "Bark mantle", cost: 1, damage: 0, shield: 11, heal: 2, energy: 0, poison: 0, color: "#b5c998", text: "Gain 11 guard. Heal 2." },
  { name: "Dawn bloom", cost: 1, damage: 4, shield: 0, heal: 7, energy: 0, poison: 0, color: "#f4d998", text: "Deal 4. Heal 7." },
];
class DeckEngine implements GameEngine {
  private config: DeckConfig;
  private state: DeckState;
  constructor(private options: EngineOptions) {
    this.config = options.campaign.chapters[options.chapterIndex].config as unknown as DeckConfig;
    const c = this.config, saved = options.restored;
    this.state = restoreState(options, { selected: 0, encounter: 0, hp: c.health, enemyHp: c.foes[0].hp, energy: 3, block: 0, poison: 0, turn: 1, deck: [...c.starter], draw: [], discard: [], hand: [], draft: false, rng: c.seed, message: "Play spells with your energy. Guard before the visible enemy intent." }, d => {
      if (!keys(d, ["selected", "encounter", "hp", "enemyHp", "energy", "block", "poison", "turn", "deck", "draw", "discard", "hand", "draft", "rng", "message"]) || !obj(d)) return false;
      if (!int(d.selected, 0, 20) || !int(d.encounter, 0, c.foes.length) || !int(d.hp, 0, c.health) || !int(d.enemyHp, 0, Math.max(...c.foes.map(f => f.hp))) || !int(d.energy, 0, 20) || !int(d.block, 0, 200) || !int(d.poison, 0, 100) || !int(d.turn, 1, 1000) || typeof d.draft !== "boolean" || !int(d.rng, 0, 4294967295) || !notice(d.message) || !list(d.deck, c.starter.length + c.drafts.length, n => int(n, 0, 7)) || !list(d.draw, 20, n => int(n, 0, 7)) || !list(d.discard, 20, n => int(n, 0, 7)) || !list(d.hand, 4, n => int(n, 0, 7))) return false;
      const cards = [...d.draw, ...d.discard, ...d.hand].sort().join(","), deck = [...d.deck].sort().join(",");
      const selectable = d.draft ? c.drafts[d.encounter as number]?.length ?? 0 : d.hand.length;
      return cards === deck && d.deck.length >= c.starter.length && d.selected <= Math.max(0, selectable - 1) && (d.encounter === c.foes.length ? d.enemyHp === 0 && !d.draft : d.enemyHp <= c.foes[d.encounter].hp && (d.enemyHp > 0 || d.draft)) && (!d.draft || d.enemyHp === 0 && d.encounter < c.foes.length - 1);
    });
    if (!saved) { this.state.draw = this.shuffle([...this.state.deck]); this.drawHand(); }
  }
  private shuffle(cards: number[]) { const s = this.state; for (let i = cards.length - 1; i > 0; i--) { s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0; const j = s.rng % (i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; } return cards; }
  private drawHand() {
    const s = this.state; s.hand = [];
    for (let i = 0; i < 4; i++) { if (!s.draw.length) { s.draw = this.shuffle(s.discard); s.discard = []; } const card = s.draw.pop(); if (card !== undefined) s.hand.push(card); }
    s.selected = 0;
  }
  private status(): GameStatus { const s = this.state; return s.hp <= 0 || s.turn >= 1000 ? "lost" : s.encounter >= this.config.foes.length ? "won" : "playing"; }
  private defeated() {
    const s = this.state;
    if (s.enemyHp > 0) return;
    if (s.encounter === this.config.foes.length - 1) { s.encounter++; s.draft = false; s.message = "The final guardian falls. Your lantern carries the forest's morning."; }
    else { s.draft = true; s.selected = 0; s.message = "Victory. Draft one new spell for your deck, then face the next guardian."; }
  }
  update(_dt: number, input: GameInput) {
    if (this.status() !== "playing") return;
    const s = this.state, c = this.config, key = input.pressed, p = tapped(input), choices = s.draft ? c.drafts[s.encounter] : s.hand;
    if (key.has("left") || key.has("up")) s.selected = choices.length ? wrap(s.selected - 1, choices.length) : 0;
    if (key.has("right") || key.has("down")) s.selected = choices.length ? wrap(s.selected + 1, choices.length) : 0;
    const cardWidth = 192, offset = (960 - choices.length * 212 + 20) / 2;
    if (p) choices.forEach((_n, i) => { if (inside(p, offset + i * 212, 318, cardWidth, 174)) s.selected = i; });
    if (key.has("action") && choices.length) {
      const spellId = choices[Math.min(s.selected, choices.length - 1)], spell = SPELLS[spellId];
      if (s.draft) {
        s.deck.push(spellId); s.encounter++; s.draft = false; s.hp = Math.min(c.health, s.hp + 5); s.enemyHp = c.foes[s.encounter].hp; s.energy = 3; s.block = 0; s.poison = 0; s.turn = 1; s.discard = []; s.draw = this.shuffle([...s.deck]); this.drawHand(); s.message = `${spell.name} joins your deck. ${c.foes[s.encounter].name} waits ahead.`;
      } else if (s.energy < spell.cost) s.message = `Not enough energy for ${spell.name}. Play a cheaper spell or end the turn.`;
      else {
        s.energy += spell.energy - spell.cost; s.block += spell.shield; s.hp = Math.min(c.health, s.hp + spell.heal); s.enemyHp = Math.max(0, s.enemyHp - spell.damage); s.poison += spell.poison;
        s.hand.splice(s.selected, 1); s.discard.push(spellId); s.selected = Math.min(s.selected, Math.max(0, s.hand.length - 1)); s.message = `${spell.name} played. ${s.energy} energy remains.`; this.defeated();
      }
    }
    if (key.has("alt") && !s.draft && this.status() === "playing") {
      s.enemyHp = Math.max(0, s.enemyHp - s.poison); this.defeated(); if (s.draft || this.status() !== "playing") return;
      const f = c.foes[s.encounter], incoming = f.attacks[(s.turn - 1) % f.attacks.length], damage = Math.max(0, incoming - s.block);
      s.hp = Math.max(0, s.hp - damage); s.discard.push(...s.hand); s.hand = []; s.energy = 3; s.block = 0; s.turn++; this.drawHand();
      s.message = this.status() === "lost" ? "The lantern has gone dark. Restart and guard the heavier intentions." : `${f.name} dealt ${damage}. A new hand and 3 energy are ready.`;
    }
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.state, c = this.config, f = c.foes[Math.min(s.encounter, c.foes.length - 1)]; base(ctx, this.options.campaign, this.options.chapterIndex, `GUARDIAN ${Math.min(s.encounter + 1, c.foes.length)}/${c.foes.length}  ·  DECK ${s.deck.length}`);
    box(ctx, 34, 103, 890, 194, "#142b2b", "#c4d4a12f");
    for (let i = 0; i < 8; i++) { ctx.fillStyle = "#52746424"; ctx.fillRect(54 + i * 114, 116, 9, 162); }
    pixel(ctx, 108, 134, person, "#d0d4a3", 12); pixel(ctx, 633, 131, ["...XX...", "..XXXX..", ".XXXXXX.", "XX.XX.XX", "XXXXXXXX", "..XXXX..", ".XX..XX.", "XX....XX"], "#b78fa7", 14);
    label(ctx, "THE LANTERN WITCH", 246, 138, 17, "#d4e0b7"); label(ctx, `HP ${s.hp}/${c.health}`, 246, 169, 20, "#b4e2b6"); bar(ctx, 246, 182, 269, s.hp / c.health, "#98c6a2", 12);
    label(ctx, `ENERGY ${s.energy}  GUARD ${s.block}`, 246, 219, 17, "#e6d89a"); label(ctx, `DRAW ${s.draw.length} / DISCARD ${s.discard.length}`, 246, 250, 13, "#b1c7bd");
    label(ctx, f.name, 890, 137, 19, "#e8b9c1", "right"); label(ctx, `${s.enemyHp} HP`, 890, 164, 17, "#e2bbbf", "right");
    label(ctx, s.draft ? "DEFEATED · CHOOSE REWARD" : `INTENT: ${f.attacks[(s.turn - 1) % f.attacks.length]} DAMAGE`, 889, 239, 15, "#f2cca7", "right"); if (s.poison) label(ctx, `POISON ${s.poison} / TURN`, 890, 268, 13, "#cba9e7", "right");
    const choices = s.draft ? c.drafts[s.encounter] : s.hand, offset = (960 - choices.length * 212 + 20) / 2;
    choices.forEach((id, i) => { const spell = SPELLS[id], x = offset + i * 212;
      box(ctx, x, 318, 192, 174, i === s.selected ? "#364a41" : "#20372f", i === s.selected ? spell.color : "#62756d");
      box(ctx, x + 13, 332, 35, 35, spell.color); label(ctx, spell.cost, x + 31, 357, 24, "#172a29", "center");
      label(ctx, spell.name, x + 15, 398, 17, spell.color); lines(ctx, spell.text, x + 15, 427, 162, 14, "#cbd5c4", 3); label(ctx, s.draft ? "DRAFT INTO DECK" : i === s.selected ? "ENTER · PLAY" : "SPELL", x + 15, 480, 11, "#a9b9a9");
    });
    if (!choices.length) label(ctx, "Hand empty. End your turn to draw four spells.", 480, 414, 20, "#c3d2b4", "center");
    footer(ctx, s.draft ? "← → CHOOSE REWARD   ENTER DRAFT   ·   EACH VICTORY HEALS 5 AND STARTS THE NEXT BATTLE" : "← → SELECT SPELL   ENTER PLAY   X END TURN   ·   POISON STRIKES BEFORE THE ENEMY'S INTENT");
  }
  view(): EngineView {
    const s = this.state, foe = this.config.foes[Math.min(s.encounter, this.config.foes.length - 1)], choices = s.draft ? this.config.drafts[s.encounter] : s.hand;
    const spell = choices.length ? SPELLS[choices[Math.min(s.selected, choices.length - 1)]] : undefined;
    const card = spell ? `${s.draft ? "Draft choice" : "Selected card"}: ${spell.name}, costs ${spell.cost} energy. ${spell.text}` : "Hand empty. End the turn to draw four spells.";
    const intent = s.encounter >= this.config.foes.length ? "All guardians are defeated." : s.draft ? "Choose a reward to begin the next battle." : `${foe.name}: ${s.enemyHp} HP. Next intent: ${foe.attacks[(s.turn - 1) % foe.attacks.length]} damage; your guard blocks ${s.block}. ${s.poison ? `Poison deals ${s.poison} before the attack.` : ""}`;
    return { status: this.status(), objective: this.options.campaign.chapters[this.options.chapterIndex].objective, message: s.message, selection: `${card} ${intent}`, stats: [{ label: "Health", value: `${s.hp}/${this.config.health}` }, { label: "Energy", value: s.energy }, { label: "Guard", value: s.block }, { label: "Deck", value: s.deck.length }] };
  }
  save() { return saveState(this.options, this.state); }
}

type BazaarConfig = { cash: number; target: number; days: number; fee: number; market: number[][] };
type Goods = { type: number; age: number; serial: number };
type BazaarState = { cash: number; day: number; selected: number; zone: number; bought: boolean[]; inventory: Goods[]; serial: number; message: string };
const GOODS = [
  { name: "Echo coin", cost: 2, peak: 1, maximum: 6, decay: 4, color: "#e6d08a" },
  { name: "Chrono fruit", cost: 3, peak: 2, maximum: 10, decay: 4, color: "#c3a5e9" },
  { name: "Timeglass", cost: 5, peak: 3, maximum: 16, decay: 6, color: "#9cdee8" },
  { name: "Ancient fossil", cost: 7, peak: 4, maximum: 23, decay: 8, color: "#eeb795" },
];
function resale(g: Goods) { const spec = GOODS[g.type]; return Math.max(0, g.age <= spec.peak ? spec.cost + Math.floor((spec.maximum - spec.cost) * g.age / spec.peak) : spec.maximum - spec.decay * (g.age - spec.peak)); }
class BazaarEngine implements GameEngine {
  private config: BazaarConfig;
  private state: BazaarState;
  constructor(private options: EngineOptions) {
    this.config = options.campaign.chapters[options.chapterIndex].config as unknown as BazaarConfig;
    const c = this.config;
    this.state = restoreState(options, { cash: c.cash, day: 0, selected: 0, zone: 0, bought: [false, false, false], inventory: [], serial: 0, message: "Buy young goods. Advance the day to age them, then sell at their peak." }, d => {
      if (!keys(d, ["cash", "day", "selected", "zone", "bought", "inventory", "serial", "message"]) || !obj(d)) return false;
      return int(d.cash, 0, c.target + 23) && int(d.day, 0, c.days) && int(d.selected, 0, 4) && int(d.zone, 0, 1) && Array.isArray(d.bought) && d.bought.length === 3 && d.bought.every(n => typeof n === "boolean") && list(d.inventory, 5, g => keys(g, ["type", "age", "serial"]) && obj(g) && int(g.type, 0, 3) && int(g.age, 0, c.days) && int(g.serial, 1, c.days * 3)) && int(d.serial, 0, c.days * 3) && d.inventory.every(g => obj(g) && typeof g.serial === "number" && g.serial <= (d.serial as number)) && new Set(d.inventory.map(g => (g as Goods).serial)).size === d.inventory.length && notice(d.message);
    });
  }
  private status(): GameStatus { const s = this.state; return s.cash >= this.config.target ? "won" : s.day >= this.config.days ? "lost" : "playing"; }
  update(_dt: number, input: GameInput) {
    if (this.status() !== "playing") return;
    const s = this.state, c = this.config, key = input.pressed, p = tapped(input);
    if (key.has("up")) { s.zone = 0; s.selected = Math.min(s.selected, 2); }
    if (key.has("down")) { s.zone = 1; s.selected = Math.min(s.selected, Math.max(0, s.inventory.length - 1)); }
    const size = () => s.zone === 0 ? 3 : Math.max(1, s.inventory.length);
    if (key.has("left")) s.selected = wrap(s.selected - 1, size());
    if (key.has("right")) s.selected = wrap(s.selected + 1, size());
    if (p) { for (let i = 0; i < 3; i++) if (inside(p, 38 + i * 224, 108, 210, 155)) { s.zone = 0; s.selected = i; } for (let i = 0; i < s.inventory.length; i++) if (inside(p, 37 + i * 183, 336, 172, 151)) { s.zone = 1; s.selected = i; } }
    if (key.has("action")) {
      if (s.zone === 0) {
        const i = Math.min(s.selected, 2), type = c.market[s.day][i], spec = GOODS[type];
        if (s.bought[i]) s.message = "This offer is sold out. New offers arrive tomorrow.";
        else if (s.inventory.length >= 5) s.message = "Your satchel is full. Sell goods before buying more.";
        else if (s.cash < spec.cost) s.message = "You need more working capital for that good.";
        else { s.cash -= spec.cost; s.serial++; s.bought[i] = true; s.inventory.push({ type, age: 0, serial: s.serial }); s.message = `${spec.name} bought for ${spec.cost}. Peak value ${spec.maximum} at age ${spec.peak}.`; }
      } else if (s.inventory.length) {
        const index = Math.min(s.selected, s.inventory.length - 1), g = s.inventory[index], value = resale(g); s.cash += value; s.inventory.splice(index, 1); s.selected = Math.min(s.selected, Math.max(0, s.inventory.length - 1)); s.message = `${GOODS[g.type].name} sold at age ${g.age} for ${value} crowns.`;
      } else s.message = "Your satchel is empty. Buy from the market first.";
    }
    if (key.has("alt") && this.status() === "playing") { s.day++; s.inventory.forEach(g => { g.age++; }); s.cash = Math.max(0, s.cash - c.fee); s.bought = [false, false, false]; s.selected = 0; s.message = this.status() === "lost" ? "The last day has disappeared. Restart and sell before the market closes." : `Day ${s.day + 1}. Goods aged one day; nightly fee ${c.fee} crowns.`; }
    if (this.status() === "won") s.message = "The repair fund is complete. This piece of tomorrow is saved.";
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.state, c = this.config; base(ctx, this.options.campaign, this.options.chapterIndex, `DAY ${Math.min(s.day + 1, c.days)}/${c.days}  ·  ${s.cash}/${c.target} CROWNS`);
    c.market[Math.min(s.day, c.days - 1)].forEach((id, i) => { const spec = GOODS[id], x = 38 + i * 224; box(ctx, x, 108, 210, 155, s.bought[i] ? "#212636" : s.zone === 0 && s.selected === i ? "#514440" : "#2b2d40", s.zone === 0 && s.selected === i ? spec.color : "#ffffff22");
      pixel(ctx, x + 16, 129, ["..XX..", ".XXXX.", "XXXXXX", "XXXXXX", ".XXXX.", "..XX.."], s.bought[i] ? "#747684" : spec.color, 7); label(ctx, spec.name, x + 72, 133, 15, spec.color); label(ctx, `BUY ${spec.cost}`, x + 72, 159, 18); label(ctx, `PEAK ${spec.maximum} / AGE ${spec.peak}`, x + 15, 209, 13, "#c5c6d7"); label(ctx, s.bought[i] ? "SOLD OUT" : "ENTER · BUY OFFER", x + 15, 243, 12, "#cfba92");
    });
    box(ctx, 727, 108, 195, 155, "#25263b", "#f1d19a38"); label(ctx, "REPAIR FUND", 741, 134, 14, "#f0d191"); label(ctx, `${s.cash} CROWNS`, 741, 171, 22, "#ede0b0"); bar(ctx, 741, 187, 162, s.cash / c.target, "#d9b873", 12); label(ctx, `NIGHT FEE: ${c.fee}`, 741, 237, 13, "#bebcd0");
    label(ctx, `TIME SATCHEL  ${s.inventory.length}/5`, 38, 300, 19, "#d6c3ea"); label(ctx, "Sell at the peak. Older goods fade; age-0 sales only refund their cost.", 38, 322, 12, "#aab1c6");
    for (let i = 0; i < 5; i++) {
      const g = s.inventory[i], x = 37 + i * 183, spec = g ? GOODS[g.type] : undefined;
      box(ctx, x, 336, 172, 151, g ? s.zone === 1 && s.selected === i ? "#454352" : "#2b2d40" : "#181d2f", s.zone === 1 && s.selected === i ? "#e8d895" : "#ffffff16");
      if (g && spec) { label(ctx, spec.name, x + 11, 361, 14, spec.color); label(ctx, `AGE ${g.age} / PEAK ${spec.peak}`, x + 11, 390, 12, "#c8c6d7"); label(ctx, `${resale(g)} CROWNS`, x + 11, 424, 19, g.age === spec.peak ? "#bbe5a1" : "#e6d09f"); label(ctx, g.age === spec.peak ? "RIPE · ENTER SELL" : g.age > spec.peak ? "FADING · ENTER SELL" : "GROWING · ENTER SELL", x + 11, 467, 12, "#b7bace"); }
      else label(ctx, "EMPTY SLOT", x + 86, 417, 13, "#596177", "center");
    }
    footer(ctx, "↑ MARKET   ↓ SATCHEL   ← → SELECT   ENTER BUY / SELL   X END DAY   ·   FIVE INVENTORY SLOTS");
  }
  view(): EngineView {
    const s = this.state;
    let selection: string;
    if (s.zone === 0) {
      const index = Math.min(s.selected, 2), spec = GOODS[this.config.market[Math.min(s.day, this.config.days - 1)][index]];
      selection = `Market offer ${index + 1}: ${spec.name}, buy for ${spec.cost} crowns${s.bought[index] ? " (sold out today)" : ""}. Peak sale: ${spec.maximum} at age ${spec.peak}; loses ${spec.decay} per day afterward. Satchel has ${5 - s.inventory.length} open slots.`;
    } else {
      const good = s.inventory[Math.min(s.selected, s.inventory.length - 1)];
      if (good) { const spec = GOODS[good.type]; selection = `Satchel card ${s.selected + 1}: ${spec.name}, age ${good.age}. Sell now for ${resale(good)} crowns. Peak: ${spec.maximum} at age ${spec.peak}; loses ${spec.decay} per day afterward.`; }
      else selection = "Satchel empty. Press Up to browse today's market offers.";
    }
    return { status: this.status(), objective: this.options.campaign.chapters[this.options.chapterIndex].objective, message: s.message, selection, stats: [{ label: "Cash", value: `${s.cash}/${this.config.target}` }, { label: "Day", value: `${Math.min(s.day + 1, this.config.days)}/${this.config.days}` }, { label: "Satchel", value: `${s.inventory.length}/5` }, { label: "Fee", value: this.config.fee }] };
  }
  save() { return saveState(this.options, this.state); }
}

type LightConfig = { width: number; height: number; emitters: (Point & { dir: number; color: number })[]; mirrors: (Point & { slash: boolean; fixed?: boolean })[]; receivers: (Point & { color: number })[]; walls: number[][]; prisms: (Point & { color: number })[]; charges: number };
type LightState = { cursor: Point; mirrors: boolean[]; charges: number; lit: boolean[]; pulsed: boolean; message: string };
type BeamSegment = { from: Point; to: Point; color: number };
const LIGHT_X = 35, LIGHT_Y = 101, LIGHT_CELL = 64, LIGHT_COLORS = ["#f6dc78", "#8ddafa", "#d5a3f5"];
class LightEngine implements GameEngine {
  private config: LightConfig;
  private state: LightState;
  constructor(private options: EngineOptions) {
    this.config = options.campaign.chapters[options.chapterIndex].config as unknown as LightConfig;
    const c = this.config;
    this.state = restoreState(options, { cursor: { x: c.mirrors[0].x, y: c.mirrors[0].y }, mirrors: c.mirrors.map(m => m.slash), charges: c.charges, lit: c.receivers.map(() => false), pulsed: false, message: "Rotate mirrors using the dim beam preview, then send a power pulse." }, d => {
      if (!keys(d, ["cursor", "mirrors", "charges", "lit", "pulsed", "message"]) || !obj(d)) return false;
      return keys(d.cursor, ["x", "y"]) && obj(d.cursor) && int(d.cursor.x, 0, c.width - 1) && int(d.cursor.y, 0, c.height - 1) && Array.isArray(d.mirrors) && d.mirrors.length === c.mirrors.length && d.mirrors.every((n, i) => typeof n === "boolean" && (!c.mirrors[i].fixed || n === c.mirrors[i].slash)) && int(d.charges, 0, c.charges) && Array.isArray(d.lit) && d.lit.length === c.receivers.length && d.lit.every(n => typeof n === "boolean") && typeof d.pulsed === "boolean" && notice(d.message) && (d.pulsed ? d.charges < c.charges : d.charges > 0 && d.lit.every(n => n === false));
    });
    if (options.restored && this.state.pulsed && this.trace().lit.some((n, i) => n !== this.state.lit[i])) throw new Error("Saved light network does not match its receivers.");
  }
  private status(): GameStatus { return this.state.pulsed && this.state.lit.every(Boolean) ? "won" : this.state.charges <= 0 ? "lost" : "playing"; }
  private trace(): { segments: BeamSegment[]; lit: boolean[] } {
    const c = this.config, segments: BeamSegment[] = [], lit = c.receivers.map(() => false);
    c.emitters.forEach(e => {
      let p: Point = { x: e.x, y: e.y }, dir = e.dir, color = e.color;
      const seen = new Set<string>();
      for (let i = 0; i < c.width * c.height * 12; i++) {
        const key = `${p.x},${p.y},${dir},${color}`; if (seen.has(key)) break; seen.add(key);
        const next = { x: p.x + dirs[dir].x, y: p.y + dirs[dir].y };
        if (next.x < 0 || next.y < 0 || next.x >= c.width || next.y >= c.height) break;
        segments.push({ from: p, to: next, color }); p = next;
        if (c.walls.some(([x, y]) => x === p.x && y === p.y)) break;
        const target = c.receivers.findIndex(r => r.x === p.x && r.y === p.y);
        if (target >= 0) { if (c.receivers[target].color === color) lit[target] = true; break; }
        const prism = c.prisms.find(r => r.x === p.x && r.y === p.y); if (prism) color = prism.color;
        const mirror = c.mirrors.findIndex(m => m.x === p.x && m.y === p.y);
        if (mirror >= 0) dir = this.state.mirrors[mirror] ? [3, 2, 1, 0][dir] : [1, 0, 3, 2][dir];
      }
    });
    return { segments, lit };
  }
  private rotate() {
    const s = this.state, c = this.config, i = c.mirrors.findIndex(m => m.x === s.cursor.x && m.y === s.cursor.y);
    if (i < 0) { s.message = "Select a silver mirror to rotate it."; return; }
    if (c.mirrors[i].fixed) { s.message = "That stone-ring mirror is fixed. Route the light through it."; return; }
    s.mirrors[i] = !s.mirrors[i]; s.pulsed = false; s.lit = c.receivers.map(() => false); s.message = "Mirror turned. Follow the dim beams before spending a pulse.";
  }
  update(_dt: number, input: GameInput) {
    if (this.status() !== "playing") return;
    const s = this.state, c = this.config, key = input.pressed, p = tapped(input);
    if (key.has("left")) s.cursor.x = Math.max(0, s.cursor.x - 1);
    if (key.has("right")) s.cursor.x = Math.min(c.width - 1, s.cursor.x + 1);
    if (key.has("up")) s.cursor.y = Math.max(0, s.cursor.y - 1);
    if (key.has("down")) s.cursor.y = Math.min(c.height - 1, s.cursor.y + 1);
    if (p && inside(p, LIGHT_X, LIGHT_Y, c.width * LIGHT_CELL, c.height * LIGHT_CELL)) { s.cursor = { x: Math.floor((p.x - LIGHT_X) / LIGHT_CELL), y: Math.floor((p.y - LIGHT_Y) / LIGHT_CELL) }; this.rotate(); }
    else if (key.has("action")) this.rotate();
    if (key.has("alt")) { s.lit = this.trace().lit; s.pulsed = true; s.charges--; s.message = s.lit.every(Boolean) ? "All receivers share one pulse. The chamber is illuminated." : s.charges <= 0 ? "Power exhausted. Restart the chamber and follow the preview carefully." : `${s.lit.filter(Boolean).length}/${s.lit.length} receivers lit. Adjust the mirrors before pulsing again.`; }
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.state, c = this.config, trace = this.trace(); base(ctx, this.options.campaign, this.options.chapterIndex, `POWER ${s.charges}/${c.charges}  ·  ${trace.lit.filter(Boolean).length}/${trace.lit.length} PREVIEW`);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const xx = LIGHT_X + x * LIGHT_CELL, yy = LIGHT_Y + y * LIGHT_CELL; box(ctx, xx + 2, yy + 2, 60, 60, (x + y) % 2 === 0 ? "#20354d" : "#1b2e43", "#ffffff0e"); }
    c.walls.forEach(([x, y]) => { const xx = LIGHT_X + x * LIGHT_CELL, yy = LIGHT_Y + y * LIGHT_CELL; box(ctx, xx + 8, yy + 8, 48, 48, "#647084", "#a1aaba"); ctx.fillStyle = "#818fa0"; ctx.fillRect(xx + 11, yy + 28, 42, 4); });
    trace.segments.forEach(segment => { ctx.strokeStyle = LIGHT_COLORS[segment.color]; ctx.globalAlpha = s.pulsed ? 0.9 : 0.36; ctx.lineWidth = s.pulsed ? 5 : 3; ctx.beginPath(); ctx.moveTo(LIGHT_X + (segment.from.x + 0.5) * LIGHT_CELL, LIGHT_Y + (segment.from.y + 0.5) * LIGHT_CELL); ctx.lineTo(LIGHT_X + (segment.to.x + 0.5) * LIGHT_CELL, LIGHT_Y + (segment.to.y + 0.5) * LIGHT_CELL); ctx.stroke(); }); ctx.globalAlpha = 1;
    c.mirrors.forEach((m, i) => { const x = LIGHT_X + (m.x + 0.5) * LIGHT_CELL, y = LIGHT_Y + (m.y + 0.5) * LIGHT_CELL; if (m.fixed) { ctx.strokeStyle = "#8a929b"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = "#d9e7f3"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 18, y + (s.mirrors[i] ? 18 : -18)); ctx.lineTo(x + 18, y + (s.mirrors[i] ? -18 : 18)); ctx.stroke(); ctx.fillStyle = "#ffffff"; ctx.fillRect(x - 3, y - 3, 6, 6);
    });
    c.prisms.forEach(p => { const x = LIGHT_X + (p.x + 0.5) * LIGHT_CELL, y = LIGHT_Y + (p.y + 0.5) * LIGHT_CELL; ctx.fillStyle = LIGHT_COLORS[p.color]; ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x + 16, y); ctx.lineTo(x, y + 22); ctx.lineTo(x - 16, y); ctx.closePath(); ctx.fill(); });
    c.emitters.forEach(e => { const x = LIGHT_X + (e.x + 0.5) * LIGHT_CELL, y = LIGHT_Y + (e.y + 0.5) * LIGHT_CELL; box(ctx, x - 21, y - 21, 42, 42, "#384556", LIGHT_COLORS[e.color]); label(ctx, ["→", "↓", "←", "↑"][e.dir], x, y + 10, 30, LIGHT_COLORS[e.color], "center"); });
    c.receivers.forEach((r, i) => { const x = LIGHT_X + (r.x + 0.5) * LIGHT_CELL, y = LIGHT_Y + (r.y + 0.5) * LIGHT_CELL; ctx.fillStyle = trace.lit[i] ? LIGHT_COLORS[r.color] : "#263145"; ctx.strokeStyle = LIGHT_COLORS[r.color]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); label(ctx, trace.lit[i] ? "✦" : "○", x, y + 7, 23, trace.lit[i] ? "#243348" : LIGHT_COLORS[r.color], "center"); });
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.strokeRect(LIGHT_X + s.cursor.x * LIGHT_CELL + 1, LIGHT_Y + s.cursor.y * LIGHT_CELL + 1, 62, 62);
    box(ctx, 700, 101, 227, 383, "#17283d", "#cde4ed25"); label(ctx, "LIGHT NETWORK", 717, 134, 18, "#c7e7f6");
    c.receivers.forEach((r, i) => { label(ctx, `${trace.lit[i] ? "●" : "○"} ${["GOLD", "BLUE", "VIOLET"][r.color]}`, 718, 174 + i * 34, 17, LIGHT_COLORS[r.color]); });
    label(ctx, "SILVER = ROTATABLE", 717, 302, 12, "#dce8ec"); label(ctx, "STONE RING = FIXED", 717, 328, 12, "#b9c8d7"); label(ctx, "DIAMOND = COLOR", 717, 354, 12, "#cba9ee"); lines(ctx, "Follow the dim preview. Every receiver must glow in one pulse. Loops stop automatically.", 717, 394, 196, 13, "#a9bdcc", 4);
    footer(ctx, "ARROWS CURSOR   ENTER ROTATE   X POWER PULSE   ·   TAP MIRRORS TO TURN THEM");
  }
  view(): EngineView {
    const s = this.state, c = this.config, p = s.cursor, mirror = c.mirrors.findIndex(m => m.x === p.x && m.y === p.y), preview = this.trace().lit;
    const colorNames = ["gold", "blue", "violet"], receiver = c.receivers.find(r => r.x === p.x && r.y === p.y), crystal = c.prisms.find(r => r.x === p.x && r.y === p.y), emitter = c.emitters.find(e => e.x === p.x && e.y === p.y);
    const tile = mirror >= 0 ? `${s.mirrors[mirror] ? "rising mirror (/)" : "falling mirror (\\)"}${c.mirrors[mirror].fixed ? ", fixed in a stone ring" : ", can rotate"}` : receiver ? `${colorNames[receiver.color]} receiver` : crystal ? `${colorNames[crystal.color]} color crystal` : emitter ? `${colorNames[emitter.color]} source pointing ${["right", "down", "left", "up"][emitter.dir]}` : c.walls.some(([x, y]) => p.x === x && p.y === y) ? "stone wall" : "open channel";
    const selection = `Cursor (${p.x + 1}, ${p.y + 1}): ${tile}. Preview: ${preview.filter(Boolean).length}/${preview.length} receivers connected. ${c.receivers.map((r, i) => `${colorNames[r.color]} ${preview[i] ? "ready" : "unconnected"}`).join(", ")}. A power pulse must light every receiver together.`;
    return { status: this.status(), objective: this.options.campaign.chapters[this.options.chapterIndex].objective, message: s.message, selection, stats: [{ label: "Power", value: `${s.charges}/${this.config.charges}` }, { label: "Preview lit", value: `${preview.filter(Boolean).length}/${s.lit.length}` }, { label: "Mirrors", value: s.mirrors.length }] };
  }
  save() { return saveState(this.options, this.state); }
}

export const createStrategyEngine: EngineFactory = (options) => {
  if (!Number.isInteger(options.chapterIndex) || options.chapterIndex < 0 || options.chapterIndex >= options.campaign.chapters.length) throw new Error("Campaign chapter is out of range.");
  switch (options.campaign.slug) {
    case "ptv": return new TavernEngine(options);
    case "kkn": return new KitchenEngine(options);
    case "sft": return new TacticsEngine(options);
    case "mmr": return new DeckEngine(options);
    case "cbz": return new BazaarEngine(options);
    case "lmc": return new LightEngine(options);
    default: throw new Error(`No original strategy game for ${options.campaign.slug}.`);
  }
};
