import { campaignFor } from "./campaigns";
import { createEngine } from "./registry";
import { GameAudio } from "./audio";
import { artReady } from "./art";
import type { GameButton, GameEngine, GameInput } from "./types";

const campaign = campaignFor(document.body.dataset.game ?? "");
if (!campaign) throw new Error("This offline game is missing its campaign.");
const game = campaign;
const demo = new URLSearchParams(location.search).get("demo") === "1";
const embedded = window.parent !== window;
const chapters = demo ? 1 : game.chapters.length;
const key = `gamepad-campaign-v1:${game.slug}${demo ? ":demo" : ""}`;
type Phase = "briefing" | "playing" | "paused" | "victory" | "defeat" | "ending";
type Save = { version: 1 | 2; slug: string; chapter: number; unlocked: number; completed: boolean; phase: Phase; engine?: Record<string, unknown>; progression?: Record<string, unknown> };
let chapter = 0, unlocked = 1, completed = false, phase: Phase = "briefing";
let engine: GameEngine;
let progression: Record<string, unknown> = {};
const audio = new GameAudio(game.slug, game.family);
let storageAvailable = true;
let savedAt = 0, lastFrame = 0, lastHud = 0;
const held = new Set<GameButton>(), presses = new Set<GameButton>(), touchHeld = new Map<number, GameButton>();
let previousPad = new Set<GameButton>();
let padAim: GameInput["aim"];
let waitForPadRelease = false;
let pointer: GameInput["pointer"];
let showHints = game.family === "strategy";
const root = document.getElementById("game")!;
root.dataset.family = game.family;
root.innerHTML = `<header><div><span class="brand">GamePad Originals${demo ? " · First chapter demo" : " · Offline campaign"}</span><h1></h1></div><div class="toolbar"><button id="sound" aria-pressed="true">Sound on</button><button id="hints" aria-pressed="${showHints}">Hints</button><button id="fullscreen">Full screen</button><button id="menu">Campaign</button><button id="pause">Pause</button>${embedded ? '<button id="close">Close game</button>' : ""}</div></header>
  <main><section class="dashboard"><div><span id="chapter-number"></span><h2 id="chapter-title"></h2><p id="objective"></p></div><div id="stats" aria-live="off"></div></section>
  <div class="stage"><canvas width="960" height="540" tabindex="0" aria-label="Game board"></canvas><div id="boss" hidden></div><section id="overlay" aria-label="Campaign menu"></section></div>
  <section id="decisions" hidden aria-label="Game decisions"><h3 id="choice-prompt"></h3><p id="panel-help" hidden>Arrows + confirm choose an option. X or controller Select returns to the board.</p><div id="game-actions"></div></section>
  <p id="message" role="status"></p><p id="selection" hidden></p><p id="notice" role="alert"></p><div class="controls"><div class="dpad"><button data-control="up" aria-label="Move up">↑</button><button data-control="left" aria-label="Move left">←</button><button data-control="down" aria-label="Move down">↓</button><button data-control="right" aria-label="Move right">→</button></div><div class="abilities"><button data-control="action"></button><button data-control="alt"></button></div></div>
  <details><summary>Controls and save files</summary><p id="instructions"></p><p>Keyboard: arrows or WASD. Space / Enter: primary action. X / Shift: secondary action. P / Escape: pause. Controller: left stick / D-pad, A and X, right stick to aim, Start to pause. Tap a decision to select it; keyboard/controller arrows and confirm work too. Touch controls are below the board.</p><label class="volume">Music and effects <input id="volume" type="range" min="0" max="100" value="45" aria-label="Sound volume"></label><div class="save-tools"><button id="export">Export save</button><label class="button">Import save<input id="import" type="file" accept=".json,application/json"></label><button id="restart">Restart campaign</button></div><p id="storage"></p></details></main><footer>Original single-player campaign · Art, music, story and code included · No network needed</footer>`;
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
  if (![1, 2].includes(s.version) || s.slug !== game.slug || !Number.isInteger(s.chapter) || s.chapter < 0 || s.chapter >= chapters || !Number.isInteger(s.unlocked) || s.unlocked < 1 || s.unlocked > chapters || s.chapter >= s.unlocked || typeof s.completed !== "boolean" || !["briefing", "playing", "paused", "victory", "defeat", "ending"].includes(s.phase)) throw new Error("This save is incompatible with this campaign.");
  if (s.completed && s.unlocked !== chapters || s.phase === "ending" && !s.completed) throw new Error("This save has invalid campaign progress.");
  if (s.engine !== undefined && (!s.engine || typeof s.engine !== "object" || Array.isArray(s.engine))) throw new Error("Invalid chapter state.");
  if (["playing", "paused", "victory", "defeat"].includes(s.phase) && !s.engine) throw new Error("Missing chapter state.");
  if (s.progression !== undefined) {
    if (!s.progression || typeof s.progression !== "object" || Array.isArray(s.progression) || JSON.stringify(s.progression).length > 32_000) throw new Error("Invalid campaign equipment.");
    const safe = (value: unknown, depth = 0): boolean => {
      if (depth > 8) return false;
      if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= 1e9;
      if (typeof value === "string") return value.length < 1000;
      if (typeof value === "boolean" || value === null) return true;
      if (Array.isArray(value)) return value.length <= 500 && value.every(v => safe(v, depth + 1));
      return !!value && typeof value === "object" && Object.entries(value).every(([k, v]) => !["__proto__", "prototype", "constructor"].includes(k) && k.length < 100 && safe(v, depth + 1));
    };
    if (!safe(s.progression)) throw new Error("Invalid campaign equipment.");
  }
  return s;
}

function notifyParent() {
  if (embedded) parent.postMessage({ type: "gamepad-progress", slug: game.slug, chapter: chapter + 1, unlocked, completed, demo }, location.origin);
}
function snapshot(): Save {
  progression = engine.progression?.() ?? progression;
  return { version: 2, slug: game.slug, chapter, unlocked, completed, phase, engine: engine.save(), progression };
}
function save() {
  try { localStorage.setItem(key, JSON.stringify(snapshot())); storageAvailable = true; }
  catch { storageAvailable = false; }
  el("storage").textContent = storageAvailable ? "Progress saves automatically in this browser. Export a save to keep a backup or move to another device." : "Browser storage is unavailable. Export a save before closing to keep your progress.";
  notifyParent();
}
function restore(s: Save) {
  // Construct and validate the engine before changing any live campaign progress.
  const carried = s.progression && Object.keys(s.progression).length ? s.progression : undefined;
  let candidate: GameEngine, migrated = false;
  try { candidate = createEngine({ campaign: game, chapterIndex: s.chapter, restored: s.engine, progression: carried }); }
  catch (error) {
    if (s.version !== 1) throw error;
    candidate = createEngine({ campaign: game, chapterIndex: s.chapter }); migrated = true;
  }
  const status = candidate.view().status;
  if (!migrated && ((s.phase === "victory" && status !== "won") || (s.phase === "defeat" && status !== "lost") || (["playing", "paused"].includes(s.phase) && status !== "playing"))) throw new Error("Save status does not match chapter state.");
  engine = candidate;
  progression = candidate.progression?.() ?? carried ?? {};
  chapter = s.chapter; unlocked = s.unlocked; completed = s.completed;
  phase = migrated && s.phase !== "ending" ? "briefing" : s.phase === "playing" ? "paused" : s.phase;
  return migrated;
}
function freshEngine(index: number) {
  progression = engine?.progression?.() ?? progression;
  return createEngine({ campaign: game, chapterIndex: index, progression: Object.keys(progression).length ? progression : undefined });
}
engine = freshEngine(0);
let recoveredMessage = "";
try {
  const stored = localStorage.getItem(key);
  if (stored && restore(validate(JSON.parse(stored)))) recoveredMessage = "Campaign unlocks kept. This upgraded chapter starts fresh with its new world and equipment.";
} catch (error) {
  recoveredMessage = error instanceof Error ? `Couldn't restore progress: ${error.message} A fresh campaign is ready.` : "A fresh campaign is ready.";
}

function clearInput() { held.clear(); presses.clear(); touchHeld.clear(); pointer = undefined; root.querySelectorAll(".held").forEach(b => b.classList.remove("held")); }
function button(label: string, action: () => void, primary = false, disabled = false) {
  const b = document.createElement("button"); b.textContent = label; b.disabled = disabled;
  if (primary) { b.className = "primary"; b.dataset.primary = "true"; }
  b.onclick = () => { void audio.unlock(); action(); }; return b;
}
function paragraph(text: string, className = "") { const p = document.createElement("p"); p.textContent = text; p.className = className; return p; }
function start(index = chapter, fresh = false) {
  if (index >= chapters || index >= unlocked) return;
  if (fresh || index !== chapter || phase === "defeat" || phase === "victory" || phase === "ending") engine = freshEngine(index);
  void audio.unlock();
  chapter = index; phase = "playing"; clearInput(); screen(); save(); canvas.focus({ preventScroll: true });
}
function pause() {
  if (phase === "playing") { phase = "paused"; clearInput(); screen(); save(); }
  else if (phase === "paused") start();
}
function screen() {
  audio.running(phase === "playing");
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
    if (engine.view().choices?.length) {
      card.append(paragraph("Spend earned rewards in the workshop, or continue to the next chapter."));
      card.append(button("Open workshop", () => el("game-actions").querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: false })));
    }
    card.append(button(chapter + 1 < chapters ? "Next chapter" : demo ? "Finish demo" : "See ending", () => {
      if (chapter + 1 < chapters) { chapter++; engine = freshEngine(chapter); phase = "briefing"; }
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
      else { chapter = i; engine = freshEngine(i); phase = "briefing"; screen(); save(); }
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
function finishChapter() {
  if (phase !== "playing") return false;
  const status = engine.view().status;
  if (status === "playing") return false;
  phase = status === "won" ? "victory" : "defeat";
  audio.play([{ type: status === "won" ? "success" : "fail" }]);
  if (status === "won") unlocked = Math.max(unlocked, Math.min(chapters, chapter + 2));
  clearInput(); screen(); return true;
}
el("pause").onclick = pause;
el("menu").onclick = menu;
el("hints").onclick = () => { showHints = !showHints; el("hints").setAttribute("aria-pressed", String(showHints)); hud(); };
el("sound").onclick = () => {
  audio.setEnabled(!audio.isEnabled()); el("sound").textContent = audio.isEnabled() ? "Sound on" : "Sound off";
  el("sound").setAttribute("aria-pressed", String(audio.isEnabled()));
};
el<HTMLInputElement>("volume").oninput = e => audio.setVolume(Number((e.target as HTMLInputElement).value) / 100);
el("fullscreen").onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { el("notice").textContent = "Full screen is unavailable in this browser. You can keep playing here."; }
};
if (embedded) el("close").onclick = () => { menu(); parent.postMessage({ type: "gamepad-close", slug: game.slug }, location.origin); };
el("restart").onclick = () => {
  if (!confirm("Restart this campaign and clear its saved progress?")) return;
  chapter = 0; unlocked = 1; completed = false; phase = "briefing";
  progression = {}; engine = createEngine({ campaign: game, chapterIndex: 0 }); screen(); save();
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
    const s = validate(JSON.parse(await file.text())); const migrated = restore(s); clearInput(); screen(); save();
    el("notice").textContent = migrated ? "Campaign unlocks imported. The upgraded chapter starts fresh." : "Save imported. Resume when ready.";
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
  if (target.closest("button,a,summary,label") && !el("game-actions").contains(target)) return;
  if (phase === "playing" && ((engine.view().choices?.length && engine.view().choiceMode === "modal") || el("game-actions").contains(document.activeElement))) {
    e.preventDefault(); if (!e.repeat) presses.add(control); return;
  }
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
let startHeld = false, selectHeld = false;
function gamepad(): Set<GameButton> {
  const buttons = new Set<GameButton>();
  let pad: Gamepad | undefined;
  try { pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected) ?? undefined; } catch { return buttons; }
  if (!pad) { startHeld = false; selectHeld = false; padAim = undefined; return buttons; }
  const on = (i: number) => !!pad?.buttons[i]?.pressed;
  if (on(12) || pad.axes[1] < -.35) buttons.add("up");
  if (on(13) || pad.axes[1] > .35) buttons.add("down");
  if (on(14) || pad.axes[0] < -.35) buttons.add("left");
  if (on(15) || pad.axes[0] > .35) buttons.add("right");
  if (waitForPadRelease && !on(0) && !on(1) && !on(2)) waitForPadRelease = false;
  if (!waitForPadRelease) {
    if (on(0)) buttons.add("action"); if (on(2) || on(1)) buttons.add("alt");
  }
  if (on(9) && !startHeld) pause(); startHeld = on(9);
  if (on(8) && !selectHeld && ["playing", "victory"].includes(phase)) {
    if (el("game-actions").contains(document.activeElement)) {
      if (phase === "playing") canvas.focus({ preventScroll: true });
      else overlay.querySelector<HTMLButtonElement>('[data-primary="true"]')?.focus({ preventScroll: true });
    }
    else el("game-actions").querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }
  selectHeld = on(8);
  const ax = pad.axes[2] ?? 0, ay = pad.axes[3] ?? 0;
  padAim = Math.hypot(ax, ay) > .2 ? { x: ax, y: ay } : undefined;
  return buttons;
}
let choicesSignature = "";
function hud() {
  const view = engine.view();
  root.dataset.artReady = String(artReady());
  root.dataset.status = view.status;
  el("objective").textContent = view.objective;
  el("message").textContent = view.message;
  el("selection").textContent = view.selection ?? "";
  el("selection").hidden = !view.selection || !showHints;
  const stats = el("stats"); stats.replaceChildren();
  for (const stat of view.stats) { const box = document.createElement("div"), label = document.createElement("span"), value = document.createElement("b"); label.textContent = stat.label; value.textContent = String(stat.value); box.append(label, value); stats.append(box); }
  const decisions = el("decisions"), actions = el("game-actions"), choices = view.choices ?? [];
  const sidePanel = innerWidth >= 1000 && view.choiceMode !== "modal" && choices.length > 0 && ["playing", "victory"].includes(phase);
  root.dataset.sidePanel = String(sidePanel);
  const signature = JSON.stringify([choices, view.choicePrompt, view.choiceMode, phase]);
  if (signature !== choicesSignature) {
    choicesSignature = signature;
    const oldFocus = (document.activeElement as HTMLElement)?.dataset?.choice;
    actions.replaceChildren(); decisions.hidden = choices.length === 0 || !["playing", "victory"].includes(phase);
    decisions.classList.toggle("modal", view.choiceMode === "modal");
    decisions.setAttribute("role", view.choiceMode === "modal" ? "dialog" : "region");
    el("choice-prompt").textContent = view.choicePrompt ?? "Options";
    el("panel-help").hidden = view.choiceMode === "modal";
    for (const choice of choices) {
      const b = button(choice.label, () => {
        const modal = engine.view().choiceMode === "modal";
        engine.choose?.(choice.id);
        const next = engine.view();
        if ((modal && (!next.choices?.length || next.choiceMode !== "modal")) || (phase === "playing" && next.choiceMode !== "modal")) {
          clearInput(); waitForPadRelease = true; canvas.focus({ preventScroll: true });
        }
        audio.play(engine.events?.() ?? []);
        finishChapter();
        save(); hud();
      }, false, choice.disabled);
      b.dataset.choice = choice.id;
      if (choice.description) { const detail = document.createElement("small"); detail.textContent = choice.description; b.append(detail); }
      actions.append(b);
    }
    if (!decisions.hidden && (view.choiceMode === "modal" || oldFocus)) {
      const target = Array.from(actions.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).find(b => b.dataset.choice === oldFocus) ?? actions.querySelector<HTMLButtonElement>("button:not(:disabled)");
      target?.focus({ preventScroll: true });
    }
  }
  const boss = el("boss"); boss.hidden = !view.boss;
  if (view.boss) {
    boss.replaceChildren(); const label = document.createElement("span"), meter = document.createElement("div"), fill = document.createElement("i");
    label.textContent = view.boss.name; fill.style.width = `${Math.max(0, Math.min(100, view.boss.health / Math.max(1, view.boss.max) * 100))}%`;
    meter.append(fill); boss.append(label, meter); boss.setAttribute("aria-label", `${view.boss.name}: ${Math.ceil(view.boss.health)} of ${view.boss.max} health`);
  }
  // Size the board through its width so pointer coordinates and its 16:9 geometry stay exact.
  const reserved = root.querySelector("header")!.offsetHeight + root.querySelector<HTMLElement>(".dashboard")!.offsetHeight + el("message").offsetHeight + el("selection").offsetHeight + el("notice").offsetHeight + root.querySelector<HTMLElement>(".controls")!.offsetHeight + (view.choiceMode === "modal" || sidePanel ? 0 : decisions.offsetHeight) + 48;
  root.style.setProperty("--board-height", `${Math.max(180, innerHeight - reserved)}px`);
}
function frame(time: number) {
  const dt = Math.min(.033, Math.max(0, (time - (lastFrame || time)) / 1000)); lastFrame = time;
  const pad = gamepad();
  for (const b of pad) if (!previousPad.has(b)) presses.add(b);
  previousPad = pad;
  const choosing = ["playing", "victory"].includes(phase) && ((!!engine.view().choices?.length && engine.view().choiceMode === "modal") || el("game-actions").contains(document.activeElement));
  if (choosing) {
    const list = Array.from(el("game-actions").querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const current = list.indexOf(document.activeElement as HTMLButtonElement);
    if (presses.has("action")) (list[current] ?? list[0])?.click();
    else if (presses.has("alt") && engine.view().choiceMode !== "modal") {
      if (phase === "playing") canvas.focus({ preventScroll: true });
      else overlay.querySelector<HTMLButtonElement>('[data-primary="true"]')?.focus({ preventScroll: true });
    } else if (list.length && ["left", "right", "up", "down"].some(b => presses.has(b as GameButton))) {
      const direction = presses.has("left") || presses.has("up") ? -1 : 1;
      list[(Math.max(0, current) + direction + list.length) % list.length]?.focus({ preventScroll: true });
    }
  }
  if (phase === "playing") {
    if (choosing) {
      engine.update(dt, { held: new Set(), pressed: new Set() });
    } else engine.update(dt, { held: new Set([...held, ...pad, ...touchHeld.values()]), pressed: new Set(presses), pointer, aim: padAim });
    audio.play(engine.events?.() ?? []);
    if (finishChapter()) save();
    else if (time - savedAt > 1500) { save(); savedAt = time; }
  } else if (!choosing && presses.has("action")) {
    const focus = document.activeElement;
    if (focus instanceof HTMLButtonElement && overlay.contains(focus)) focus.click();
    else overlay.querySelector<HTMLButtonElement>('[data-primary="true"]')?.click();
  } else if (!choosing && ["left", "right", "up", "down"].some(b => presses.has(b as GameButton))) {
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
addEventListener("pagehide", () => { save(); audio.dispose(); });
addEventListener("message", e => { if (embedded && e.source === parent && e.origin === location.origin && e.data?.type === "gamepad-save") { menu(); parent.postMessage({ type: "gamepad-saved", slug: game.slug }, location.origin); } });
screen(); hud(); save();
if (recoveredMessage) el("notice").textContent = recoveredMessage;
requestAnimationFrame(frame);
