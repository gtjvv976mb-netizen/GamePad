import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { CONTROLLER_PATH, DPAD_PATH } from "../ui/Logo";
import { pointer } from "./pointer";

/** The logo, extruded: a ceramic-white controller with a real cut gem where the face buttons go. */
export function Logo3D({ position = [0, 0, 0] as [number, number, number], scale = 1 }) {
  const group = useRef<THREE.Group>(null!);
  const gem = useRef<THREE.Mesh>(null!);

  const geo = useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${CONTROLLER_PATH}"/><path d="${DPAD_PATH}"/></svg>`;
    const [body, dpad] = new SVGLoader().parse(svg).paths;
    const shape = SVGLoader.createShapes(body)[0];
    shape.holes.push(...SVGLoader.createShapes(dpad).map(s => new THREE.Path(s.getPoints())));
    // round hole where the gem sits
    const hole = new THREE.Path(); hole.absarc(46, 19.5, 7.6, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.1, bevelSegments: 6, curveSegments: 32 });
    g.center();
    // SVG y points down; mirroring flips triangle winding, so swap two corners of each face back
    g.scale(0.05, -0.05, 0.05);
    const geo = g.index ? g.toNonIndexed() : g;
    for (const name of ["position", "normal", "uv"] as const) {
      const a = geo.getAttribute(name);
      if (!a) continue;
      for (let i = 0; i < a.count; i += 3) {
        for (let k = 0; k < a.itemSize; k++) {
          const t = a.array[(i + 1) * a.itemSize + k];
          (a.array as Float32Array)[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
          (a.array as Float32Array)[(i + 2) * a.itemSize + k] = t;
        }
      }
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    const g = group.current;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, Math.sin(t * 0.4) * 0.35 + pointer.x * 0.4, 3, dt);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0.15 + pointer.y * 0.25, 3, dt);
    g.position.y = position[1] + Math.sin(t * 0.9) * 0.06;
    gem.current.rotation.y = t * 0.9;
  });

  return (
    <group ref={group} position={position} scale={scale}>
      <mesh geometry={geo}>
        <meshPhysicalMaterial color="#f3f1ea" roughness={0.32} metalness={0.05} clearcoat={1} clearcoatRoughness={0.2} sheen={0.4} />
      </mesh>
      <mesh ref={gem} position={[0.7, 0.0, 0.05]} scale={[0.34, 0.42, 0.34]}>
        <octahedronGeometry args={[1, 0]} />
        <meshPhysicalMaterial color="#d9c4ff" metalness={0.2} roughness={0.05} iridescence={1} iridescenceIOR={1.8}
          iridescenceThicknessRange={[200, 900]} clearcoat={1} flatShading emissive="#6a3fd6" emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}
