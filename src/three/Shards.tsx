import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { pointer } from "./pointer";

/** Small cut gems (the logo's token) drifting at different depths; nearer ones move more with the pointer. */
export function Shards({ accent }: { accent: string }) {
  const { viewport } = useThree();
  const group = useRef<THREE.Group>(null!);
  const gems = useMemo(() => {
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 11 }, () => ({
      x: (r() - 0.5) * 1.9, y: (r() - 0.5) * 1.6, z: -2.5 + r() * 3.4,
      size: 0.05 + r() * 0.11, spin: 0.2 + r() * 0.6, phase: r() * 6.28,
    }));
  }, []);
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#e9ddff", metalness: 0.3, roughness: 0.08, iridescence: 1, iridescenceIOR: 1.7,
    iridescenceThicknessRange: [200, 900], clearcoat: 1, flatShading: true, emissive: new THREE.Color(accent), emissiveIntensity: 0.15,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    (mat.emissive as THREE.Color).lerp(new THREE.Color(accent), 1 - Math.exp(-dt * 2));
    group.current.children.forEach((m, i) => {
      const g = gems[i];
      const depth = (g.z + 2.5) / 3.4; // 0 far .. 1 near
      m.position.set(
        g.x * viewport.width + pointer.x * 0.35 * depth,
        g.y * viewport.height + Math.sin(t * 0.4 + g.phase) * 0.12 - pointer.y * 0.25 * depth,
        g.z,
      );
      m.rotation.set(t * g.spin * 0.6, t * g.spin, 0);
    });
  });

  return (
    <group ref={group}>
      {gems.map((g, i) => (
        <mesh key={i} material={mat} scale={[g.size, g.size * 1.3, g.size]}>
          <octahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
    </group>
  );
}
