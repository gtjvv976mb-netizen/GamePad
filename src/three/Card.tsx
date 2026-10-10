import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { backTexture, reducedMotion } from "./textures";
import { pointer } from "./pointer";

export const CARD_W = 2.4, CARD_H = 1.8, CARD_D = 0.12;
const STILL = reducedMotion();

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
  uniform float uTime; uniform float uStrength;
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  vec3 spectrum(float x){ return .5 + .5*cos(6.2831*(x + vec3(0.,.33,.67))); }
  void main(){
    float facing = clamp(dot(vN, vView), 0., 1.);
    float glance = pow(1. - facing, 1.4);
    float band = vUv.x*1.2 + vUv.y*.6 + vN.x*2.2 - vN.y*1.4 + uTime*.04;
    vec3 c = spectrum(band);
    float stripes = .6 + .4*sin((vUv.x + vUv.y)*38. + uTime*.3);
    float a = glance * stripes * uStrength;
    gl_FragColor = vec4(c, a);
  }`;

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
  const foil = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: foilVert, fragmentShader: foilFrag, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uStrength: { value: 0.9 } },
  }), []);
  const back = useMemo(backTexture, []);
  const tilt = useRef({ x: 0, y: 0, z: 0 });
  const target = useRef(new THREE.Vector3(...position));
  target.current.set(...position);

  useEffect(() => {
    if (flipKey === undefined || STILL) { setShown(texture); return; }
    flip.current = { t: 0, swapped: false, next: texture };
  }, [flipKey, texture]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const f = flip.current;
    const t = state.clock.elapsedTime;
    let spin = 0;
    if (f.t < 1) {
      f.t = Math.min(1, f.t + dt / 0.75);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2; // ease in-out cubic
      spin = e * Math.PI * 2;
      if (!f.swapped && f.t > 0.5) { f.swapped = true; setShown(f.next); }
    }
    const k = tilt.current;
    const live = alive && !STILL;
    k.x = THREE.MathUtils.damp(k.x, live ? -pointer.y * 0.22 + Math.sin(t * 0.7) * 0.03 : 0, 4, dt);
    k.y = THREE.MathUtils.damp(k.y, live ? pointer.x * 0.32 : 0, 4, dt);
    k.z = THREE.MathUtils.damp(k.z, live ? Math.sin(t * 0.5) * 0.02 : 0, 4, dt);
    g.rotation.set(baseRotation[0] + k.x, baseRotation[1] + spin + k.y, baseRotation[2] + k.z);
    const bob = live ? Math.sin(t * 0.9) * 0.05 : 0;
    const snap = STILL ? 30 : 3.5;
    g.position.x = THREE.MathUtils.damp(g.position.x, target.current.x, snap, dt);
    g.position.y = THREE.MathUtils.damp(g.position.y, target.current.y + bob, snap, dt);
    g.position.z = THREE.MathUtils.damp(g.position.z, target.current.z, snap, dt);
    const s = THREE.MathUtils.damp(g.scale.x, scale, STILL ? 30 : 4, dt);
    g.scale.setScalar(s);
    foil.uniforms.uTime.value = t;
  });

  return (
    <group ref={group} position={position}>
      {/* body: dark metal with an iridescent clearcoat so the edges shift color */}
      <RoundedBox args={[CARD_W, CARD_H, CARD_D]} radius={0.06} smoothness={4}>
        <meshPhysicalMaterial color="#15161a" metalness={0.85} roughness={0.28} clearcoat={1} clearcoatRoughness={0.15}
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
