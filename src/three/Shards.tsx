import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { pointer } from "./pointer";
import { reducedMotion } from "../lib/motion";

/** Loose voxels, pixels off the mark, tumbling at different depths; nearer ones move more with the pointer. */
export function Shards({ accent }: { accent: string }) {
  const { viewport } = useThree();
  const group = useRef<THREE.Group>(null!);
  const bits = useMemo(() => {
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 11 }, () => ({
      x: (r() - 0.5) * 1.9, y: (r() - 0.5) * 1.6, z: -2.5 + r() * 3.4,
      size: 0.06 + r() * 0.12, spin: 0.2 + r() * 0.6, phase: r() * 6.28,
    }));
  }, []);
  const cube = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.1), []);
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#f3f1ea", metalness: 0.3, roughness: 0.08, iridescence: 1, iridescenceIOR: 1.7,
    iridescenceThicknessRange: [200, 900], clearcoat: 1, emissive: new THREE.Color(accent), emissiveIntensity: 0.1,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((st, dt) => {
    // Reduce motion: no drift, no spin, no parallax; each voxel rests at its own angle.
    const still = reducedMotion();
    const t = still ? 0 : st.clock.elapsedTime;
    const px = still ? 0 : pointer.x, py = still ? 0 : pointer.y;
    (mat.emissive as THREE.Color).lerp(new THREE.Color(accent), 1 - Math.exp(-dt * 2));
    group.current.children.forEach((m, i) => {
      const g = bits[i];
      const depth = (g.z + 2.5) / 3.4; // 0 far .. 1 near
      m.position.set(
        g.x * viewport.width + px * 0.35 * depth,
        g.y * viewport.height + Math.sin(t * 0.4 + g.phase) * 0.12 - py * 0.25 * depth,
        g.z,
      );
      m.rotation.set(still ? g.phase * 0.6 : t * g.spin * 0.6, still ? g.phase : t * g.spin, 0);
    });
  });

  return (
    <group ref={group}>
      {bits.map((g, i) => <mesh key={i} geometry={cube} material={mat} scale={g.size} />)}
    </group>
  );
}
