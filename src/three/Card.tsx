import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { backTexture } from "./textures";
import { pointer, restless } from "./pointer";
import { motionMode } from "../lib/motion";
import { arrivedAt, beat, now } from "../lib/show";

export const CARD_W = 2.4, CARD_H = 1.8, CARD_D = 0.12;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const outBack = (x: number) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;
/** Seconds between the foil glints that sweep across a resting card. */
const GLINT_EVERY = 4.2;

// Foil sheen laid over the cover: a rainbow band that slides as the card tilts,
// strongest at glancing angles, the way a holographic trading card catches light.
const foilVert = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position,1.);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const foilFrag = /* glsl */ `
  uniform float uTime; uniform float uStrength; uniform float uGlint;
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  vec3 spectrum(float x){ return .5 + .5*cos(6.2831*(x + vec3(0.,.33,.67))); }
  void main(){
    float facing = clamp(dot(vN, vView), 0., 1.);
    float glance = pow(1. - facing, 1.4);
    float band = vUv.x*1.2 + vUv.y*.6 + vN.x*2.2 - vN.y*1.4 + uTime*.04;
    vec3 c = spectrum(band);
    float stripes = .6 + .4*sin((vUv.x + vUv.y)*38. + uTime*.3);
    float a = glance * stripes * uStrength;
    // the glint: a diagonal blade of white-hot foil that sweeps across the card now and then
    float d = vUv.x*.85 + vUv.y*.5 - uGlint;
    float blade = exp(-d*d*90.) + .35*exp(-d*d*14.);
    c = mix(c, vec3(1.), .45*exp(-d*d*260.));
    a += blade * .75;
    gl_FragColor = vec4(c, a);
  }`;

/** The foil sheen as a material, one per card. */
const makeFoil = (strength = 0.9) => new THREE.ShaderMaterial({
  vertexShader: foilVert, fragmentShader: foilFrag, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uStrength: { value: strength }, uGlint: { value: -2 } },
});

type Props = {
  texture: THREE.Texture;
  position?: [number, number, number];
  scale?: number;
  /** spin once whenever this key changes (the cover swaps while the back faces you) */
  flipKey?: string | number;
  /** follow the pointer and bob; off for cards in a hand */
  alive?: boolean;
  baseRotation?: [number, number, number];
  dim?: number;
};

export function Card({ texture, position = [0, 0, 0], scale = 1, flipKey, alive = true, baseRotation = [0, 0, 0], dim = 1 }: Props) {
  const group = useRef<THREE.Group>(null!);
  const [shown, setShown] = useState(texture);
  const flip = useRef({ t: 1, swapped: true, next: texture });
  const foil = useMemo(() => makeFoil(), []);
  const back = useMemo(backTexture, []);
  const tilt = useRef({ x: 0, y: 0, z: 0 });
  const target = useRef(new THREE.Vector3(...position));
  target.current.set(...position);
  // when the last glint started: one after each landing, and every few seconds while the card rests
  const glint = useRef(-10);
  const size = useRef(scale);

  useEffect(() => {
    if (flipKey === undefined || motionMode() !== "full") { setShown(texture); return; }
    // a flip already under way retargets instead of restarting, so a held d-pad still lands each cover
    const f = flip.current;
    if (f.t < 1) { f.next = texture; if (f.swapped) setShown(texture); }
    else flip.current = { t: 0, swapped: false, next: texture };
  }, [flipKey, texture]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const mode = motionMode();
    const full = mode === "full", off = mode === "off";
    const t = state.clock.elapsedTime, clock = now();
    const f = flip.current;

    // the entrance: as the camera arrives the card swoops in from deep space, spinning, and lands with a bounce
    const enter = off ? 1 : clamp01((clock - arrivedAt() - 0.1) / 1.25);
    const ein = outCubic(enter);
    const entering = enter < 1;

    // the flip: a full turn with a punch, the card dipping back and coming forward as the new cover faces you
    let spin = 0, punch = 0;
    if (f.t < 1) {
      const was = f.t;
      f.t = Math.min(1, f.t + dt / 0.8);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2; // ease in-out cubic
      spin = e * Math.PI * 2;
      punch = Math.sin(Math.PI * f.t);
      if (!f.swapped && f.t > 0.5) { f.swapped = true; setShown(f.next); }
      if (was < 1 && f.t >= 1) glint.current = clock;
    }
    // a beat also bumps the card when it doesn't flip (a hand card, or calm motion)
    const sinceBeat = clock - beat.at;
    const bump = full && f.t >= 1 && sinceBeat < 0.6 ? Math.sin(Math.PI * sinceBeat / 0.6) * 0.5 : 0;

    // the showcase: with no mouse moving (and always on a phone) the card sways by itself so the foil catches light
    const k = tilt.current;
    const live = alive && !off;
    const auto = full ? restless(clock) : 1;
    const amp = full ? 1 : 0.35;
    const px = full ? pointer.x * (1 - auto) : 0, py = full ? pointer.y * (1 - auto) : 0;
    k.x = THREE.MathUtils.damp(k.x, live ? -py * 0.22 + (Math.sin(t * 0.8) * 0.09 + 0.03) * auto * amp : 0, 3, dt);
    k.y = THREE.MathUtils.damp(k.y, live ? px * 0.34 + Math.sin(t * 0.55) * 0.3 * auto * amp : 0, 3, dt);
    k.z = THREE.MathUtils.damp(k.z, live ? Math.sin(t * 0.5) * 0.03 * amp : 0, 3, dt);
    const swoop = full ? (1 - ein) * Math.PI * 2.5 : 0;
    g.rotation.set(baseRotation[0] + k.x + (1 - ein) * 0.6 * (full ? 1 : 0), baseRotation[1] + spin + k.y + swoop, baseRotation[2] + k.z);

    const bob = live ? Math.sin(t * 0.9) * (full ? 0.08 : 0.03) : 0;
    const snap = off ? 30 : 3.5;
    const dz = full ? -14 * (1 - ein) - 0.9 * punch - 0.5 * bump : 0;
    const dy = full ? -1.6 * (1 - ein) : 0;
    if (entering && full) {
      g.position.set(target.current.x, target.current.y + dy, target.current.z + dz);
    } else {
      g.position.x = THREE.MathUtils.damp(g.position.x, target.current.x, snap, dt);
      g.position.y = THREE.MathUtils.damp(g.position.y, target.current.y + bob, snap, dt);
      g.position.z = THREE.MathUtils.damp(g.position.z, target.current.z + dz, full ? 9 : snap, dt);
    }
    const land = entering ? Math.max(0.001, full ? outBack(enter) : ein) : 1;
    size.current = THREE.MathUtils.damp(size.current, scale * (1 - 0.1 * punch), off ? 30 : 6, dt);
    g.scale.setScalar(size.current * land);

    // the glint sweeps from the lower left to the upper right in 0.9 s
    // (a perpetual loop, so full motion only: a device that asks for less motion gets a still foil)
    if (full && live && clock - glint.current > GLINT_EVERY) glint.current = clock;
    const gp = (clock - glint.current) / 0.9;
    foil.uniforms.uGlint.value = off || gp > 1 ? -2 : -0.6 + gp * 2.4;
    foil.uniforms.uTime.value = off ? 0 : t;
  });

  return (
    <group ref={group} position={position}>
      {/* body: dark metal with an iridescent clearcoat so the edges shift color */}
      <RoundedBox args={[CARD_W, CARD_H, CARD_D]} radius={0.06} smoothness={4}>
        <meshPhysicalMaterial color="#171512" metalness={0.85} roughness={0.28} clearcoat={1} clearcoatRoughness={0.15}
          iridescence={1} iridescenceIOR={1.5} iridescenceThicknessRange={[120, 680]} />
      </RoundedBox>
      <mesh position={[0, 0, CARD_D / 2 + 0.002]}>
        <planeGeometry args={[CARD_W - 0.1, CARD_H - 0.1]} />
        <meshBasicMaterial map={shown} toneMapped={false} color={new THREE.Color(dim, dim, dim)} />
      </mesh>
      <mesh position={[0, 0, CARD_D / 2 + 0.004]} material={foil}>
        <planeGeometry args={[CARD_W - 0.1, CARD_H - 0.1]} />
      </mesh>
      <mesh position={[0, 0, -CARD_D / 2 - 0.002]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[CARD_W - 0.1, CARD_H - 0.1]} />
        <meshBasicMaterial map={back} toneMapped={false} />
      </mesh>
    </group>
  );
}
