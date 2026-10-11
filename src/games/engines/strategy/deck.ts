import type { EngineOptions, EngineView, GameInput } from "../../types";
import { Strategy, type Choice, int, nums, unique, copy, drawSprite, heading, panel, text, meter, glow, particles, wrap, hit } from "./common";
type Spell = { name: string; cost: number; damage?: number; block?: number; heal?: number; energy?: number; poison?: number; draw?: number; growth?: number; exhaust?: boolean; icon: string; words: string };
export const SPELLS: Spell[] = [
 { name: "Bone strike", cost: 1, damage: 6, icon: "knight", words: "Deal 6 damage." },
 { name: "Mossguard", cost: 1, block: 8, icon: "herb", words: "Gain 8 guard." },
 { name: "Marrow siphon", cost: 2, damage: 7, heal: 5, icon: "potion", words: "Deal 7 damage; heal 5." },
 { name: "Wild sprout", cost: 0, energy: 2, exhaust: true, icon: "flower", words: "Gain 2 energy. Exhaust." },
 { name: "Root meteor", cost: 3, damage: 20, icon: "crystal", words: "Deal 20 damage." },
 { name: "Thorn curse", cost: 1, damage: 3, poison: 4, icon: "thornbeast", words: "Deal 3; apply 4 blight." },
 { name: "Bark mantle", cost: 1, block: 12, heal: 2, icon: "wood", words: "Gain 12 guard; heal 2." },
 { name: "Dawn bloom", cost: 1, damage: 5, heal: 7, icon: "flower", words: "Deal 5; heal 7." },
 { name: "Lantern study", cost: 1, draw: 3, icon: "scholar", words: "Draw 3 cards." },
 { name: "Seed memory", cost: 0, growth: 2, exhaust: true, icon: "grain", words: "Gain 2 growth for this battle. Exhaust." },
 { name: "Living briar", cost: 2, damage: 9, poison: 6, icon: "herb", words: "Deal 9; apply 6 blight." },
 { name: "Root shelter", cost: 2, block: 19, draw: 1, icon: "guardian", words: "Gain 19 guard; draw one." },
 { name: "Bone lantern", cost: 1, energy: 1, draw: 2, exhaust: true, icon: "beacon", words: "Gain one energy, draw two. Exhaust." },
 { name: "Spore whisper", cost: 0, poison: 2, icon: "wisp", words: "Apply 2 blight." },
 { name: "Thicket cut", cost: 1, damage: 9, icon: "ranger", words: "Deal 9 damage." },
 { name: "Ivory thorn", cost: 2, damage: 14, block: 5, icon: "crystal", words: "Deal 14; gain 5 guard." },
 { name: "Spring rain", cost: 1, heal: 10, exhaust: true, icon: "fountain", words: "Heal 10. Exhaust." },
 { name: "Sap armor", cost: 1, block: 6, growth: 1, icon: "wood", words: "Gain 6 guard and one growth." },
 { name: "Moon pollen", cost: 1, poison: 5, draw: 1, icon: "flower", words: "Apply 5 blight; draw one." },
 { name: "Echo harvest", cost: 2, damage: 11, energy: 1, icon: "scroll", words: "Deal 11; recover one energy." },
 { name: "Old grove", cost: 3, block: 24, heal: 8, icon: "gardener", words: "Gain 24 guard; heal 8." },
 { name: "Marrow surge", cost: 0, damage: 4, exhaust: true, icon: "ember", words: "Deal 4 damage. Exhaust." },
 { name: "Witch's promise", cost: 2, growth: 3, block: 8, exhaust: true, icon: "archivist", words: "Gain 3 growth and 8 guard. Exhaust." },
 { name: "Morning star", cost: 3, damage: 24, heal: 4, icon: "portal", words: "Deal 24 damage; heal 4." },
];
export const spell = (id: number) => SPELLS[id % 24];
export const spellCost = (id: number) => Math.max(0, spell(id).cost - (id >= 24 && [2, 4, 10, 11, 15, 19, 20, 23].includes(id % 24) ? 1 : 0));
type Foe = { name: string; hp: number; attacks: number[] };
type Config = { foes: Foe[]; health: number; seed: number; nodes: number };
type State = { phase: string; clock: number; message: string; node: number; route: string; selected: number; hp: number; max: number; embers: number; deck: number[]; hand: number[]; draw: number[]; discard: number[]; exile: number[]; enemyHp: number; enemyMax: number; enemyGuard: number; enemyPoison: number; growth: number; block: number; energy: number; turn: number; seed: number; rewards: number[]; relics: number[]; battles: number; elite: boolean; wounds: number; shop: number[]; visited: string[] };
export class DeckEngine extends Strategy<State> {
  private c: Config;
  constructor(o: EngineOptions) {
    super(o); this.c = o.campaign.chapters[o.chapterIndex].config as unknown as Config; const c = this.c;
    const deck = this.p.cards.length ? copy(this.p.cards) : [0, 0, 0, 1, 1, 1, 2, 3, 5, 7, 8, 9];
    const initial: State = { phase: "plan", clock: 0, message: "Chart an expedition beneath the roots. Choose battles, strange events and elite paths; use camps and traders to shape your deck.", node: 0, route: "", selected: 0, hp: c.health, max: c.health, embers: 18, deck, hand: [], draw: [], discard: [], exile: [], enemyHp: 0, enemyMax: 0, enemyGuard: 0, enemyPoison: 0, growth: 0, block: 0, energy: 3, turn: 0, seed: c.seed, rewards: [], relics: copy(this.p.relics), battles: 0, elite: false, wounds: 0, shop: [], visited: [] };
    this.load(initial, s => {
      if (!["plan", "route", "battle", "reward", "waypoint", "camp", "shop", "event", "won", "lost"].includes(s.phase) || !int(s.node, 0, c.nodes) || !["", "combat", "elite", "event", "boss"].includes(s.route) || !int(s.selected, 0, 70) || !int(s.hp, 0, s.max) || !int(s.max, c.health, c.health + 36) || !int(s.embers, 0, 10000) || !int(s.enemyHp, 0, s.enemyMax) || !int(s.enemyMax, 0, 250) || !int(s.enemyGuard, 0, 2000) || !int(s.enemyPoison, 0, 200) || !int(s.growth, 0, 300) || !int(s.block, 0, 20000) || !int(s.energy, 0, 200) || !int(s.turn, 0, 300) || !int(s.seed, 0, 4294967295) || typeof s.elite !== "boolean" || !int(s.battles, 0, c.nodes) || !int(s.wounds, 0, 100)) return false;
      if (![s.deck, s.hand, s.draw, s.discard, s.exile, s.rewards, s.shop].every(a => nums(a, 70, 0, 47)) || s.deck.length < 4 || s.deck.length > 60 || s.hand.length > 10 || !nums(s.relics, 8, 0, 7) || !unique(s.relics) || !Array.isArray(s.visited) || s.visited.length !== s.node || !s.visited.every(v => ["combat", "elite", "event", "boss"].includes(v))) return false;
      if (s.phase === "battle") { const a = [...s.hand, ...s.draw, ...s.discard, ...s.exile].sort((a, b) => a - b), b = [...s.deck].sort((a, b) => a - b); if (a.join() !== b.join() || !s.enemyHp || s.enemyMax < 1 || !s.hp) return false; }
      if (s.phase === "reward" && (s.enemyHp !== 0 || s.rewards.length !== 3)) return false;
      return s.battles === s.visited.filter(p => ["combat", "elite", "boss"].includes(p)).length + (s.phase === "reward" ? 1 : 0) && (s.phase !== "won" || s.node === c.nodes && s.enemyHp === 0 && s.visited[s.visited.length - 1] === "boss") && (s.phase !== "lost" || s.hp === 0 || s.turn >= 300);
    });
  }
  protected onReward() { this.p.cards = copy(this.s.deck); this.p.relics = copy(this.s.relics); }
  private rng() { this.s.seed = (Math.imul(this.s.seed, 1664525) + 1013904223) >>> 0; return this.s.seed / 4294967296; }
  private shuffle(a: number[]) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  private draw(count: number) { const s = this.s; while (count-- > 0 && s.hand.length < 10) { if (!s.draw.length) { s.draw = this.shuffle(s.discard); s.discard = []; } if (!s.draw.length) break; s.hand.push(s.draw.pop()!); } }
  private foe() { const s = this.s; return this.c.foes[Math.min(s.node, this.c.foes.length - 1)]; }
  private intent() { const s = this.s, f = this.foe(); if (s.turn % 4 === 0) return { kind: "armor", value: 7 + this.options.chapterIndex }; if (s.route === "boss" && s.turn % 5 === 0 && s.enemyHp < s.enemyMax / 2) return { kind: "hex", value: 6 + this.options.chapterIndex }; return { kind: "attack", value: f.attacks[(s.turn - 1) % f.attacks.length] + (s.elite ? 2 : 0) + (s.route === "boss" && s.enemyHp < s.enemyMax / 2 ? 2 : 0) }; }
  private choices(): Choice[] {
    const s = this.s;
    if (s.phase === "plan") return [{ id: "begin", label: "Enter the roots", description: "Bring your persistent deck and relics on this expedition." }, ...this.upgradeChoices(["Bone lantern", "Herbal pouch", "Witch's purse", "Reading glasses"])];
    if (s.phase === "route") return s.node === this.c.nodes - 1 ? [{ id: "path:boss", label: `Face ${this.foe().name}`, description: "The final guardian bars the dawn. Victory ends this expedition." }] : [{ id: "path:combat", label: "Lantern trail · battle", description: "A normal guardian, spell draft and 14 embers." }, { id: "path:elite", label: "Briar ridge · elite", description: "A stronger guardian; 25 embers and a unique relic." }, { id: "path:event", label: "Whispering hollow · event", description: "A traveler offers a bargain. Advance without combat, at a cost." }];
    if (s.phase === "battle") return [...s.hand.map((id, i) => ({ id: `play:${i}`, label: `${spell(id).name}${id >= 24 ? "+" : ""} · ${spellCost(id)} energy`, description: this.description(id), disabled: spellCost(id) > s.energy })), { id: "end", label: "End turn", description: `Enemy intent: ${this.intent().kind} ${this.intent().value}. Unused cards go to discard.` }];
    if (s.phase === "reward") return [...s.rewards.map((id, i) => ({ id: `draft:${i}`, label: `Take ${spell(id).name}`, description: this.description(id), disabled: s.deck.length >= 60 })), { id: "draft:skip", label: "Keep the deck focused", description: "Skip the spell reward. Smaller decks cycle reliably." }];
    if (s.phase === "waypoint") return [{ id: "stop:camp", label: "Rest at the moss camp", description: "Recover health, or improve one spell." }, { id: "stop:shop", label: "Visit the bone trader", description: `Spend ${s.embers} embers on spells or removal.` }, { id: "continue", label: "Continue the expedition", description: "Return to the route map." }];
    if (s.phase === "camp") return [{ id: "rest", label: "Rest beside the lantern", description: `Heal ${14 + this.p.upgrades[1] * 5} health.` }, ...s.deck.map((id, i) => ({ id: `improve:${i}`, label: `Improve ${spell(id).name}`, description: "Increase spell numbers by three, or reduce costly spells by one energy.", disabled: id >= 24 }))];
    if (s.phase === "shop") return [...s.shop.map((id, i) => ({ id: `buy:${i}`, label: `Buy ${spell(id).name} · 12 embers`, description: this.description(id), disabled: s.embers < 12 || s.deck.length >= 60 })), ...s.deck.map((id, i) => ({ id: `remove:${i}`, label: `Forget ${spell(id).name} · 10 embers`, description: "Permanently remove this copy; keep at least four spells.", disabled: s.embers < 10 || s.deck.length <= 4 })), { id: "leave", label: "Leave the trader" }];
    if (s.phase === "event") return [{ id: "bargain:seed", label: "Accept the seed keeper's gift", description: "Add Seed memory; lose six health.", disabled: s.deck.length >= 60 || s.hp <= 6 }, { id: "bargain:heal", label: "Share a warm meal", description: "Pay six embers, heal ten health.", disabled: s.embers < 6 }, { id: "bargain:leave", label: "Carry the lantern onwards", description: "Gain four embers and no new spell." }];
    return [];
  }
  private description(id: number) { return spell(id).words + (id >= 24 ? " Improved: effects +3; expensive spells cost one less." : "") + " Growth adds to damage and guard."; }
  choose(id: string) {
    if (this.upgrade(id)) return; const s = this.s;
    if (id === "begin" && s.phase === "plan") { s.hp = s.max = this.c.health + this.p.upgrades[0] * 12; s.embers += this.p.upgrades[2] * 8; s.phase = "route"; this.emit("dialogue"); return; }
    const c = this.choices().find(c => c.id === id); if (!c || c.disabled) return;
    if (id.startsWith("path:")) { s.route = id.split(":")[1]; if (s.route === "event") { s.phase = "event"; s.message = "A seed keeper waits in the hollow with a bowl and a bargain."; } else this.battle(); }
    else if (id.startsWith("play:")) this.play(Number(id.split(":")[1]));
    else if (id === "end") this.end();
    else if (id.startsWith("draft:")) { const r = id.split(":")[1]; if (r !== "skip") s.deck.push(s.rewards[Number(r)]); s.rewards = []; this.advance(); }
    else if (id.startsWith("stop:")) { s.phase = id.split(":")[1]; if (s.phase === "shop") s.shop = [14 + s.node % 4, 5 + s.node % 3, 20 + s.node % 4]; s.selected = 0; }
    else if (id === "continue" || id === "leave") { s.phase = "route"; s.selected = 0; }
    else if (id === "rest") { s.hp = Math.min(s.max, s.hp + 14 + this.p.upgrades[1] * 5); s.phase = "route"; s.message = "Warm moss closes your wounds. The next fork awaits."; this.emit("collect"); }
    else if (id.startsWith("improve:")) { const i = Number(id.split(":")[1]); s.deck[i] += 24; s.phase = "route"; s.message = "A spell shines brighter in the bone lantern."; this.emit("craft"); }
    else if (id.startsWith("buy:")) { s.deck.push(s.shop[Number(id.split(":")[1])]); s.embers -= 12; this.emit("collect"); }
    else if (id.startsWith("remove:")) { s.deck.splice(Number(id.split(":")[1]), 1); s.embers -= 10; this.emit("collect"); }
    else if (id.startsWith("bargain:")) { if (id === "bargain:seed") { s.deck.push(9); s.hp = Math.max(1, s.hp - 6); } else if (id === "bargain:heal") { s.embers -= 6; s.hp = Math.min(s.max, s.hp + 10); } else s.embers += 4; this.advance(); }
    this.choiceIndex = 0;
  }
  private battle() {
    const s = this.s, f = this.foe(); s.phase = "battle"; s.elite = s.route === "elite"; s.enemyMax = f.hp + (s.elite ? 12 : 0) + (s.route === "boss" ? 12 : 0); s.enemyHp = s.enemyMax; s.enemyGuard = 0; s.enemyPoison = 0; s.growth = 0; s.block = 0; s.energy = 3 + (s.relics.includes(0) ? 1 : 0); s.turn = 1; s.hand = []; s.discard = []; s.exile = []; s.draw = this.shuffle(copy(s.deck)); this.draw(5 + (this.p.upgrades[3] >= 2 ? 1 : 0)); s.selected = 0; s.message = `${f.name} rises. Its next intention is visible. Your deck has ${s.deck.length} spells.`; this.emit("engine");
  }
  private play(i: number) {
    const s = this.s, id = s.hand[i], c = spell(id); if (!c || spellCost(id) > s.energy || s.phase !== "battle") return; s.energy -= spellCost(id); s.hand.splice(i, 1); const boost = id >= 24 ? 3 : 0;
    if (c.damage) { let n = c.damage + boost + s.growth + (s.relics.includes(1) ? 2 : 0); const guarded = Math.min(s.enemyGuard, n); s.enemyGuard -= guarded; n -= guarded; s.enemyHp = Math.max(0, s.enemyHp - n); this.emit("strike"); }
    if (c.block) s.block += c.block + boost + s.growth;
    if (c.heal) s.hp = Math.min(s.max, s.hp + c.heal + boost);
    if (c.energy) s.energy += c.energy + (id >= 24 ? 1 : 0);
    if (c.poison) s.enemyPoison += c.poison + boost;
    if (c.growth) s.growth += c.growth + (id >= 24 ? 1 : 0);
    (c.exhaust ? s.exile : s.discard).push(id); if (c.draw) this.draw(c.draw + (id >= 24 ? 1 : 0)); s.selected = Math.min(s.selected, Math.max(0, s.hand.length - 1)); s.message = `${c.name}${id >= 24 ? "+" : ""} cast. ${s.energy} energy remains.`; this.defeated();
  }
  private end() {
    const s = this.s; if (s.phase !== "battle") return; s.enemyHp = Math.max(0, s.enemyHp - s.enemyPoison); s.enemyPoison = Math.max(0, s.enemyPoison - 1); if (this.defeated()) return;
    const intent = this.intent(); if (intent.kind === "armor") s.enemyGuard += intent.value; else if (intent.kind === "hex") { s.hp = Math.max(0, s.hp - Math.max(1, intent.value - Math.floor(s.block / 2))); s.wounds++; } else { const damage = Math.max(0, intent.value - s.block); s.hp = Math.max(0, s.hp - damage); if (damage) this.emit("hit"); }
    s.discard.push(...s.hand); s.hand = []; s.block = s.relics.includes(2) ? 3 : 0; s.energy = 3 + (s.relics.includes(0) ? 1 : 0); s.turn++; if (!s.hp || s.turn >= 300) { s.phase = "lost"; s.message = "The lantern goes dark. Shape a smaller deck, prepare guard for visible attacks, and rest between battles."; this.emit("fail"); return; } if (s.relics.includes(3)) s.hp = Math.min(s.max, s.hp + 1); this.draw(5 + (this.p.upgrades[3] >= 2 ? 1 : 0)); s.message = `Turn ${s.turn}. The guardian prepares ${this.intent().kind} ${this.intent().value}.`;
  }
  private defeated() {
    const s = this.s; if (s.enemyHp > 0) return false;
    s.battles++; s.embers += s.elite ? 25 : 14; if (s.elite) { const relic = [0, 1, 2, 3].find(n => !s.relics.includes(n)); if (relic !== undefined) s.relics.push(relic); }
    if (s.route === "boss") { s.visited.push("boss"); s.node++; s.phase = "won"; s.message = this.p.rewarded.includes(this.options.chapterIndex) ? "The final root releases its grip again. The guild preserves your first-clear deck and relics; replay rewards stay in this expedition." : "The final root releases its grip. Your expedition’s spells and relics travel to the next chapter."; this.award(); }
    else { s.phase = "reward"; s.rewards = [5 + s.node % 3, 14 + (s.node + this.options.chapterIndex) % 10, 8 + s.node % 6]; s.message = "The path is clear. Draft one spell, or keep your deck focused."; this.emit("collect"); }
    s.selected = 0; return true;
  }
  private advance() { const s = this.s; s.visited.push(s.route); s.node++; s.phase = "waypoint"; s.hand = []; s.draw = []; s.discard = []; s.exile = []; s.selected = 0; s.message = "At the next clearing: rest, trade, or continue. The dawn guardian still waits."; }
  update(dt: number, input: GameInput) {
    const s = this.s; if (["won", "lost"].includes(s.phase)) return; if (s.phase === "battle") s.clock += Math.min(.25, Math.max(0, dt));
    if (s.phase !== "battle") { this.controls(input, this.choices()); this.pointerChoices(input, this.choices()); return; }
    if (input.pressed.has("left")) s.selected = wrap(s.selected - 1, Math.max(1, s.hand.length)); if (input.pressed.has("right")) s.selected = wrap(s.selected + 1, Math.max(1, s.hand.length)); if (input.pressed.has("action")) this.choose(`play:${s.selected}`); if (input.pressed.has("alt")) this.choose("end");
    if (input.pointer?.pressed) { const w = Math.min(140, 870 / Math.max(1, s.hand.length)), start = 480 - s.hand.length * w / 2; s.hand.forEach((_, i) => { if (hit(input.pointer!, start + i * w, 349, w - 5, 146)) { if (s.selected === i) this.choose(`play:${i}`); else s.selected = i; } }); }
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = this.s; heading(ctx, this.options, `LANTERN ${s.hp}/${s.max} · ${s.embers} embers`);
    // Authored forest layers: back trunks, root bridges, hanging lanterns, drifting pollen.
    const sky = ctx.createLinearGradient(0,  75, 0, 500); sky.addColorStop(0, "#294138"); sky.addColorStop(.6, "#102a2b"); sky.addColorStop(1, "#152327"); ctx.fillStyle = sky; ctx.fillRect(20, 75, 920, 425);
    for (let i = 0; i < 9; i++) { const x = i * 125 - 25; ctx.fillStyle = i % 2 ? "#183332" : "#244a3c"; ctx.fillRect(x, 77, 22 + i % 3 * 9, 301); ctx.strokeStyle = "#37523c"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x + 10, 150); ctx.lineTo(x + 95, 80); ctx.stroke(); }
    for (let i = 0; i < 10; i++) { drawSprite(ctx, "herb", 37 + i * 103, 317 + Math.sin(i) * 17, 84); particles(ctx, s.clock * .25 + i, 70 + i * 90, 280, "#9cca8d", 4); }
    if (s.phase === "battle") {
      drawSprite(ctx, "archivist", 223, 254 + Math.sin(s.clock) * 2, 172); drawSprite(ctx, "beacon", 139, 280, 83); glow(ctx, 148, 253, 114, "#dfd78448"); const boss = s.route === "boss"; drawSprite(ctx, boss ? "thornbeast" : s.elite ? "guardian" : "wolf", 725, 236 + Math.sin(s.clock * .8) * 4, boss ? 224 : 190, { flip: true });
      panel(ctx, 576, 93, 324, 86, "#13292bdc"); text(ctx, this.foe().name, 739, 119, 20, "#dfd69c", "center"); text(ctx, `INTENT ${this.intent().kind.toUpperCase()} ${this.intent().value}`, 739, 145, 16, "#efa6a0", "center"); meter(ctx, 598, 157, 281, s.enemyHp / s.enemyMax, "#e39391");
      panel(ctx, 40, 94, 292, 96, "#13292bdc"); text(ctx, `ENERGY ${s.energy} · GUARD ${s.block}`, 57, 121, 19, "#cbdab8"); text(ctx, `GROWTH ${s.growth} · BLIGHT ${s.enemyPoison}`, 57, 148, 14); text(ctx, `DRAW ${s.draw.length} · DISCARD ${s.discard.length}`, 57, 174, 13);
      const w = Math.min(140, 870 / Math.max(1, s.hand.length)), start = 480 - s.hand.length * w / 2;
      s.hand.forEach((id, i) => { const c = spell(id), x = start + i * w, y = s.selected === i ? 334 : 349; panel(ctx, x, y, w - 5, 146, id >= 24 ? "#526445" : "#384b45", s.selected === i ? "#ffe5a6" : "#94ab85"); drawSprite(ctx, c.icon, x + w / 2 - 2, y + 53, 68); text(ctx, spellCost(id), x + 12, y + 23, 20, "#f9e8b1"); text(ctx, c.name.slice(0, 17), x + w / 2 - 2, y + 106, 11, "#f2ecd8", "center"); text(ctx, c.exhaust ? "EXHAUST" : "SPELL", x + w / 2 - 2, y + 131, 11, "#bed7ab", "center"); });
    } else {
      const points = Array.from({ length: this.c.nodes }, (_, i) => ({ x: 130 + i * 155, y: 278 + Math.sin(i * 1.6) * 64 })); ctx.strokeStyle = "#cfcb8d90"; ctx.lineWidth = 5; ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); points.forEach((p, i) => { glow(ctx, p.x, p.y, 65, i === s.node ? "#deda7955" : "#85b68520"); drawSprite(ctx, i === this.c.nodes - 1 ? "thornbeast" : i < s.node ? "flower" : "beacon", p.x, p.y, 83); text(ctx, i < s.node ? s.visited[i] : i === this.c.nodes - 1 ? "DAWN GUARDIAN" : "FORK " + (i + 1), p.x, p.y + 53, 12, "#e9dfb2", "center"); });
      this.decisionOverlay(ctx, s.phase === "plan" ? `Prepare expedition · ${this.p.credits} guild marks` : s.phase.toUpperCase(), this.choices());
    }
    text(ctx, "A CAST / DECIDE · X END TURN · GROWTH STRENGTHENS SPELLS · BLIGHT TICKS EACH TURN", 480, 522, 12, "#c3d5b5", "center");
  }
  view(): EngineView {
    const s = this.s, id = s.hand[Math.min(s.selected, Math.max(0, s.hand.length - 1))], intent = s.phase === "battle" ? this.intent() : null;
    return { ...this.viewBase(), choices: this.choices(), choiceMode: s.phase === "battle" ? "panel" : "modal", choicePrompt: s.phase === "battle" ? "Spells and enemy intention" : "Expedition decision", selection: s.phase === "battle" ? `${id === undefined ? "No cards in hand" : spell(id).name + (id >= 24 ? "+" : "") + ": " + spellCost(id) + " energy. " + this.description(id)} Enemy: ${this.foe().name}, ${s.enemyHp}/${s.enemyMax} HP, ${s.enemyGuard} guard, ${s.enemyPoison} blight. Intent ${intent!.kind} ${intent!.value}. You have ${s.block} guard, ${s.growth} growth, ${s.energy} energy.` : `Expedition fork ${s.node + 1}/${this.c.nodes}. Deck ${s.deck.length} spells; relics ${s.relics.map(i => ["Everglow: +1 energy", "Ivory fang: +2 damage", "Moss shell: +3 guard", "Spring heart: heal each turn"][i]).join(", ") || "none"}. ${s.rewards.length ? "Draft: " + s.rewards.map(id => spell(id).name + " — " + this.description(id)).join("; ") : s.message}`, ...(s.phase === "battle" && s.route === "boss" ? { boss: { name: this.foe().name, health: s.enemyHp, max: s.enemyMax } } : {}), stats: [{ label: "Health", value: `${s.hp}/${s.max}` }, { label: "Embers", value: s.embers }, { label: "Deck", value: s.deck.length }, { label: "Fork", value: `${s.node + 1}/${this.c.nodes}` }, { label: "Relics", value: s.relics.length }] };
  }
}
