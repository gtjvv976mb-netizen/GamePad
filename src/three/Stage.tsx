import { Suspense, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { Backdrop, calm } from "./Backdrop";
import { Card, CARD_W } from "./Card";
import { Logo3D } from "./Logo3D";
import { Shards } from "./Shards";
import { FOIL, Logo } from "../ui/Logo";
import { reducedMotion } from "../lib/motion";

// four foil-colored studio lights at the corners, so the gem and card edges pick up every hue
const FOIL_AT: [number, number, number][] = [[-4, 2.5, 3], [4, 2.5, 3], [4, -2.5, 3], [-4, -2.5, 3]];

export type Scene =
  | { kind: "card"; texture: THREE.Texture; src?: string; key: string; palette: [string, string, string]; side: "right" | "left" | "center"; compact?: boolean }
  | { kind: "hand"; textures: { key: string; texture: THREE.Texture; src?: string }[]; selected: number; palette: [string, string, string] }
  | { kind: "logo"; palette: [string, string, string] };

/** One persistent 3D layer behind every tab; each tab re-choreographs it. */
const webgl = () => {
  if (new URLSearchParams(location.search).has("no3d")) return false;
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
};

export function Stage({ scene }: { scene: Scene }) {
  const [has3d] = useState(webgl);
  if (!has3d) return <FlatStage scene={scene} />;
  return <Stage3D scene={scene} />;
}

/** No WebGL (or ?no3d): the same composition with CSS, a tilted cover (or the mark) over the palette glow. */
function FlatStage({ scene }: { scene: Scene }) {
  const [a, b] = scene.palette;
  const c = calm(scene.palette[2]);
  const side = scene.kind === "card" ? scene.side : scene.kind === "logo" ? "right" : "center";
  // Studio's generated title card is a canvas: show it as an image, so the flat stage keeps its focal object
  const src = useMemo(() => scene.kind === "card"
    ? scene.src ?? (scene.texture.image instanceof HTMLCanvasElement ? scene.texture.image.toDataURL("image/jpeg", 0.86) : undefined)
    : scene.kind === "hand" ? scene.textures[scene.selected]?.src : undefined, [scene]);
  return (
    <div className={`stage flat ${side} ${scene.kind === "card" && scene.compact ? "compact" : ""}`} aria-hidden="true" style={{ background: `radial-gradient(60% 70% at ${side === "left" ? "30%" : side === "center" ? "50%" : "70%"} 45%, ${c}55, ${b}66 45%, ${a} 80%), ${a}` }}>
      {src && <img src={src} alt="" />}
      {scene.kind === "logo" && <div className="flat-logo"><Logo size={40} /></div>}
    </div>
  );
}

function Stage3D({ scene }: { scene: Scene }) {
  // start sharp, step resolution down on slower GPUs instead of dropping frames
  const [dpr, setDpr] = useState(Math.min(1.75, window.devicePixelRatio || 1));
  return (
    <div className="stage" aria-hidden="true">
      <Canvas dpr={dpr} camera={{ position: [0, 0, 6.2], fov: 34 }} gl={{ antialias: true, powerPreference: "high-performance" }}
        >
        <PerformanceMonitor onDecline={() => setDpr(d => Math.max(0.75, d - 0.5))} onIncline={() => setDpr(d => Math.min(1.75, window.devicePixelRatio || 1, d + 0.25))} flipflops={3} />
        <Suspense fallback={null}>
          <Contents scene={scene} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function Contents({ scene }: { scene: Scene }) {
  const { viewport, size } = useThree();
  const narrow = size.width < 820;
  // the rail takes 92px on the left, so "centered" means centered over the content, not the window
  const railX = narrow ? 0 : 46 * viewport.width / size.width;
  const accent = useMemo(() => calm(scene.palette[2]), [scene.palette]);
  const pal = useMemo(() => [scene.palette[0], scene.palette[1], accent] as [string, string, string], [scene.palette, accent]);
  // Where the hero object sits, in world units, and the matching backdrop focus in UV.
  const layout = useMemo(() => {
    if (narrow) {
      // phones: the card sits above the copy; tabs with long lists shrink it to make room
      const compact = scene.kind === "card" && scene.compact;
      return { x: 0, y: viewport.height * (compact ? 0.3 : 0.15), s: Math.min(1, (viewport.width * 0.78) / CARD_W) * (compact ? 0.5 : 1), rot: [0.08, 0, 0] as [number, number, number] };
    }
    const side = scene.kind === "card" ? scene.side : "right";
    const x = side === "right" ? viewport.width * 0.225 : side === "left" ? -viewport.width * 0.2 : 0;
    // rest the card turned slightly toward the copy so its edge and depth read
    const ry = side === "right" ? -0.32 : side === "left" ? 0.3 : 0;
    return { x, y: viewport.height * 0.07, s: Math.min(1.3, (viewport.height * 0.45) / 1.8), rot: [0.05, ry, side === "right" ? 0.02 : -0.02] as [number, number, number] };
  }, [narrow, viewport.width, viewport.height, scene]);
  const focus: [number, number] = [0.5 + layout.x / viewport.width, 0.5 + layout.y / viewport.height];

  return (
    <>
      <Backdrop palette={pal} focus={focus} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      {/* procedural studio lighting for reflections; no HDR download */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 3]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={2} color={accent} position={[-5, 0, 2]} scale={[2, 6, 1]} rotation-y={Math.PI / 2} />
        {FOIL.map((c, i) => <Lightformer key={c} form="rect" intensity={1.6} color={c} position={FOIL_AT[i]} scale={[1.2, 3, 1]} />)}
      </Environment>

      {scene.kind === "card" && (
        <Card texture={scene.texture} flipKey={scene.key} position={[layout.x, layout.y, 0]} scale={layout.s} baseRotation={layout.rot} />
      )}

      {scene.kind === "hand" && scene.textures.map((c, i) => {
        // fan the owned licenses like a hand of cards; the selected one lifts toward you
        const off = i - scene.selected;
        const base = layout.s * (narrow ? 1 : 0.78);
        const sel = off === 0;
        return (
          <Card key={c.key} texture={c.texture} alive={sel}
            position={[railX + off * CARD_W * base * 0.42 + Math.sign(off) * CARD_W * base * 0.3, (narrow ? 0 : viewport.height * 0.03) - Math.abs(off) * 0.07, sel ? 0.5 : -Math.abs(off) * 0.12]}
            baseRotation={[0, -off * 0.18, -off * 0.05]} scale={base * (sel ? 1 : 0.8)} dim={sel ? 1 : 0.5} />
        );
      })}

      {scene.kind === "logo" && <Logo3D position={[layout.x, layout.y, 0]} scale={layout.s * (narrow ? 0.8 : 0.72)} />}

      <Shards accent={accent} />
      {!reducedMotion() && <Sparkles count={narrow ? 40 : 80} scale={[viewport.width, viewport.height, 3]} size={2.2} speed={0.25} opacity={0.5} color={accent} />}
    </>
  );
}
