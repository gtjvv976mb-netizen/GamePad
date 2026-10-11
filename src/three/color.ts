import * as THREE from "three";

/** Cover accents can be 100% saturated; cap them so the scene light and the world tint never shout. */
export const calm = (hex: string) => {
  const c = new THREE.Color(hex), h = { h: 0, s: 0, l: 0 };
  c.getHSL(h, THREE.SRGBColorSpace);
  return "#" + c.setHSL(h.h, Math.min(h.s, 0.75), h.l, THREE.SRGBColorSpace).getHexString();
};
