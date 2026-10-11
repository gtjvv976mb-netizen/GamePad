import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { pointer } from "./pointer";
import { reducedMotion } from "../lib/motion";
import { FOIL_CELLS, MARK_RING } from "../ui/Logo";

/**
 * The Pixel mark as voxels, cell for cell the same 16 x 10 grid as the flat logo.
 * '#' body, '+' D-pad cut, 'p' foil A (warm), 'l' foil B (cool), 'o' empty button socket.
 */
const PIXEL_GRID = [
  "..############..",
  ".##############.",
  ".####+####p####.",
  ".###+++##o#o###.",
  "#####+####l#####",
  "################",
  "################",
  "######....######",
  "#####......#####",
  ".####......####.",
];
const GW = 16, GH = 10;
const PX = 0.2;      // world units per pixel: 16 x 10 = 3.2 x 2 world units
const LAYERS = 2;    // two voxels deep (0.4)

// timeline, seconds from mount
const LAND = 1.25;               // the foil pair drops in once the body has stacked up
const FIRST_HOP = 3.2, EVERY = 6, HOP = 0.55;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const outCubic = (u: number) => 1 - (1 - u) ** 3;
const outBack = (u: number) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
const inOut = (u: number) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
const cell = (x: number, y: number) => new THREE.Vector3(x + 0.5 - GW / 2, GH / 2 - (y + 0.5), 0);
// the four button cells around the hub, as on the flat mark (clockwise from the top): the foil pair hops one step per trade
const RING_POS = MARK_RING.map(([x, y]) => cell(x, y));

// each foil voxel is half of the foil, the same stops as the flat mark's two cells
function foilTexture(stops: readonly (readonly [number, string])[]) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const lg = g.createLinearGradient(0, 64, 64, 0); // cool at the lower left, warm at the upper right
  for (const [o, col] of stops) lg.addColorStop(o, col);
  g.fillStyle = lg;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Where foil voxel k sits at time t: its ring cell, a hop in progress and the hop's progress, written into `out`. */
const pose = { from: 0, to: 0, u: 0 };
function foilPose(k: number, t: number, out: typeof pose) {
  const start = k === 0 ? 0 : 2; // A on top, B at the bottom
  if (t < FIRST_HOP) { out.from = out.to = start; out.u = 0; return out; }
  const n = Math.floor((t - FIRST_HOP) / EVERY);
  out.from = (start + n) % 4;
  out.to = (start + n + 1) % 4;
  out.u = clamp01((t - FIRST_HOP - n * EVERY) / HOP);
  return out;
}

/**
 * The seal's two glow lights live as long as the canvas (Stage mounts LogoGlow once, dark), and Logo3D only
 * moves and lights them. Mounting them with the mark would change the scene's light count on every visit to
 * Profile, and with it the shader of every lit material, which then recompiles.
 */
const glowLights: (THREE.PointLight | null)[] = [];
export function LogoGlow() {
  return (
    <>
      {FOIL_CELLS.map((f, k) => (
        <pointLight key={k} ref={el => { glowLights[k] = el; }} color={f.flat} intensity={0} decay={2} />
      ))}
    </>
  );
}

export function Logo3D({ position = [0, 0, 0] as [number, number, number], scale = 1 }) {
  const group = useRef<THREE.Group>(null!);
  const body = useRef<THREE.InstancedMesh>(null!);
  const foil = useRef<THREE.Mesh[]>([]);
  const born = useRef<number | null>(null);
  const built = useRef(false);

  const { voxels, cube, chip, bodyMat, foilMats } = useMemo(() => {
    const voxels: { p: THREE.Vector3; delay: number }[] = [];
    PIXEL_GRID.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== "#") return;
      for (let z = 0; z < LAYERS; z++) {
        const p = cell(x, y); p.z = z - (LAYERS - 1) / 2;
        // stack up from the grips to the top edge, centre out: built like a pixel sprite
        voxels.push({ p, delay: (GH - 1 - y) * 0.07 + Math.abs(x + 0.5 - GW / 2) * 0.012 + (LAYERS - 1 - z) * 0.03 });
      }
    }));
    const cube = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
    const chip = new RoundedBoxGeometry(1, 1, 1, 3, 0.12);
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: "#f3f1ea", roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.2, sheen: 0.4 });
    // the foil glows from inside and skips tone mapping, so it shows the brand stops at full strength
    // instead of washing out to pale pink under the studio lights; clearcoat and iridescence add the glints
    const foilMats = FOIL_CELLS.map(f => {
      const map = foilTexture(f.stops);
      return new THREE.MeshPhysicalMaterial({
        color: "#3a3a3a", map, emissiveMap: map, emissive: "#ffffff", emissiveIntensity: 0.62, metalness: 0, roughness: 0.3,
        iridescence: 0.5, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 700], clearcoat: 1, clearcoatRoughness: 0.06, toneMapped: false,
      });
    });
    return { voxels, cube, chip, bodyMat, foilMats };
  }, []);
  // the Profile tab mounts this each visit, so free the GPU copies when it leaves
  useEffect(() => () => {
    cube.dispose(); chip.dispose(); bodyMat.dispose();
    foilMats.forEach(mat => { mat.map?.dispose(); mat.dispose(); });
    glowLights.forEach(l => { if (l) l.intensity = 0; });
  }, [cube, chip, bodyMat, foilMats]);

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);

  useFrame((s, dt) => {
    const still = reducedMotion();
    if (born.current === null) born.current = s.clock.elapsedTime;
    // Reduce motion: no build, no hop, no pulse; the mark simply rests, foil on top and bottom.
    const t = still ? 2.5 : s.clock.elapsedTime - born.current;

    // body: voxels drop into place, grips first
    if (!built.current) {
      for (let i = 0; i < voxels.length; i++) {
        const { p, delay } = voxels[i];
        const u = clamp01((t - delay) / 0.38);
        const k = 1 - outCubic(u);
        v.set(p.x, p.y + k * 1.4, p.z + k * 4);
        sc.setScalar(Math.max(0.001, outBack(u)));
        body.current.setMatrixAt(i, m.compose(v, q.identity(), sc));
      }
      body.current.instanceMatrix.needsUpdate = true;
      if (t > 1.3) built.current = true;
    }

    // foil pair: drops in last, then trades places a quarter turn around the hub every few seconds
    for (let k = 0; k < foil.current.length; k++) {
      const mesh = foil.current[k];
      const { from, to, u } = foilPose(k, t, pose);
      const e = inOut(u);
      mesh.position.lerpVectors(RING_POS[from], RING_POS[to], e);
      const land = clamp01((t - LAND) / 0.4);
      const drop = 1 - outCubic(land);
      mesh.position.z = 0.85 + Math.sin(Math.PI * e) * 1.3 + drop * 5;
      mesh.rotation.set(0, drop * Math.PI, -e * Math.PI / 2);
      // squash on touchdown, after the drop and after each hop
      const sinceHop = u >= 1 ? t - (FIRST_HOP + Math.floor((t - FIRST_HOP) / EVERY) * EVERY + HOP) : 9;
      const sq = Math.max(t - LAND - 0.4 >= 0 ? Math.exp(-(t - LAND - 0.4) * 9) : 0, sinceHop >= 0 ? Math.exp(-sinceHop * 9) : 0) * 0.22;
      mesh.scale.set(0.96 * (1 + sq), 0.96 * (1 + sq), 1.02 * (1 - sq)).multiplyScalar(Math.max(0.001, outBack(land)));
      // the seal glints when it lands and breathes while it rests
      const flash = Math.max(t > LAND + 0.3 ? Math.exp(-(t - LAND - 0.3) * 3) : 0, sinceHop >= 0 && sinceHop < 9 ? Math.exp(-sinceHop * 4) * 0.7 : 0);
      const pulse = still ? 0.62 : 0.56 + 0.1 * Math.sin(t * 2.4 + k * Math.PI);
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      mat.emissiveIntensity = pulse + flash * 0.5;
      const l = glowLights[k];
      if (l) { mesh.getWorldPosition(l.position); l.distance = 0.9 * scale; l.intensity = (0.12 + 0.25 * flash) * land * scale * scale; }
    }

    // a slow sway, and a tilt toward the pointer
    const g = group.current;
    if (still) { g.rotation.set(0.15, -0.25, 0); g.position.y = position[1]; return; }
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, Math.sin(t * 0.4) * 0.35 + pointer.x * 0.4, 3, dt);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0.15 + pointer.y * 0.25, 3, dt);
    g.position.y = position[1] + Math.sin(t * 0.9) * 0.06;
  });

  return (
    <group ref={group} position={position} scale={scale}>
      <group scale={PX}>
        <instancedMesh ref={body} args={[cube, bodyMat, voxels.length]} frustumCulled={false} />
        {foilMats.map((mat, k) => (
          <mesh key={k} ref={el => { if (el) foil.current[k] = el; }} geometry={chip} material={mat} scale={0.001} />
        ))}
      </group>
    </group>
  );
}
