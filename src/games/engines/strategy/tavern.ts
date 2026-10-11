import type { EngineOptions, EngineView, GameInput } from "../../types";
import { Strategy, type Choice, type Point, copy, int, finite, nums, record, keys, drawSprite, heading, panel, text, meter, particles, glow, hit, wrap } from "./common";
export const RECIPES = [
  { name: "Pilgrim broth", items: [0, 2], time: 5, value: 8 }, { name: "Berry moon tea", items: [1, 0], time: 4, value: 7 },
  { name: "Ember flatbread", items: [2, 3], time: 7, value: 10 }, { name: "Orchard crumble", items: [1, 2, 1], time: 8, value: 12 },
  { name: "Mountain stew", items: [0, 3, 2], time: 9, value: 14 }, { name: "Sunrise banquet", items: [3, 2, 0, 1], time: 10, value: 18 },
];
const INGREDIENTS = ["Moon herb", "Ruby berry", "Sun grain", "Ember spice"];
type Ticket = { name: string; recipe: number; arrival: number; patience: number; state: "waiting" | "served" | "left" };
type Oven = { recipe: number; count: number; left: number; freshness: number; x: number; y: number };
type Job = { kind: "prep" | "serve"; recipe: number; count: number; target: number; left: number; duration: number; from: Point; to: Point };
type State = { phase: string; clock: number; message: string; selected: number; stock: number[]; tickets: Ticket[]; ovens: Oven[]; job: Job | null; worker: Point; coins: number; chain: number; served: number; trust: number; limit: number; wastes: number };
type Config = { waves: number; guests: number; quota: number; limit: number; recipes: number[]; patience: number };
export class TavernEngine extends Strategy<State> {
  private c: Config;
  constructor(o: EngineOptions) {
    super(o); this.c = o.campaign.chapters[o.chapterIndex].config as unknown as Config;
    const c = this.c, names = ["Rain courier", "Lantern keeper", "Bridge builder", "Rope spinner", "Moon trader", "Orchard child", "Snow ranger", "Mirror bearer"];
    const tickets: Ticket[] = Array.from({ length: c.guests }, (_, i) => ({ name: `${names[(i + o.chapterIndex) % names.length]} ${Math.floor(i / names.length) + 1}`, recipe: c.recipes[i % c.recipes.length], arrival: Math.floor(i / 4) * 28, patience: c.patience, state: "waiting" }));
    const stock = [4, 4, 4, 4]; tickets.forEach(t => RECIPES[t.recipe].items.forEach(n => stock[n]++));
    const initial: State = { phase: "plan", clock: 0, message: "Open the tavern when ready. Two cooking stations work independently; batches save time, but meals lose freshness.", selected: 0, stock, tickets, ovens: [{ recipe: -1, count: 0, left: 0, freshness: 0, x: 2, y: 1 }, { recipe: -1, count: 0, left: 0, freshness: 0, x: 4, y: 1 }], job: null, worker: { x: 3, y: 4 }, coins: 0, chain: 0, served: 0, trust: 4, limit: c.limit, wastes: 0 };
    this.load(initial, s => {
      if (!["plan", "service", "won", "lost"].includes(s.phase) || !int(s.selected, 0, tickets.length - 1) || !nums(s.stock, 4, 0, 500) || s.stock.length !== 4 || !int(s.coins, 0, 10000) || !int(s.chain, 0, 100) || !int(s.served, 0, tickets.length) || !int(s.trust, 0, 4) || !finite(s.limit, c.limit, c.limit + 90) || !int(s.wastes, 0, 100) || !Array.isArray(s.tickets) || s.tickets.length !== tickets.length || !Array.isArray(s.ovens) || s.ovens.length !== 2 || !this.point(s.worker) || !keys(s.worker, ["x", "y"])) return false;
      if (!s.tickets.every((t, i) => keys(t, Object.keys(tickets[i])) && t.name === tickets[i].name && t.recipe === tickets[i].recipe && t.arrival === tickets[i].arrival && finite(t.patience, 0, c.patience + 45) && ["waiting", "served", "left"].includes(t.state))) return false;
      if (s.served !== s.tickets.filter(t => t.state === "served").length || s.trust !== Math.max(0, 4 - s.tickets.filter(t => t.state === "left").length)) return false;
      if (!s.ovens.every(v => keys(v, ["recipe", "count", "left", "freshness", "x", "y"]) && int(v.recipe, -1, 5) && int(v.count, 0, 3) && finite(v.left, 0, 25) && finite(v.freshness, 0, 45) && this.point(v) && (v.count === 0) === (v.recipe === -1))) return false;
      if (s.job && (!keys(s.job, ["kind", "recipe", "count", "target", "left", "duration", "from", "to"]) || !["prep", "serve"].includes(s.job.kind) || !int(s.job.recipe, 0, 5) || !int(s.job.count, 1, 3) || !int(s.job.target, 0, s.job.kind === "prep" ? 1 : tickets.length - 1) || !finite(s.job.duration, 1, 12) || !finite(s.job.left, 0, s.job.duration) || !this.point(s.job.from) || !this.point(s.job.to) || !keys(s.job.from, ["x", "y"]) || !keys(s.job.to, ["x", "y"]))) return false;
      const available = stock.map(n => n + (s.phase === "plan" ? 0 : this.p.upgrades[1] * 3));
      const accounted = [0, 0, 0, 0];
      const add = (recipe: number, count: number) => RECIPES[recipe].items.forEach(i => accounted[i] += count);
      s.tickets.filter(t => t.state === "served").forEach(t => add(t.recipe, 1));
      s.ovens.filter(v => v.count).forEach(v => add(v.recipe, v.count));
      if (s.job) { add(s.job.recipe, s.job.count); if (s.job.kind === "prep" && s.ovens[s.job.target].count > 0 || s.job.kind === "serve" && s.tickets[s.job.target].state !== "waiting") return false; }
      if (s.stock.some((n, i) => n + accounted[i] > available[i]) || s.coins < s.tickets.filter(t => t.state === "served").reduce((n, t) => n + RECIPES[t.recipe].value + 1, 0)) return false;
      const complete = s.served >= c.quota;
      return (s.phase === "won") === complete && (s.phase !== "lost" || s.trust === 0 || s.clock >= s.limit || s.served + s.tickets.filter(t => t.state === "waiting").length < c.quota);
    });
  }
  private point(p: unknown): p is Point { return record(p) && finite(p.x, 0, 11) && finite(p.y, 0, 7); }
  private ready(recipe: number) { return this.s.ovens.findIndex(v => v.recipe === recipe && v.count > 0 && v.left === 0); }
  private active(t: Ticket) { return t.state === "waiting" && t.arrival <= this.s.clock; }
  private choices(): Choice[] {
    const s = this.s;
    if (s.phase === "plan") return [{ id: "open", label: "Open the tavern", description: "Begin the shift. Four travelers arrive in each wave." }, ...this.upgradeChoices(["Copper stoves", "Deep pantry", "Serving runner", "Cozy hearth"])];
    if (s.phase !== "service") return [];
    const t = s.tickets[s.selected], r = RECIPES[t.recipe], ingredient = r.items.map(n => INGREDIENTS[n]).join(" + ");
    return [
      { id: `serve:${s.selected}`, label: `Serve ${t.name}`, description: `${r.name}; collect a fresh ready meal and deliver it.`, disabled: !this.active(t) || this.ready(t.recipe) < 0 || !!s.job },
      { id: `prepare:${t.recipe}:1`, label: `Prepare ${r.name}`, description: `${ingredient}. ${r.time}s stove time.`, disabled: !!s.job || s.ovens.every(v => v.count > 0) || !this.hasStock(t.recipe, 1) },
      { id: `prepare:${t.recipe}:3`, label: `Batch three ${r.name}`, description: "Uses three portions; cooks in 1.6 times the time. Anticipate the next wave.", disabled: !!s.job || s.ovens.every(v => v.count > 0) || !this.hasStock(t.recipe, 3) },
      ...s.tickets.map((ticket, i) => ({ id: `guest:${i}`, label: `${ticket.name}: ${RECIPES[ticket.recipe].name}`, description: ticket.state === "waiting" ? ticket.arrival > s.clock ? `Arrives in ${Math.ceil(ticket.arrival - s.clock)}s` : `${Math.ceil(ticket.patience)}s patience` : ticket.state, disabled: ticket.state !== "waiting" })),
      ...s.ovens.map((v, i) => ({ id: `discard:${i}`, label: `Clear station ${i + 1}`, description: "Discard its remaining food and free the stove.", disabled: !v.count || !!s.job })),
    ];
  }
  private hasStock(recipe: number, count: number) { const need = [0, 0, 0, 0]; RECIPES[recipe].items.forEach(n => need[n] += count); return need.every((n, i) => n <= this.s.stock[i]); }
  choose(id: string) {
    if (this.upgrade(id)) return;
    const s = this.s;
    if (id === "open" && s.phase === "plan") { s.phase = "service"; s.limit += this.p.upgrades[3] * 15; s.stock = s.stock.map(n => n + this.p.upgrades[1] * 3); s.tickets.forEach(t => t.patience += this.p.upgrades[3] * 10); s.message = "First guests are seated. Select a ticket, prepare a recipe, and use both stations."; this.emit("dialogue"); return; }
    if (s.phase !== "service") return;
    const choice = this.choices().find(c => c.id === id); if (!choice || choice.disabled) return;
    if (id.startsWith("guest:")) { s.selected = Number(id.split(":")[1]); return; }
    if (id.startsWith("discard:")) { const v = s.ovens[Number(id.split(":")[1])]; s.wastes += v.count; v.recipe = -1; v.count = 0; v.left = 0; v.freshness = 0; s.chain = 0; s.message = "Station cleared. The pantry still paid for those ingredients."; return; }
    if (id.startsWith("prepare:")) {
      const [, r, n] = id.split(":"), recipe = Number(r), count = Number(n), target = s.ovens.findIndex(v => !v.count), v = s.ovens[target];
      RECIPES[recipe].items.forEach(i => s.stock[i] -= count);
      const duration = 1.4 + Math.hypot(s.worker.x - v.x, s.worker.y - v.y) * .3;
      s.job = { kind: "prep", recipe, count, target, duration, left: duration, from: copy(s.worker), to: { x: v.x, y: v.y + 1 } }; s.message = `Preparing ${count} ${RECIPES[recipe].name}. The other stove can keep cooking.`; this.emit("craft");
    } else if (id.startsWith("serve:")) {
      const i = Number(id.split(":")[1]), t = s.tickets[i], v = s.ovens[this.ready(t.recipe)], to = this.table(i);
      v.count--; if (!v.count) { v.recipe = -1; v.freshness = 0; }
      const duration = Math.max(1, 1.4 + Math.hypot(s.worker.x - to.x, s.worker.y - to.y) * .35 - this.p.upgrades[2] * .5);
      s.job = { kind: "serve", recipe: t.recipe, count: 1, target: i, duration, left: duration, from: copy(s.worker), to }; s.message = `Delivering ${RECIPES[t.recipe].name} to ${t.name}.`; this.emit("step");
    }
  }
  private table(i: number): Point { return { x: 7 + i % 2 * 2, y: 1.7 + Math.floor(i % 4 / 2) * 2.5 }; }
  update(dt: number, input: GameInput) {
    const s = this.s; if (s.phase === "won" || s.phase === "lost") return;
    if (s.phase === "plan") { this.controls(input, this.choices()); this.pointerChoices(input, this.choices()); return; }
    const step = Math.max(0, Math.min(dt, .25)); s.clock += step;
    if (input.pressed.has("up")) s.selected = wrap(s.selected - 1, s.tickets.length); if (input.pressed.has("down")) s.selected = wrap(s.selected + 1, s.tickets.length);
    if (input.pointer?.pressed) s.tickets.forEach((_, i) => { const p = this.table(i); if (hit(input.pointer!, 55 + p.x * 60 - 42, 85 + p.y * 51 - 42, 84, 84)) s.selected = i; });
    if (input.pressed.has("action")) this.choose(this.ready(s.tickets[s.selected].recipe) >= 0 ? `serve:${s.selected}` : `prepare:${s.tickets[s.selected].recipe}:1`);
    if (input.pressed.has("alt")) s.selected = wrap(s.selected + 1, s.tickets.length);
    if (!s.job) { const speed = step * 2; if (input.held.has("left")) s.worker.x = Math.max(1, s.worker.x - speed); if (input.held.has("right")) s.worker.x = Math.min(10, s.worker.x + speed); }
    for (const v of s.ovens) {
      if (v.left > 0) { const old = v.left; v.left = Math.max(0, v.left - step); if (old > 0 && v.left === 0) { v.freshness = 32; this.emit("craft"); s.message = `${RECIPES[v.recipe].name} is ready at station ${s.ovens.indexOf(v) + 1}.`; } }
      else if (v.count) { v.freshness = Math.max(0, v.freshness - step); if (v.freshness === 0) { s.wastes += v.count; v.count = 0; v.recipe = -1; s.chain = 0; s.message = "A batch went stale. Cook closer to the arrival wave."; } }
    }
    if (s.job) {
      const job = s.job; job.left = Math.max(0, job.left - step); const n = 1 - job.left / job.duration; s.worker = { x: job.from.x + (job.to.x - job.from.x) * n, y: job.from.y + (job.to.y - job.from.y) * n };
      if (!job.left) {
        if (job.kind === "prep") { const v = s.ovens[job.target]; v.recipe = job.recipe; v.count = job.count; v.left = RECIPES[job.recipe].time * (job.count === 3 ? 1.6 : 1) / (1 + this.p.upgrades[0] * .2); v.freshness = 32; }
        else { const t = s.tickets[job.target]; if (this.active(t)) { t.state = "served"; s.served++; s.chain++; const tip = RECIPES[t.recipe].value + Math.min(5, s.chain) + Math.floor(t.patience / 18); s.coins += tip; s.message = `${t.name} smiles. +${tip} crowns; service chain ${s.chain}.`; this.emit("collect"); } }
        s.job = null;
      }
    }
    s.tickets.forEach(t => { if (this.active(t) && !(s.job?.kind === "serve" && s.tickets[s.job.target] === t)) { t.patience = Math.max(0, t.patience - step); if (!t.patience) { t.state = "left"; s.trust = Math.max(0, s.trust - 1); s.chain = 0; s.message = `${t.name} left hungry. Work the oldest tickets first.`; this.emit("fail"); } } });
    if (s.served >= this.c.quota) { s.phase = "won"; s.message = `The service target is complete. ${s.coins} crowns earned and ${s.wastes} portions wasted.`; this.award(); }
    else if (!s.trust || s.clock >= s.limit || s.served + s.tickets.filter(t => t.state === "waiting").length < this.c.quota) { s.phase = "lost"; s.message = "The shift ended before everyone ate. Prepare repeated recipes in batches and keep both stoves working."; this.emit("fail"); }
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.s; heading(ctx, this.options, `${s.coins} crowns · ${Math.ceil(s.limit - s.clock)}s`);
    panel(ctx, 28, 76, 904, 415, "#241d27", "#927256");
    for (let y = 80; y < 486; y += 31) for (let x = 31; x < 931; x += 94) { ctx.fillStyle = (x + y) % 3 ? "#554035" : "#604739"; ctx.fillRect(x, y, 91, 29); ctx.fillStyle = "#a5805130"; ctx.fillRect(x + 8, y + 5, 64, 1); }
    ctx.fillStyle = "#322a32"; ctx.fillRect(32, 80, 896, 47); for (let x = 70; x < 870; x += 195) { panel(ctx, x, 83, 68, 46, "#638197", "#acb5ba"); ctx.fillStyle = "#1e1727"; ctx.fillRect(x + 32, 84, 5, 44); ctx.fillRect(x, 105, 68, 4); glow(ctx, x + 32, 126, 80, "#fbc68b27"); }
    // Hearth, herb shelves and two independent working stations.
    panel(ctx, 40, 155, 91, 174, "#40363d", "#a58662"); drawSprite(ctx, "ember", 83, 270, 72); glow(ctx, 82, 275, 120, "#ffac493b");
    for (let i = 0; i < 4; i++) { const x = 164 + i * 68; drawSprite(ctx, ["herb", "berry", "grain", "spice"][i], x, 162, 48); text(ctx, s.stock[i], x, 190, 15, "#fff5dc", "center"); }
    s.ovens.forEach((v, i) => { const x = 176 + i * 148, y = 236; panel(ctx, x - 57, y - 22, 114, 89, "#73747a", "#c2b89b"); drawSprite(ctx, "potion", x, y + 7, 72); if (v.count) { glow(ctx, x, y + 6, 64, v.left ? "#fba45d50" : "#aade7e55"); particles(ctx, s.clock, x, y - 13, "#f9efb7"); text(ctx, `${v.count} ${v.left ? Math.ceil(v.left) + "s" : "READY"}`, x, y + 64, 16, "#f5d19d", "center"); meter(ctx, x - 46, y + 72, 92, v.left ? 1 - v.left / 16 : v.freshness / 32, v.left ? "#efae66" : "#b7db87"); } text(ctx, `STOVE ${i + 1}`, x, y + 98, 13, "#d6ba99", "center"); });
    const visible = s.tickets.map((t, i) => ({ t, i })).filter(({ t }) => t.arrival <= s.clock && t.state === "waiting").slice(0, 4);
    visible.forEach(({ t, i }, seat) => { const p = this.table(seat), x = 55 + p.x * 60, y = 85 + p.y * 51; ctx.fillStyle = "#28232c80"; ctx.beginPath(); ctx.ellipse(x, y + 22, 55, 17, 0, 0, Math.PI * 2); ctx.fill(); panel(ctx, x - 43, y - 9, 86, 46, "#966744", s.selected === i ? "#ffe1aa" : "#503931"); drawSprite(ctx, ["merchant", "ranger", "scholar", "guardian"][i % 4], x + 2, y - 22, 77); if (s.selected === i) glow(ctx, x, y, 75, "#ffdb9250"); text(ctx, RECIPES[t.recipe].name, x, y + 57, 12, "#ffe9c8", "center"); meter(ctx, x - 38, y + 65, 76, t.patience / (this.c.patience + this.p.upgrades[3] * 10), "#9bd69a"); });
    drawSprite(ctx, "bartender", 55 + s.worker.x * 60, 85 + s.worker.y * 51, 89, { flip: s.job ? s.job.to.x < s.job.from.x : false });
    panel(ctx, 36, 408, 393, 69, "#202432de"); text(ctx, `SERVICE ${s.served}/${this.c.quota}  TRUST ${"♥".repeat(s.trust)}`, 51, 432, 18, "#ffc89a"); text(ctx, s.job ? `${s.job.kind === "prep" ? "Preparing" : "Delivering"} ${RECIPES[s.job.recipe].name}` : "Select a guest · A prepare / serve · X next guest", 51, 459, 13);
    if (s.phase === "plan") this.decisionOverlay(ctx, `Before the shift · ${this.p.credits} guild marks`, this.choices());
    text(ctx, "TWO STOVES • FRESH MEALS • WAVE SERVICE", 480, 521, 15, "#efd7af", "center");
  }
  view(): EngineView {
    const s = this.s, t = s.tickets[s.selected], r = RECIPES[t.recipe];
    return { ...this.viewBase(), choices: this.choices(), choiceMode: s.phase === "plan" ? "modal" : "panel", choicePrompt: s.phase === "plan" ? "Choose equipment and open the tavern" : "Service orders", selection: `${t.name}: ${r.name} (${r.items.map(i => INGREDIENTS[i]).join(" + ")}). ${t.state}; ${t.arrival > s.clock ? "arrives in " + Math.ceil(t.arrival - s.clock) + " seconds" : Math.ceil(t.patience) + " seconds patience"}. ${s.ovens.map((v, i) => `Station ${i + 1}: ${v.count ? v.count + " " + RECIPES[v.recipe].name + (v.left ? ", cooks in " + Math.ceil(v.left) + "s" : ", ready, " + Math.ceil(v.freshness) + "s fresh") : "free"}`).join(". ")}. Worker ${s.job ? s.job.kind + " in " + Math.ceil(s.job.left) + "s" : "available"}.`, stats: [{ label: "Served", value: `${s.served}/${this.c.quota}` }, { label: "Trust", value: s.trust }, { label: "Crowns", value: s.coins }, { label: "Shift", value: `${Math.ceil(s.limit - s.clock)}s` }, { label: "Guild", value: this.p.credits }] };
  }
}
