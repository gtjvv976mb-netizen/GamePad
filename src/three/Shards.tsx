import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { pointer, restless } from "./pointer";
import { motionMode } from "../lib/motion";
import { arrivedAt, beat, now } from "../lib/show";

/**
 * Loose voxels, pixels off the mark, tumbling at different depths; nearer ones are bigger and move more with
 * the pointer. On every beat (a new game, the camera arriving) they burst away from the card and spring back.
 */
export function Shards({ accent }: { accent: string }) {
  const { viewport, size } = useThree();
  const group = useRef<THREE.Group>(null!);
  const narrow = size.width < 820;
  const count = narrow ? 16 : 30;
  // a phone's camera sits close to the copy and the top bar: keep the voxels further back there
  const back = narrow ? 1.3 : 0;
  const bits = useMemo(() => {
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 30 }, () => {
      const z = -3 + r() * 5.2;
      const near = (z + 3) / 5.2; // 0 far .. 1 near
      return {
        x: (r() - 0.5) * 1.9, y: (r() - 0.5) * 1.6, z,
        size: 0.04 + r() * 0.07 + near * 0.08, spin: 0.25 + r() * 0.8, phase: r() * 6.28,
        off: new THREE.Vector3(), vel: new THREE.Vector3(),
      };
    });
  }, []);
  const cube = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.1), []);
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#f3f1ea", metalness: 0.55, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.8,
    iridescenceThicknessRange: [200, 900], clearcoat: 1, emissive: new THREE.Color(accent), emissiveIntensity: 0.45,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const tint = useMemo(() => new THREE.Color(), []);
  const seen = useRef({ beat: beat.at, arrived: false });

  useFrame((st, dt) => {
    const mode = motionMode();
    const off = mode === "off", full = mode === "full";
    const clock = now();
    // Stopped: no drift, no spin, no parallax; each voxel rests at its own angle.
    const t = off ? 0 : st.clock.elapsedTime * (full ? 1 : 0.5);
    const auto = restless(clock);
    const px = full ? pointer.x * (1 - auto) : 0, py = full ? pointer.y * (1 - auto) : 0;
    (mat.emissive as THREE.Color).lerp(tint.set(accent), 1 - Math.exp(-dt * 2));

    // a burst: on a new beat, and once as the camera arrives
    let burst = 0;
    if (beat.at !== seen.current.beat) { seen.current.beat = beat.at; burst = 1; }
    if (!seen.current.arrived && clock > arrivedAt() + 0.15) { seen.current.arrived = true; burst = 1.6; }
    if (!full) burst = 0;
    const step = Math.min(dt, 1 / 30);

    group.current.children.forEach((m, i) => {
      const g = bits[i];
      const depth = (g.z + 3) / 5.2;
      const hx = g.x * viewport.width, hy = g.y * viewport.height;
      if (burst) {
        // away from the hero card, harder for the near ones
        const dx = hx - viewport.width * 0.2, dy = hy;
        const len = Math.hypot(dx, dy) || 1;
        const kick = burst * (2.2 + depth * 3.5);
        g.vel.x += (dx / len) * kick; g.vel.y += (dy / len) * kick; g.vel.z += kick * 0.8;
      }
      // a loose spring pulls each one home, with a little overshoot
      g.vel.addScaledVector(g.off, -14 * step).multiplyScalar(Math.exp(-3.2 * step));
      g.off.addScaledVector(g.vel, step);
      if (off) { g.off.set(0, 0, 0); g.vel.set(0, 0, 0); }
      m.position.set(
        hx + Math.sin(t * 0.2 + g.phase) * 0.18 + px * 0.5 * depth + g.off.x,
        hy + Math.sin(t * 0.4 + g.phase) * (full ? 0.26 : 0.12) - py * 0.35 * depth + g.off.y,
        g.z - back + g.off.z,
      );
      const whirl = g.vel.length() * 0.05;
      m.rotation.set(off ? g.phase * 0.6 : t * g.spin * 0.6 + whirl, off ? g.phase : t * g.spin + whirl, 0);
    });
  });

  return (
    <group ref={group}>
      {bits.slice(0, count).map((g, i) => <mesh key={i} geometry={cube} material={mat} scale={g.size} />)}
    </group>
  );
}
