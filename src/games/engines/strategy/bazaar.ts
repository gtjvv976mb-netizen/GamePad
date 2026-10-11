import type { EngineOptions, EngineView, GameInput } from "../../types";
import { Strategy, type Choice, type Point, int, finite, nums, keys, unique, drawSprite, heading, panel, text, glow, particles, wrap } from "./common";
export const GOODS = [
 { name: "Echo coins", cost: 2, peak: 2, value: 7, life: 7, sprite: "crystal" }, { name: "Chrono fruit", cost: 3, peak: 3, value: 12, life: 8, sprite: "berry" },
 { name: "Timeglass", cost: 5, peak: 4, value: 20, life: 11, sprite: "potion" }, { name: "Ancient fossils", cost: 7, peak: 5, value: 28, life: 15, sprite: "scroll" },
 { name: "Dawn seeds", cost: 4, peak: 2, value: 14, life: 7, sprite: "grain" }, { name: "Moon silk", cost: 6, peak: 3, value: 22, life: 10, sprite: "flower" },
];
export const TOWNS = ["Lantern Port", "Copper Observatory", "The Moss Exchange"];
type Contract = { name: string; type: number; count: number; age: number; destination: number; source: number; reward: number; deadline: number };
type Config = { cash: number; target: number; days: number; fee: number; contracts: Contract[] };
type Item = { type: number; age: number; paid: number; serial: number };
type State = { phase: string; clock: number; message: string; town: number; from: number; day: number; cash: number; inventory: Item[]; stock: number[]; selected: number; zone: string; contracts: boolean[]; serial: number; sold: number; revenue: number; travel: number; spoil: number; insurance: number; forecast: boolean };
const CENTERS: Point[] = [{ x: 159, y: 206 }, { x: 501, y: 153 }, { x: 808, y: 281 }];
export class BazaarEngine extends Strategy<State> {
  private c: Config;
  constructor(o: EngineOptions) {
    super(o); this.c = o.campaign.chapters[o.chapterIndex].config as unknown as Config; const c = this.c;
    const initial: State = { phase: "plan", clock: 0, message: "Carry time-sensitive goods between three towns. Fulfill named contracts, watch demand forecasts and return the repair fund to Lantern Port.", town: 0, from: 0, day: 0, cash: c.cash, inventory: [], stock: [3, 3, 3, 3, 3, 3], selected: 0, zone: "market", contracts: c.contracts.map(() => false), serial: 0, sold: 0, revenue: 0, travel: 0, spoil: 0, insurance: 0, forecast: false };
    this.load(initial, s => ["plan", "trade", "won", "lost"].includes(s.phase) && int(s.town, 0, 2) && int(s.from, 0, 2) && int(s.day, 0, c.days + 2) && int(s.cash, 0, 100000) && Array.isArray(s.inventory) && s.inventory.length <= 15 && s.inventory.every(g => keys(g, ["type", "age", "paid", "serial"]) && int(g.type, 0, 5) && int(g.age, 0, c.days + 2) && int(g.paid, 1, 50) && int(g.serial, 0, s.serial)) && unique(s.inventory.map(g => g.serial)) && nums(s.stock, 6, 0, 3) && s.stock.length === 6 && int(s.selected, 0, 20) && ["market", "satchel"].includes(s.zone) && Array.isArray(s.contracts) && s.contracts.length === c.contracts.length && s.contracts.every(v => typeof v === "boolean") && int(s.serial, 0, 500) && int(s.sold, 0, 500) && int(s.revenue, 0, 100000) && finite(s.travel, 0, 1) && int(s.spoil, 0, 500) && int(s.insurance, 0, 3) && typeof s.forecast === "boolean" && (s.phase !== "won" || s.town === 0 && s.cash >= c.target && s.contracts.every(Boolean)) && (s.phase !== "lost" || s.day >= c.days || s.cash === 0 && s.inventory.length === 0 || c.contracts.some((contract, i) => !s.contracts[i] && s.day > contract.deadline)) && s.serial === s.inventory.length + s.sold + s.spoil + c.contracts.reduce((n, contract, i) => n + (s.contracts[i] ? contract.count : 0), 0));
  }
  private capacity() { return 6 + this.p.upgrades[0] * 3; }
  private demand(type: number, town = this.s.town, day = this.s.day) { return 1 + ((town * 3 + type + Math.floor(day / 2)) % 4) * .18; }
  private price(type: number) { const g = GOODS[type]; return Math.ceil(g.cost * (this.s.town === type % 3 ? .9 : 1.15) * (1 + (this.s.day + type) % 3 * .06)); }
  private value(item: Item) { const g = GOODS[item.type]; const maturity = Math.min(1, item.age / g.peak), decay = Math.max(0, item.age - g.peak) * (g.value / (g.life - g.peak + 1)); return Math.max(1, Math.floor((g.cost + (g.value - g.cost) * maturity - decay) * this.demand(item.type))); }
  private eligible(contract: Contract) { return this.s.inventory.filter(g => g.type === contract.type && g.age >= contract.age); }
  private choices(): Choice[] {
    const s = this.s;
    if (s.phase === "plan") return [{ id: "depart", label: "Set out with the caravan", description: "Trade, deliver contracts and bring the repair fund home." }, ...this.upgradeChoices(["Expanded satchels", "Rent charter", "Preserving salts", "Merchant capital"])];
    if (s.phase !== "trade") return [];
    return [...GOODS.map((g, i) => ({ id: `buy:${i}`, label: `Buy ${g.name} · ${this.price(i)} crowns`, description: `${s.stock[i]} available; matures in ${g.peak} days. Demand ${Math.round(this.demand(i) * 100)}%.`, disabled: !s.stock[i] || s.cash < this.price(i) || s.inventory.length >= this.capacity() })),
      ...s.inventory.map((g, i) => ({ id: `sell:${g.serial}`, label: `Sell ${GOODS[g.type].name} · ${this.value(g)} crowns`, description: `Age ${g.age}; peak ${GOODS[g.type].peak}, spoils after ${GOODS[g.type].life + this.p.upgrades[2]} days. Bought for ${g.paid}. Slot ${i + 1}.` })),
      ...this.c.contracts.map((c, i) => ({ id: `contract:${i}`, label: `${c.name} · ${s.contracts[i] ? "delivered" : c.reward + " crowns"}`, description: `${c.count} ${GOODS[c.type].name}, age at least ${c.age}, to ${TOWNS[c.destination]} by day ${c.deadline}. Suggested source ${TOWNS[c.source]}.`, disabled: s.contracts[i] || s.town !== c.destination || s.day > c.deadline || this.eligible(c).length < c.count })),
      ...TOWNS.map((name, i) => ({ id: `travel:${i}`, label: `Travel to ${name}`, description: `${this.travelDays(i)} days, two-crown fare. Goods age in transit.`, disabled: i === s.town || s.cash < 2 || s.day + this.travelDays(i) > this.c.days })),
      { id: "wait", label: "Spend a day at market", description: `Age all goods one day; ${Math.max(0, this.c.fee - this.p.upgrades[1])} crown rent. Refresh local offers.` },
      { id: "forecast", label: "Study tomorrow's demand", description: GOODS.map((g, i) => `${g.name} ${Math.round(this.demand(i, s.town, s.day + 1) * 100)}%`).join("; ") },
    ];
  }
  private travelDays(target: number) { return target === this.s.town ? 0 : this.s.town === 0 && target === 2 || this.s.town === 2 && target === 0 ? 2 : 1; }
  choose(id: string) {
    if (this.upgrade(id)) return; const s = this.s;
    if (id === "depart" && s.phase === "plan") { s.cash += this.p.upgrades[3] * 8; s.phase = "trade"; s.message = "Lantern Port's contracts await. Buy goods, allow them to mature, then deliver at the named town."; this.emit("engine"); return; }
    if (s.phase !== "trade") return; const c = this.choices().find(c => c.id === id); if (!c || c.disabled) return;
    if (id.startsWith("buy:")) { const type = Number(id.split(":")[1]), paid = this.price(type); s.cash -= paid; s.stock[type]--; s.inventory.push({ type, age: 0, paid, serial: s.serial++ }); s.message = `${GOODS[type].name} bought for ${paid}. Watch its maturity and demand.`; this.emit("collect"); }
    else if (id.startsWith("sell:")) { const serial = Number(id.split(":")[1]), i = s.inventory.findIndex(g => g.serial === serial), item = s.inventory[i], value = this.value(item); s.cash += value; s.revenue += value; s.sold++; s.inventory.splice(i, 1); s.selected = Math.min(s.selected, Math.max(0, s.inventory.length - 1)); s.message = `${GOODS[item.type].name} sold for ${value}: ${value - item.paid} crowns over purchase.`; this.emit("collect"); }
    else if (id.startsWith("contract:")) { const i = Number(id.split(":")[1]), contract = this.c.contracts[i], serials = this.eligible(contract).slice(0, contract.count).map(g => g.serial); s.inventory = s.inventory.filter(g => !serials.includes(g.serial)); s.cash += contract.reward; s.revenue += contract.reward; s.contracts[i] = true; s.message = `${contract.name} delivered. ${TOWNS[s.town]} pays ${contract.reward} crowns.`; this.emit("success"); }
    else if (id.startsWith("travel:")) { const target = Number(id.split(":")[1]), days = this.travelDays(target); s.cash -= 2; s.from = s.town; s.town = target; s.travel = 1; this.day(days); s.message = `Arrived at ${TOWNS[target]}; ${days} days passed in the time storm.`; this.emit("engine"); }
    else if (id === "wait") { this.day(1); this.emit("dialogue"); }
    else if (id === "forecast") { s.forecast = !s.forecast; s.message = "The observatory charts the coming demand. Sell when maturity and local demand coincide."; }
    this.check();
  }
  private day(count: number) {
    const s = this.s; for (let i = 0; i < count; i++) { s.day++; s.cash = Math.max(0, s.cash - Math.max(0, this.c.fee - this.p.upgrades[1])); s.inventory.forEach(g => g.age++); const spoiled = s.inventory.filter(g => g.age > GOODS[g.type].life + this.p.upgrades[2]); s.spoil += spoiled.length; s.inventory = s.inventory.filter(g => g.age <= GOODS[g.type].life + this.p.upgrades[2]); } s.stock = [3, 3, 3, 3, 3, 3]; s.forecast = false;
  }
  private check() { const s = this.s; if (s.town === 0 && s.cash >= this.c.target && s.contracts.every(Boolean)) { s.phase = "won"; s.message = `The ${this.c.target}-crown repair fund and every contract reach Lantern Port. The guild remembers your route.`; this.award(); } else if (s.day >= this.c.days || !s.cash && !s.inventory.length || this.c.contracts.some((c, i) => !s.contracts[i] && s.day > c.deadline)) { s.phase = "lost"; s.message = "The time storm closed your route. Respect contract deadlines, keep fare in reserve, and sell before spoilage."; this.emit("fail"); } }
  update(dt: number, input: GameInput) {
    const s = this.s; if (["won", "lost"].includes(s.phase)) return; if (s.phase === "plan") { this.controls(input, this.choices()); this.pointerChoices(input, this.choices()); return; } s.clock += Math.min(.25, Math.max(0, dt)); s.travel = Math.max(0, s.travel - Math.min(.25, Math.max(0, dt)) * .5);
    if (input.pressed.has("up")) { s.zone = "market"; s.selected = 0; } if (input.pressed.has("down")) { s.zone = "satchel"; s.selected = 0; } const length = s.zone === "market" ? 6 : Math.max(1, s.inventory.length); if (input.pressed.has("left")) s.selected = wrap(s.selected - 1, length); if (input.pressed.has("right")) s.selected = wrap(s.selected + 1, length); if (input.pressed.has("action")) this.choose(s.zone === "market" ? `buy:${s.selected % 6}` : s.inventory[s.selected] ? `sell:${s.inventory[s.selected].serial}` : ""); if (input.pressed.has("alt")) this.choose("wait");
    if (input.pointer?.pressed) { const p = input.pointer; CENTERS.forEach((t, i) => { if (Math.hypot(p.x - t.x, p.y - t.y) < 65) this.choose(`travel:${i}`); }); if (p.y > 365) { const i = Math.floor((p.x - 35) / 147); if (i >= 0 && i < 6) { s.zone = "market"; s.selected = i; this.choose(`buy:${i}`); } } }
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.s; heading(ctx, this.options, `${s.cash}/${this.c.target} crowns · DAY ${s.day}/${this.c.days}`);
    // Cloth atlas, authored town landmarks, ridge contours and an animated caravan.
    panel(ctx, 26, 76, 907, 270, "#afa078", "#d8c7a3"); ctx.fillStyle = "#91a18b"; ctx.beginPath(); ctx.moveTo(28, 270); ctx.bezierCurveTo(180, 85, 270, 290, 450, 155); ctx.bezierCurveTo(660, 85, 772, 291, 931, 182); ctx.lineTo(931, 344); ctx.lineTo(28, 344); ctx.fill();
    ctx.strokeStyle = "#55664e40"; ctx.lineWidth = 2; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.ellipse(470, 238, 140 + i * 33, 34 + i * 8, -.3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = "#563f28"; ctx.lineWidth = 5; ctx.setLineDash([8, 8]); ctx.beginPath(); CENTERS.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.lineTo(CENTERS[0].x, CENTERS[0].y); ctx.stroke(); ctx.setLineDash([]);
    CENTERS.forEach((p, i) => { if (s.town === i) glow(ctx, p.x, p.y, 90, "#fff1a781"); drawSprite(ctx, ["beacon", "fountain", "wood"][i], p.x, p.y - 11, 106); text(ctx, TOWNS[i], p.x, p.y + 53, 15, "#302e28", "center"); text(ctx, s.town === i ? "YOUR CARAVAN" : `${this.travelDays(i)} day route · fare 2`, p.x, p.y + 74, 12, "#534234", "center"); });
    const from = CENTERS[s.from], to = CENTERS[s.town], n = 1 - s.travel; drawSprite(ctx, "merchant", from.x + (to.x - from.x) * n -  44, from.y + (to.y - from.y) * n + 18, 83); particles(ctx, s.clock * .4, 670, 288, "#efe9bf", 12);
    GOODS.forEach((g, i) => { const x = 35 + i * 147; panel(ctx, x, 363, 137, 122, s.zone === "market" && s.selected === i ? "#535449" : "#2d3541", "#d6c588"); drawSprite(ctx, g.sprite, x + 67, 408, 62); text(ctx, g.name, x + 69, 450, 12, "#f3e9c3", "center"); text(ctx, `${this.price(i)}c · ${s.stock[i]} stock`, x + 69, 472, 13, "#e4d399", "center"); });
    panel(ctx, 312, 277, 415, 62, "#28303ee5"); text(ctx, `SATCHEL ${s.inventory.length}/${this.capacity()} · CONTRACTS ${s.contracts.filter(Boolean).length}/${s.contracts.length}`, 329, 301, 16, "#ffe5a8"); const item = s.inventory[Math.min(s.selected, Math.max(0, s.inventory.length - 1))]; text(ctx, item ? `${GOODS[item.type].name} age ${item.age} · sale ${this.value(item)}c` : "Buy young. Mature in transit. Deliver on time.", 329, 324, 13);
    if (s.phase === "plan") this.decisionOverlay(ctx, `Guild charter · ${this.p.credits} marks`, this.choices()); text(ctx, "TAP A TOWN TO TRAVEL · A BUY / SELL · X AGE ONE DAY · CONTRACTS PAY MORE", 480, 521, 14, "#e0d5a9", "center");
  }
  view(): EngineView {
    const s = this.s, item = s.inventory[Math.min(s.selected, Math.max(0, s.inventory.length - 1))], type = s.selected % 6, contract = this.c.contracts.find((_, i) => !s.contracts[i]);
    return { ...this.viewBase(), choices: this.choices(), choiceMode: s.phase === "plan" ? "modal" : "panel", choicePrompt: "Trade, contracts and routes", selection: `${TOWNS[s.town]}, day ${s.day}. ${s.zone === "market" ? `${GOODS[type].name}: buy ${this.price(type)} crowns, peak age ${GOODS[type].peak}, maximum base value ${GOODS[type].value}; stock ${s.stock[type]}.` : item ? `${GOODS[item.type].name}: age ${item.age}, bought ${item.paid}, sale value ${this.value(item)}, spoils after age ${GOODS[item.type].life + this.p.upgrades[2]}.` : "Satchel empty."} ${contract ? `Next contract ${contract.name}: ${contract.count} ${GOODS[contract.type].name}, age ${contract.age}+, destination ${TOWNS[contract.destination]}, ${contract.reward} crowns by day ${contract.deadline}.` : `All contracts delivered. Return to Lantern Port with ${this.c.target} crowns.`} Capacity ${s.inventory.length}/${this.capacity()}.`, stats: [{ label: "Fund", value: `${s.cash}/${this.c.target}` }, { label: "Day", value: `${s.day}/${this.c.days}` }, { label: "Contracts", value: `${s.contracts.filter(Boolean).length}/${s.contracts.length}` }, { label: "Satchel", value: `${s.inventory.length}/${this.capacity()}` }, { label: "Spoiled", value: s.spoil }] };
  }
}
