// How much the site moves, read live so the 3D loop, the clips and the UI follow a change without a reload.
//   full: everything, the fly-in, the flips, the parallax and the hero carousel
//   calm: a device asked for less motion; the world and the covers keep playing, the big moves are skipped
//   off:  the visitor pressed stop; everything rests
export type MotionMode = "full" | "calm" | "off";

/** What a device that asks for less motion gets. Ken's call, see the README. */
export const WHEN_REDUCED: MotionMode = "calm";

const q = typeof matchMedia !== "undefined" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const KEY = "gamepad-motion";
const read = () => { try { return localStorage.getItem(KEY) === "off"; } catch { return false; } };
let stopped = read();
const subs = new Set<() => void>();
const emit = () => subs.forEach(cb => cb());
q?.addEventListener("change", emit);

export const motionMode = (): MotionMode => (stopped ? "off" : q?.matches ? WHEN_REDUCED : "full");
/** True when nothing should move. */
export const motionOff = () => motionMode() === "off";
/** True for the big moves: fly-in, flips, parallax, the hero carousel, the drifting world. */
export const bigMotion = () => motionMode() === "full";
export const subscribeMotion = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

/** The stop button. The choice stays in this browser. */
export const setMotionStopped = (off: boolean) => {
  stopped = off;
  try { if (off) localStorage.setItem(KEY, "off"); else localStorage.removeItem(KEY); } catch { /* private window: this visit only */ }
  emit();
};

// kept for the parts that only care whether anything moves
export const reducedMotion = motionOff;
export const subscribeReducedMotion = subscribeMotion;
