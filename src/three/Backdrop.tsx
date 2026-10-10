import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { reducedMotion } from "../lib/motion";

// The shader mixes and outputs in display (sRGB) space, like the CSS fallback, so the uniforms hold
// raw sRGB values (no sRGB->linear conversion).
const raw = (hex: string) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
/** Cover accents can be 100% saturated; cap them so the scene light never shouts. */
export const calm = (hex: string) => {
  const c = new THREE.Color(hex), h = { h: 0, s: 0, l: 0 };
  c.getHSL(h, THREE.SRGBColorSpace);
  return "#" + c.setHSL(h.h, Math.min(h.s, 0.75), h.l, THREE.SRGBColorSpace).getHexString();
};

// Slow, flowing color field built from the selected game's palette, with a hot spot
// behind the focus point and a vignette. Colors ease toward each new palette.
const frag = /* glsl */ `
  uniform vec3 c0, c1, c2; uniform float uTime; uniform vec2 uFocus; uniform float uAspect;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p){ float v = 0., a = .5; for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.02; a *= .5; } return v; }
  void main(){
    vec2 p = vec2(vUv.x*uAspect, vUv.y);
    float t = uTime*.035;
    // one fbm with a cheap trig warp: smooth, slow, and light enough for phones
    float n = fbm(p*1.6 + vec2(t, -t*.7) + vec2(sin(p.y*2.3 + t*3.), cos(p.x*1.9 - t*2.))*.45);
    vec3 col = mix(c0, c1, smoothstep(.25, .85, n));
    vec2 d = (vUv - uFocus) * vec2(uAspect, 1.);
    float glow = exp(-dot(d,d)*2.6);
    col = mix(col, c2, glow*.55);
    col += c2 * pow(glow, 6.) * .25;
    float vig = smoothstep(1.25, .25, length((vUv-.5)*vec2(uAspect*.8, 1.)));
    col *= mix(.18, 1., vig);
    col += (hash(vUv*vec2(1920.,1080.) + uTime) - .5) * .035; // film grain
    gl_FragColor = vec4(col, 1.);
  }`;
const vert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, .9999, 1.); }`;

export function Backdrop({ palette, focus }: { palette: [string, string, string]; focus: [number, number] }) {
  const { size } = useThree();
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, depthWrite: false, depthTest: false,
    uniforms: {
      c0: { value: raw(palette[0]) }, c1: { value: raw(palette[1]) }, c2: { value: raw(palette[2]) },
      uTime: { value: 0 }, uFocus: { value: new THREE.Vector2(...focus) }, uAspect: { value: 1 },
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const targets = useMemo(() => palette.map(raw), [palette]);

  useFrame((s, dt) => {
    const u = mat.uniforms;
    u.uTime.value = reducedMotion() ? 0 : s.clock.elapsedTime; // flow and grain hold still under Reduce motion
    u.uAspect.value = size.width / size.height;
    // darken the deep tones a touch so text over the scene stays readable
    (["c0", "c1", "c2"] as const).forEach((k, i) => (u[k].value as THREE.Color).lerp(i < 2 ? targets[i].clone().multiplyScalar(0.62) : targets[i], 1 - Math.exp(-dt * 2.2)));
    (u.uFocus.value as THREE.Vector2).lerp(new THREE.Vector2(...focus), 1 - Math.exp(-dt * 2.5));
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
