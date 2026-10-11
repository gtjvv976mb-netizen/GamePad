import { useSyncExternalStore } from "react";
import { bigMotion } from "./motion";

// The opening and the beats. On the first visit of a session the store opens with the Higgsfield fly-in; the
// interface and the 3D card arrive as the camera bursts out of the warp. Every later change of game is a beat
// the 3D layer reacts to (the card flips with a punch, the voxels scatter and settle).

export const now = () => performance.now() / 1000;

type Saver = Navigator & { connection?: { saveData?: boolean } };
export const saveData = () => typeof navigator !== "undefined" && !!(navigator as Saver).connection?.saveData;

const SEEN = "gamepad-intro";
const seen = () => { try { return sessionStorage.getItem(SEEN) === "1"; } catch { return false; } };
/** The fly-in plays once a session, at full motion, and never in the test suite (?nointro). */
export const WANTS_INTRO = typeof window !== "undefined" && bigMotion() && !seen() && !saveData()
  && !new URLSearchParams(location.search).has("nointro");
export const markIntroSeen = () => { try { sessionStorage.setItem(SEEN, "1"); } catch { /* private window */ } };

let revealed = !WANTS_INTRO;
let revealedAt = revealed ? now() : Infinity;
const subs = new Set<() => void>();
/** The camera has arrived: the interface comes in and the card swoops into place. */
export const reveal = () => {
  if (revealed) return;
  revealed = true; revealedAt = now();
  subs.forEach(cb => cb());
};
export const isRevealed = () => revealed;
/** When the interface came in, in seconds on the now() clock (Infinity while the fly-in still runs). */
export const arrivedAt = () => revealedAt;
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export const useRevealed = () => useSyncExternalStore(subscribe, isRevealed, () => true);
// never hold the store hostage: whatever happens to the clip, the interface is in after six seconds
if (!revealed) setTimeout(reveal, 6000);

/** The last beat: a change of game. The 3D layer reads it every frame. */
export const beat = { at: -10 };
export const kick = () => { beat.at = now(); };

// When the visitor last did something (a tap, a key, a wheel, a controller press), for the hero carousel.
let lastInput = now();
export const noteInput = () => { lastInput = now(); };
export const idleFor = () => now() - lastInput;
if (typeof window !== "undefined") {
  (["pointerdown", "keydown", "wheel", "touchstart"] as const).forEach(e => addEventListener(e, noteInput, { capture: true, passive: true }));
}
