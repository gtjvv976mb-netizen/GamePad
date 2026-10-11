// prefers-reduced-motion, read live so the 3D loop and the logo's foil follow a change without a reload.
const q = typeof matchMedia !== "undefined" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
export const reducedMotion = () => !!q?.matches;
export const subscribeReducedMotion = (cb: () => void) => {
  q?.addEventListener("change", cb);
  return () => q?.removeEventListener("change", cb);
};
