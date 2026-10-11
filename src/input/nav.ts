import { useEffect, useRef, useSyncExternalStore } from "react";
import { useIsPresent } from "motion/react";
import { noteInput } from "../lib/show";

// The whole store can be driven from a real game controller (Gamepad API) or the keyboard.
// Inputs become a small set of actions that the active tab listens to.
export type NavAction = "left" | "right" | "up" | "down" | "confirm" | "back" | "prevTab" | "nextTab" | "alt";

type Handler = (a: NavAction) => boolean | void;
const handlers: Handler[] = [];
let suspended = 0;
/** A game owns its inputs while open, including across background tab mounts. */
export function suspendStoreNavigation() {
  suspended++;
  return () => { suspended = Math.max(0, suspended - 1); };
}
let padName: string | null = null;
const padListeners = new Set<() => void>();

function emit(a: NavAction) {
  if (suspended) return;
  noteInput();
  // newest subscriber first, so an open sheet gets input before the tab beneath it
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i](a) === true) return;
}

/**
 * Subscribe to controller/keyboard actions. Return true from the handler to stop propagation.
 * A view (or sheet) that is animating out stops listening at once, so a quick press after
 * switching tabs only reaches the one coming in.
 */
export function useNav(handler: Handler, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  const present = useIsPresent(); // always true outside AnimatePresence
  useEffect(() => {
    if (!enabled || !present) return;
    const h: Handler = a => ref.current(a);
    handlers.push(h);
    return () => { handlers.splice(handlers.indexOf(h), 1); };
  }, [enabled, present]);
}

/** Name of the connected controller, or null. */
export const usePad = () => useSyncExternalStore(
  cb => { padListeners.add(cb); return () => padListeners.delete(cb); },
  () => padName, () => null,
);

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

if (typeof window !== "undefined") {
  window.addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    const onButton = e.target instanceof HTMLElement && e.target.closest("button,a");
    const map: Record<string, NavAction> = {
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      Escape: "back", "[": "prevTab", "]": "nextTab", a: "confirm", b: "back", x: "alt", q: "prevTab", e: "nextTab",
    };
    let a = map[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    // Enter on a focused button keeps its native click; elsewhere it confirms the selection.
    if (e.key === "Enter" && !onButton) a = "confirm";
    if (!a) return;
    if (a !== "back") e.preventDefault();
    emit(a);
  });

  const setPad = (n: string | null) => { padName = n; padListeners.forEach(l => l()); };
  window.addEventListener("gamepadconnected", e => { setPad((e as GamepadEvent).gamepad.id); poll(); });
  window.addEventListener("gamepaddisconnected", () => setPad(null));

  // Standard mapping: 0 A, 1 B, 2 X, 4 LB, 5 RB, 12-15 d-pad; left stick on axes 0/1.
  const BTN: [number, NavAction][] = [[0, "confirm"], [1, "back"], [2, "alt"], [4, "prevTab"], [5, "nextTab"], [12, "up"], [13, "down"], [14, "left"], [15, "right"]];
  const held = new Map<NavAction, number>();
  let raf = 0;
  const poll = () => {
    cancelAnimationFrame(raf);
    const step = (now: number) => {
      const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
      if (!pad) return;
      const down = new Set<NavAction>();
      for (const [i, a] of BTN) if (pad.buttons[i]?.pressed) down.add(a);
      const [ax = 0, ay = 0] = pad.axes;
      if (ax < -0.55) down.add("left"); if (ax > 0.55) down.add("right");
      if (ay < -0.55) down.add("up"); if (ay > 0.55) down.add("down");
      for (const a of down) {
        const since = held.get(a);
        // fire on press, then auto-repeat directions while held
        if (since === undefined) { held.set(a, now); emit(a); }
        else if (/left|right|up|down/.test(a) && now - since > 380) { held.set(a, now - 260); emit(a); }
      }
      for (const a of [...held.keys()]) if (!down.has(a)) held.delete(a);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
}
