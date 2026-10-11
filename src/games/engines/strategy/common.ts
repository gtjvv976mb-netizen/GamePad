import type { EngineOptions, GameEngine, GameEvent, EngineView, GameInput } from "../../types";
import { drawSprite } from "../../art";
export { drawSprite };
export type Choice = NonNullable<EngineView["choices"]>[number];
export type Point = { x: number; y: number };
export type Profile = { v: 2; slug: string; credits: number; upgrades: number[]; rewarded: number[]; cards: number[]; relics: number[] };
export const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export const hash = (v: string) => { let h = 2166136261; for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619); return (h >>> 0).toString(16); };
export const int = (v: unknown, low: number, high: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= low && v <= high;
export const finite = (v: unknown, low: number, high: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= low && v <= high;
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const keys = (v: unknown, names: string[]) => record(v) && Object.keys(v).sort().join() === [...names].sort().join();
export const nums = (v: unknown, max: number, low: number, high: number): v is number[] => Array.isArray(v) && v.length <= max && v.every(n => int(n, low, high));
export const unique = (v: number[]) => new Set(v).size === v.length;
export const dist = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const dirs: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
export const wrap = (n: number, length: number) => (n + length) % length;
export const hit = (p: Point, x: number, y: number, w: number, h: number) => p.x >= x && p.y >= y && p.x < x + w && p.y < y + h;
export function text(ctx: CanvasRenderingContext2D, value: string | number, x: number, y: number, size = 16, color = "#f0e6d2", align: CanvasTextAlign = "left") {
  ctx.font = `${size > 22 ? "bold " : ""}${size}px ui-monospace, monospace`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(String(value), x, y); ctx.textAlign = "left";
}
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = "#101829d9", stroke = "#d3c29840") {
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); ctx.stroke();
}
export function meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, ratio: number, color = "#edd197", height = 8) { panel(ctx, x, y, w, height, "#101724", "#ffffff10"); ctx.fillStyle = color; ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * Math.min(1, Math.max(0, ratio))), height - 4); }
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) { const g = ctx.createRadialGradient(x, y, 0, x, y, radius); g.addColorStop(0, color); g.addColorStop(1, "transparent"); ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); }
export function heading(ctx: CanvasRenderingContext2D, options: EngineOptions, caption: string) { const p = options.campaign.palette; ctx.fillStyle = p[0]; ctx.fillRect(0, 0, 960, 540); const g = ctx.createLinearGradient(0, 0, 0, 540); g.addColorStop(0, "#00000000"); g.addColorStop(1, "#04090cd9"); ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540); text(ctx, options.campaign.title, 28, 35, 27, p[2]); text(ctx, `${options.chapterIndex + 1}. ${options.campaign.chapters[options.chapterIndex].title}`, 28, 60, 14); text(ctx, caption, 934, 35, 16, p[2], "right"); }
export function particles(ctx: CanvasRenderingContext2D, time: number, x: number, y: number, color: string, count = 8) { ctx.fillStyle = color; for (let i = 0; i < count; i++) { const p = (time * .4 + i / count) % 1; ctx.globalAlpha = 1 - p; ctx.fillRect(x + Math.sin(i * 9 + time) * 16 - 2, y - p * 45, 4, 4); } ctx.globalAlpha = 1; }
function jsonShape(v: unknown, depth = 0): boolean { if (depth > 8) return false; if (v === null || typeof v === "boolean") return true; if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) <= 4294967295; if (typeof v === "string") return v.length < 600; if (Array.isArray(v)) return v.length <= 250 && v.every(n => jsonShape(n, depth + 1)); return record(v) && Object.keys(v).length < 80 && Object.values(v).every(n => jsonShape(n, depth + 1)); }
export function profile(slug: string, raw?: Record<string, unknown>): Profile {
  if (!raw) return { v: 2, slug, credits: 4, upgrades: [0, 0, 0, 0], rewarded: [], cards: [], relics: [] };
  if (!keys(raw, ["v", "slug", "credits", "upgrades", "rewarded", "cards", "relics"]) || raw.v !== 2 || raw.slug !== slug || !int(raw.credits, 0, 100000) || !nums(raw.upgrades, 4, 0, 3) || raw.upgrades.length !== 4 || !nums(raw.rewarded, 6, 0, 5) || !unique(raw.rewarded) || !nums(raw.cards, 70, 0, 47) || !nums(raw.relics, 8, 0, 7) || !unique(raw.relics) || slug !== "mmr" && (raw.cards.length || raw.relics.length)) throw new Error(`Invalid ${slug} equipment profile.`);
  const earned = (raw.rewarded as number[]).reduce((n, chapter) => n + 8 + chapter * 2, 4);
  const spent = (raw.upgrades as number[]).reduce((n, level) => n + 3 * level * (level + 1) / 2, 0);
  if (raw.credits !== earned - spent) throw new Error(`Invalid ${slug} guild ledger.`);
  return copy(raw) as Profile;
}
export abstract class Strategy<S extends { phase: string; clock: number; message: string }> implements GameEngine {
  protected s!: S;
  protected p: Profile;
  protected feedback: GameEvent[] = [];
  protected choiceIndex = 0;
  constructor(protected options: EngineOptions) { this.p = profile(options.campaign.slug, options.restored ? undefined : options.progression); }
  protected load(initial: S, validate: (s: S) => boolean) {
    const r = this.options.restored;
    if (!r) { this.s = initial; return; }
    const fingerprint = this.fingerprint();
    if (!keys(r, ["v", "slug", "chapter", "fingerprint", "data", "progress", "checksum"]) || r.v !== 2 || r.slug !== this.options.campaign.slug || r.chapter !== this.options.chapterIndex || r.fingerprint !== fingerprint || r.checksum !== hash(JSON.stringify([r.data, r.progress])) || !record(r.progress) || !jsonShape(r.data) || !keys(r.data, Object.keys(initial))) throw new Error(`Invalid ${this.options.campaign.title} chapter save. Restart this chapter to recover.`);
    this.p = profile(this.options.campaign.slug, r.progress as Record<string, unknown>);
    const s = copy(r.data) as S;
    if (!finite(s.clock, 0, 100000) || typeof s.message !== "string" || !validate(s)) throw new Error(`Invalid ${this.options.campaign.title} chapter state.`);
    if (s.phase === "won" && !this.p.rewarded.includes(this.options.chapterIndex)) throw new Error("Invalid victory reward ledger.");
    this.s = s;
  }
  private fingerprint() { return hash(JSON.stringify(this.options.campaign.chapters[this.options.chapterIndex].config)); }
  protected emit(type: GameEvent["type"], strength = 1) { this.feedback.push({ type, strength }); if (this.feedback.length > 30) this.feedback.shift(); }
  events() { const events = this.feedback; this.feedback = []; return events; }
  protected award() { const chapter = this.options.chapterIndex; if (!this.p.rewarded.includes(chapter)) { this.p.rewarded.push(chapter); this.p.credits += 8 + chapter * 2; this.onReward(); } this.emit("success"); }
  protected onReward() { /* Title-specific persistent rewards. */ }
  protected upgradeChoices(names: string[]): Choice[] { return names.map((name, i) => ({ id: `upgrade:${i}`, label: `${name} ${this.p.upgrades[i] + 1}`, description: `${3 + this.p.upgrades[i] * 3} guild marks. Permanent improvement.`, disabled: this.p.upgrades[i] === 3 || this.p.credits < 3 + this.p.upgrades[i] * 3 })); }
  protected upgrade(id: string) { const m = /^upgrade:([0-3])$/.exec(id); if (!m || this.s.phase !== "plan") return false; const i = Number(m[1]), cost = 3 + this.p.upgrades[i] * 3; if (this.p.upgrades[i] >= 3 || this.p.credits < cost) return false; this.p.credits -= cost; this.p.upgrades[i]++; this.s.message = "Equipment improved. It will travel with you."; this.emit("collect"); return true; }
  protected controls(input: GameInput, choices: Choice[]) { if (!choices.length) return; if (input.pressed.has("left") || input.pressed.has("up")) this.choiceIndex = wrap(this.choiceIndex - 1, choices.length); if (input.pressed.has("right") || input.pressed.has("down")) this.choiceIndex = wrap(this.choiceIndex + 1, choices.length); this.choiceIndex = Math.min(this.choiceIndex, choices.length - 1); if (input.pressed.has("action")) this.choose(choices[this.choiceIndex].id); }
  protected decisionOverlay(ctx: CanvasRenderingContext2D, title: string, choices: Choice[]) { panel(ctx, 182, 128, 596, 330, "#0c152beb", this.options.campaign.palette[2]); text(ctx, title, 480, 168, 24, this.options.campaign.palette[2], "center"); choices.slice(0, 6).forEach((c, i) => { panel(ctx, 210, 188 + i * 40, 540, 33, i === this.choiceIndex ? "#47585f" : "#1d2939"); text(ctx, c.label, 230, 211 + i * 40, 16, c.disabled ? "#738087" : "#f3ebda"); }); }
  protected pointerChoices(input: GameInput, choices: Choice[]) { const p = input.pointer; if (!p?.pressed) return; choices.slice(0, 6).forEach((c, i) => { if (hit(p, 210, 188 + i * 40, 540, 33)) this.choose(c.id); }); }
  protected viewBase(): EngineView { return { status: this.s.phase === "won" ? "won" : this.s.phase === "lost" ? "lost" : "playing", objective: this.options.campaign.chapters[this.options.chapterIndex].objective, message: this.s.message, stats: [] }; }
  save(): Record<string, unknown> { const data = copy(this.s), progress = this.progression(); return { v: 2, slug: this.options.campaign.slug, chapter: this.options.chapterIndex, fingerprint: this.fingerprint(), data, progress, checksum: hash(JSON.stringify([data, progress])) }; }
  progression(): Record<string, unknown> { return copy(profile(this.options.campaign.slug, this.p as unknown as Record<string, unknown>)) as unknown as Record<string, unknown>; }
  abstract choose(id: string): void;
  abstract update(dt: number, input: GameInput): void;
  abstract render(ctx: CanvasRenderingContext2D, width?: number, height?: number): void;
  abstract view(): EngineView;
}
