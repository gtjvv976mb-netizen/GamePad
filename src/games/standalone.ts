import { campaignFor } from "./campaigns";
import { createEngine } from "./registry";
import type { GameButton, GameEngine, GameInput } from "./types";

const campaign = campaignFor(document.body.dataset.game ?? "");
if (!campaign) throw new Error("This offline game is missing its campaign.");
const game = campaign;
const demo = new URLSearchParams(location.search).get("demo") === "1";
const embedded = window.parent !== window;
const chapters = demo ? 1 : game.chapters.length;
const key = `gamepad-campaign-v1:${game.slug}${demo ? ":demo" : ""}`;
type Phase = "briefing" | "playing" | "paused" | "victory" | "defeat" | "ending";
type Save = { version: 1; slug: string; chapter: number; unlocked: number; completed: boolean; phase: Phase; engine?: Record<string, unknown> };
let chapter = 0, unlocked = 1, completed = false, phase: Phase = "briefing";
let engine: GameEngine;
let storageAvailable = true;
let savedAt = 0, lastFrame = 0, lastHud = 0;
const held = new Set<GameButton>(), presses = new Set<GameButton>(), touchHeld = new Map<number, GameButton>();
let previousPad = new Set<GameButton>();
let pointer: GameInput["pointer"];
const root = document.getElementById("game")!;
root.innerHTML = `<header><div><span class="brand">GamePad Originals${demo ? " · First chapter demo" : " · Offline campaign"}</span><h1></h1></div><div class="toolbar"><button id="menu">Campaign</button><button id="pause">Pause</button>${embedded ? '<button id="close">Close game</button>' : ""}</div></header>
  <main><section class="dashboard"><div><span id="chapter-number"></span><h2 id="chapter-title"></h2><p id="objective"></p></div><div id="stats" aria-live="off"></div></section>
  <div class="stage"><canvas width="960" height="540" tabindex="0" aria-label="Game board"></canvas><section id="overlay" aria-label="Campaign menu"></section></div>
  <p id="message" role="status"></p><p id="selection" hidden></p><p id="notice" role="alert"></p><div class="controls"><div class="dpad"><button data-control="up" aria-label="Move up">↑</button><button data-control="left" aria-label="Move left">←</button><button data-control="down" aria-label="Move down">↓</button><button data-control="right" aria-label="Move right">→</button></div><div class="abilities"><button data-control="action"></button><button data-control="alt"></button></div></div>
  <details><summary>Controls and save files</summary><p id="instructions"></p><p>Keyboard: arrows or WASD. Space / Enter: primary action. X / Shift: secondary action. P / Escape: pause. Controller: left stick / D-pad, A and X, Start to pause. Touch: the controls below the board; adventure and board games also support tapping the board.</p><div class="save-tools"><button id="export">Export save</button><label class="button">Import save<input id="import" type="file" accept=".json,application/json"></label><button id="restart">Restart campaign</button></div><p id="storage"></p></details></main><footer>Original single-player campaign · Graphics, story and code included · No network needed</footer>`;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = root.querySelector("canvas")!;
const ctx = canvas.getContext("2d")!;
const overlay = el("overlay");
document.title = `${game.title} | GamePad Offline`;
root.querySelector("h1")!.textContent = game.title;
el("instructions").textContent = game.controls;
root.querySelector<HTMLElement>('[data-control="action"]')!.textContent = `${game.actionLabel} · A`;
root.querySelector<HTMLElement>('[data-control="alt"]')!.textContent = `${game.altLabel} · X`;
document.documentElement.style.setProperty("--accent", game.palette[2]);
document.documentElement.style.setProperty("--deep", game.palette[0]);
document.documentElement.style.setProperty("--mid", game.palette[1]);

function validate(raw: unknown): Save {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid save file.");
  const s = raw as Save;
  if (s.version !== 1 || s.slug !== game.slug || !Number.isInteger(s.chapter) || s.chapter < 0 || s.chapter >= chapters || !Number.isInteger(s.unlocked) || s.unlocked < 1 || s.unlocked > chapters || s.chapter >= s.unlocked || typeof s.completed !== "boolean" || !["briefing", "playing", "paused", "victory", "defeat", "ending"].includes(s.phase)) throw new Error("This save is incompatible with this campaign.");
  if (s.completed && s.unlocked !== chapters || s.phase === "ending" && !s.completed) throw new Error("This save has invalid campaign progress.");
  if (s.engine !== undefined && (!s.engine || typeof s.engine !== "object" || Array.isArray(s.engine))) throw new Error("Invalid chapter state.");
  if (["playing", "paused", "victory", "defeat"].includes(s.phase) && !s.engine) throw new Error("Missing chapter state.");
  return s;
}

function notifyParent() {
  if (embedded) parent.postMessage({ type: "gamepad-progress", slug: game.slug, chapter: chapter + 1, unlocked, completed, demo }, location.origin);
}
function snapshot(): Save {
  return { version: 1, slug: game.slug, chapter, unlocked, completed, phase, engine: engine.save() };
}
function save() {
  try { localStorage.setItem(key, JSON.stringify(snapshot())); storageAvailable = true; }
  catch { storageAvailable = false; }
  el("storage").textContent = storageAvailable ? "Progress saves automatically in this browser. Export a save to keep a backup or move to another device." : "Browser storage is unavailable. Export a save before closing to keep your progress.";
  notifyParent();
}
function restore(s: Save) {
  // Construct and validate the engine before changing any live campaign progress.
  const candidate = createEngine({ campaign: game, chapterIndex: s.chapter, restored: s.engine });
  const status = candidate.view().status;
  if ((s.phase === "victory" && status !== "won") || (s.phase === "defeat" && status !== "lost") || (["playing", "paused"].includes(s.phase) && status !== "playing")) throw new Error("Save status does not match chapter state.");
  engine = candidate;
  chapter = s.chapter; unlocked = s.unlocked; completed = s.completed;
  phase = s.phase === "playing" ? "paused" : s.phase;
}
engine = createEngine({ campaign: game, chapterIndex: 0 });
let recoveredMessage = "";
try {
  const stored = localStorage.getItem(key);
  if (stored) restore(validate(JSON.parse(stored)));
} catch (error) {
  recoveredMessage = error instanceof Error ? `Couldn't restore progress: ${error.message} A fresh campaign is ready.` : "A fresh campaign is ready.";
}

function clearInput() { held.clear(); presses.clear(); touchHeld.clear(); pointer = undefined; root.querySelectorAll(".held").forEach(b => b.classList.remove("held")); }
function button(label: string, action: () => void, primary = false, disabled = false) {
  const b = document.createElement("button"); b.textContent = label; b.disabled = disabled;
  if (primary) { b.className = "primary"; b.dataset.primary = "true"; }
  b.onclick = action; return b;
}
function paragraph(text: string, className = "") { const p = document.createElement("p"); p.textContent = text; p.className = className; return p; }
function start(index = chapter, fresh = false) {
  if (index >= chapters || index >= unlocked) return;
  if (fresh || index !== chapter || phase === "defeat" || phase === "victory" || phase === "ending") engine = createEngine({ campaign: game, chapterIndex: index });
  chapter = index; phase = "playing"; clearInput(); screen(); save(); canvas.focus({ preventScroll: true });
}
function pause() {
  if (phase === "playing") { phase = "paused"; clearInput(); screen(); save(); }
  else if (phase === "paused") start();
}
function screen() {
  root.dataset.phase = phase;
  el("chapter-number").textContent = `Chapter ${chapter + 1} of ${chapters}`;
  el("chapter-title").textContent = game.chapters[chapter].title;
  el<HTMLButtonElement>("pause").disabled = !["playing", "paused"].includes(phase);
  el("pause").textContent = phase === "paused" ? "Resume" : "Pause";
  overlay.hidden = phase === "playing";
  overlay.replaceChildren();
  if (phase === "playing") return;
  const card = document.createElement("div"); card.className = "panel";
  const h = document.createElement("h3");
  h.textContent = phase === "victory" ? "Chapter complete" : phase === "defeat" ? "Try again" : phase === "ending" ? (demo ? "Demo complete" : "Campaign complete") : phase === "paused" ? "Paused" : game.chapters[chapter].title;
  card.append(h);
  if (phase === "victory") {
    card.append(paragraph(game.chapters[chapter].after));
    card.append(button(chapter + 1 < chapters ? "Next chapter" : demo ? "Finish demo" : "See ending", () => {
      if (chapter + 1 < chapters) { chapter++; engine = createEngine({ campaign: game, chapterIndex: chapter }); phase = "briefing"; }
      else { completed = true; phase = "ending"; }
      screen(); save();
    }, true));
  } else if (phase === "defeat") {
    card.append(paragraph(engine.view().message), button("Retry chapter", () => start(chapter, true), true));
  } else if (phase === "ending") {
    card.append(paragraph(demo ? "This is the first chapter. Get the full campaign from your GamePad library, including an offline download." : game.ending));
    card.append(paragraph(demo ? "Your demo progress is saved separately." : `You finished all ${chapters} chapters. Replay any chapter below.`));
  } else {
    card.append(paragraph(game.chapters[chapter].briefing), paragraph(game.chapters[chapter].objective, "goal"), paragraph(game.controls, "muted"));
    card.append(button(phase === "paused" ? "Resume chapter" : "Start chapter", () => start(), true));
  }
  const chooser = document.createElement("div"); chooser.className = "chapters";
  game.chapters.slice(0, chapters).forEach((c, i) => {
    const b = button(`${i + 1}. ${c.title}`, () => {
      if (i === chapter && phase === "paused") start();
      else { chapter = i; engine = createEngine({ campaign: game, chapterIndex: i }); phase = "briefing"; screen(); save(); }
    }, false, i >= unlocked);
    b.classList.toggle("selected", i === chapter); chooser.append(b);
  });
  card.append(chooser); overlay.append(card);
  overlay.querySelector<HTMLButtonElement>('[data-primary="true"]')?.focus({ preventScroll: true });
}
function menu() {
  if (phase === "playing") phase = "paused";
  clearInput(); screen(); save();
}
el("pause").onclick = pause;
el("menu").onclick = menu;
if (embedded) el("close").onclick = () => { menu(); parent.postMessage({ type: "gamepad-close", slug: game.slug }, location.origin); };
el("restart").onclick = () => {
  if (!confirm("Restart this campaign and clear its saved progress?")) return;
  chapter = 0; unlocked = 1; completed = false; phase = "briefing";
  engine = createEngine({ campaign: game, chapterIndex: 0 }); screen(); save();
};
el("export").onclick = () => {
  save(); const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = `${game.slug}-campaign-save.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
el<HTMLInputElement>("import").onchange = async e => {
  const input = e.currentTarget as HTMLInputElement, file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error("Save file is too large.");
    const s = validate(JSON.parse(await file.text())); restore(s); clearInput(); screen(); save();
    el("notice").textContent = "Save imported. Resume when ready.";
  } catch (error) { el("notice").textContent = error instanceof Error ? error.message : "Couldn't import this save."; }
  input.value = "";
};

const keys: Record<string, GameButton> = { ArrowUp: "up", w: "up", ArrowDown: "down", s: "down", ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right", " ": "action", Enter: "action", x: "alt", Shift: "alt" };
document.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as HTMLElement;
  if (target.matches("input,textarea,select")) return;
  if ((e.key === "Escape" || e.key.toLowerCase() === "p") && !e.repeat) { e.preventDefault(); pause(); return; }
  const control = keys[e.key] ?? keys[e.key.toLowerCase()];
  if (!control) return;
  if (phase !== "playing") {
    if (["up", "down", "left", "right"].includes(control)) { e.preventDefault(); presses.add(control); }
    else if (control === "action" && !target.closest("button,a,summary,label")) { e.preventDefault(); if (!e.repeat) presses.add(control); }
    return;
  }
  e.preventDefault(); if (!held.has(control) && !e.repeat) presses.add(control); held.add(control);
});
document.addEventListener("keyup", e => { const b = keys[e.key] ?? keys[e.key.toLowerCase()]; if (b) held.delete(b); });
root.querySelectorAll<HTMLButtonElement>("[data-control]").forEach(b => {
  b.addEventListener("pointerdown", e => {
    e.preventDefault(); if (phase !== "playing") return;
    b.setPointerCapture(e.pointerId); const control = b.dataset.control as GameButton;
    touchHeld.set(e.pointerId, control); presses.add(control); b.classList.add("held");
  });
  const release = (e: PointerEvent) => { touchHeld.delete(e.pointerId); b.classList.remove("held"); };
  b.addEventListener("pointerup", release); b.addEventListener("pointercancel", release); b.addEventListener("lostpointercapture", release);
});
function coordinate(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * 960 / r.width, y: (e.clientY - r.top) * 540 / r.height };
}
canvas.addEventListener("pointerdown", e => {
  if (phase !== "playing") return;
  e.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId); pointer = { ...coordinate(e), pressed: true, down: true };
});
canvas.addEventListener("pointermove", e => { if (pointer?.down) pointer = { ...coordinate(e), pressed: pointer.pressed, down: true }; });
canvas.addEventListener("pointerup", () => { if (pointer) pointer.down = false; });
canvas.addEventListener("pointercancel", () => { pointer = undefined; });
let startHeld = false;
function gamepad(): Set<GameButton> {
  const buttons = new Set<GameButton>();
  let pad: Gamepad | undefined;
  try { pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected) ?? undefined; } catch { return buttons; }
  if (!pad) { startHeld = false; return buttons; }
  const on = (i: number) => !!pad?.buttons[i]?.pressed;
  if (on(12) || pad.axes[1] < -.35) buttons.add("up");
  if (on(13) || pad.axes[1] > .35) buttons.add("down");
  if (on(14) || pad.axes[0] < -.35) buttons.add("left");
  if (on(15) || pad.axes[0] > .35) buttons.add("right");
  if (on(0)) buttons.add("action"); if (on(2) || on(1)) buttons.add("alt");
  if (on(9) && !startHeld) pause(); startHeld = on(9);
  return buttons;
}
function hud() {
  const view = engine.view();
  root.dataset.status = view.status;
  el("objective").textContent = view.objective;
  el("message").textContent = view.message;
  el("selection").textContent = view.selection ?? "";
  el("selection").hidden = !view.selection;
  const stats = el("stats"); stats.replaceChildren();
  for (const stat of view.stats) { const box = document.createElement("div"), label = document.createElement("span"), value = document.createElement("b"); label.textContent = stat.label; value.textContent = String(stat.value); box.append(label, value); stats.append(box); }
  // Size the board through its width so pointer coordinates and its 16:9 geometry stay exact.
  const reserved = root.querySelector("header")!.offsetHeight + root.querySelector<HTMLElement>(".dashboard")!.offsetHeight + el("message").offsetHeight + el("selection").offsetHeight + el("notice").offsetHeight + root.querySelector<HTMLElement>(".controls")!.offsetHeight + 85;
  root.style.setProperty("--board-height", `${Math.max(180, innerHeight - reserved)}px`);
}
function frame(time: number) {
  const dt = Math.min(.033, Math.max(0, (time - (lastFrame || time)) / 1000)); lastFrame = time;
  const pad = gamepad();
  for (const b of pad) if (!previousPad.has(b)) presses.add(b);
  previousPad = pad;
  if (phase === "playing") {
    engine.update(dt, { held: new Set([...held, ...pad, ...touchHeld.values()]), pressed: new Set(presses), pointer });
    const status = engine.view().status;
    if (status !== "playing") {
      phase = status === "won" ? "victory" : "defeat";
      if (status === "won") unlocked = Math.max(unlocked, Math.min(chapters, chapter + 2));
      clearInput(); screen(); save();
    } else if (time - savedAt > 1500) { save(); savedAt = time; }
  } else if (presses.has("action")) {
    const focus = document.activeElement;
    if (focus instanceof HTMLButtonElement && overlay.contains(focus)) focus.click();
    else overlay.querySelector<HTMLButtonElement>('[data-primary="true"]')?.click();
  } else if (["left", "right", "up", "down"].some(b => presses.has(b as GameButton))) {
    const list = Array.from(overlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const current = list.indexOf(document.activeElement as HTMLButtonElement);
    const direction = presses.has("left") || presses.has("up") ? -1 : 1;
    list[(current + direction + list.length) % list.length]?.focus();
  }
  presses.clear(); if (pointer) pointer.pressed = false;
  engine.render(ctx, 960, 540);
  if (time - lastHud > 150) { hud(); lastHud = time; }
  requestAnimationFrame(frame);
}
addEventListener("blur", () => { if (phase === "playing") pause(); clearInput(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (phase === "playing") pause(); save(); clearInput(); } });
addEventListener("pagehide", save);
addEventListener("message", e => { if (embedded && e.source === parent && e.origin === location.origin && e.data?.type === "gamepad-save") { menu(); parent.postMessage({ type: "gamepad-saved", slug: game.slug }, location.origin); } });
screen(); hud(); save();
if (recoveredMessage) el("notice").textContent = recoveredMessage;
requestAnimationFrame(frame);
