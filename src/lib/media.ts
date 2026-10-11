import { motionOff, subscribeMotion } from "./motion";

// Every looping clip on the page (the world behind the store and the animated covers) registers here, so the
// stop button pauses them all, and a phone that refuses to autoplay (an iPhone in Low Power Mode, a browser
// with autoplay blocked) starts them on the visitor's first tap or key press instead of showing a still.
const clips = new Set<HTMLVideoElement>();
const blocked = new Set<HTMLVideoElement>();

const tryPlay = (v: HTMLVideoElement) => {
  if (motionOff() || !v.isConnected && !clips.has(v)) return;
  // some browsers only allow muted autoplay when the attribute, not just the property, is set
  v.muted = true; v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
  v.play().then(() => blocked.delete(v), () => { blocked.add(v); listen(); });
};

let listening = false;
const unblock = () => {
  [...blocked].forEach(tryPlay);
  if (!blocked.size) stopListening();
};
const EVENTS = ["pointerdown", "keydown", "touchend"] as const;
function listen() {
  if (listening) return;
  listening = true;
  EVENTS.forEach(e => addEventListener(e, unblock, { capture: true, passive: true }));
}
function stopListening() {
  listening = false;
  EVENTS.forEach(e => removeEventListener(e, unblock, { capture: true }));
}

/** Keep this clip playing while motion is on. Returns the unregister function. */
export function keepPlaying(v: HTMLVideoElement) {
  clips.add(v);
  if (motionOff()) v.pause(); else tryPlay(v);
  return () => { clips.delete(v); blocked.delete(v); };
}

if (typeof window !== "undefined") {
  subscribeMotion(() => clips.forEach(v => (motionOff() ? v.pause() : tryPlay(v))));
  // a phone that suspended the clips in the background resumes them on return
  document.addEventListener("visibilitychange", () => { if (!document.hidden) clips.forEach(v => { if (v.paused) tryPlay(v); }); });
}
