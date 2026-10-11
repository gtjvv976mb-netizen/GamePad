/**
 * Window-wide pointer in -1..1, so the 3D layer can react while UI sits on top of it. `at` is when a mouse last
 * moved (performance.now seconds): touch and a resting mouse leave it alone, and the 3D layer then sways by itself.
 */
export const pointer = { x: 0, y: 0, at: -100 };
if (typeof window !== "undefined") {
  window.addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    pointer.at = performance.now() / 1000;
  }, { passive: true });
}
/** 0 while the mouse is moving, easing to 1 once it has rested for a couple of seconds (and always on touch). */
export const restless = (now: number) => Math.min(1, Math.max(0, (now - pointer.at - 1.2) / 1.5));
