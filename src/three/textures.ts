import * as THREE from "three";
import { FOIL_CELLS, MARK_BODY, MARK_RING } from "../ui/Logo";
import { coverUrl, type Game } from "../data/games";
import { keepPlaying } from "../lib/media";
import { saveData } from "../lib/show";

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

const prep = (t: THREE.Texture) => {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/** Cover texture for a catalog game: the looping clip when it has one, else the still. */
export function coverTexture(game: Pick<Game, "slug" | "loop">): THREE.Texture {
  const key = game.slug + (game.loop ? ":v" : "");
  const hit = cache.get(key);
  if (hit) return hit;
  let tex: THREE.Texture;
  if (game.loop && !saveData()) {
    const v = document.createElement("video");
    const webm = v.canPlayType('video/webm; codecs="vp9"');
    v.src = `./loops/${game.slug}.${webm ? "webm" : "mp4"}`;
    v.muted = true; v.loop = true; v.playsInline = true; v.crossOrigin = "anonymous"; v.preload = "auto";
    v.poster = coverUrl(game.slug);
    // plays while motion is on; a phone that blocks autoplay starts it on the first tap
    keepPlaying(v);
    tex = prep(new THREE.VideoTexture(v));
  } else {
    tex = prep(loader.load(coverUrl(game.slug)));
  }
  cache.set(key, tex);
  return tex;
}

/** Texture from an uploaded image (data URL) for a studio's own game. */
export function imageTexture(src: string): THREE.Texture {
  const hit = cache.get(src);
  if (hit) return hit;
  const t = prep(loader.load(src));
  cache.set(src, t);
  return t;
}

/** Generated art for games with no cover yet: the palette as a lit gradient plus the title. */
export function titleTexture(title: string, palette: [string, string, string]): THREE.Texture {
  const key = `title:${title}:${palette.join()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 720; c.height = 540;
  const x = c.getContext("2d")!;
  const gr = x.createRadialGradient(500, 160, 20, 360, 270, 520);
  gr.addColorStop(0, palette[2]); gr.addColorStop(0.45, palette[1]); gr.addColorStop(1, palette[0]);
  x.fillStyle = gr; x.fillRect(0, 0, 720, 540);
  x.fillStyle = "rgba(255,255,255,.92)";
  x.font = "800 64px 'Big Shoulders Display Variable', Impact, sans-serif";
  const words = (title || "Untitled").toUpperCase().split(" ");
  let line = "", y = 420; const lines: string[] = [];
  for (const w of words) { if (x.measureText(line + w).width > 600) { lines.push(line); line = ""; } line += w + " "; }
  lines.push(line);
  lines.slice(-2).reverse().forEach(l => { x.fillText(l.trim(), 48, y); y -= 66; });
  const t = prep(new THREE.CanvasTexture(c));
  cache.set(key, t);
  return t;
}

/** Back of every license card: the pixel mark, centered on graphite, the seal in foil. */
let back: THREE.Texture | null = null;
export function backTexture(): THREE.Texture {
  if (back) return back;
  const c = document.createElement("canvas");
  c.width = 720; c.height = 540;
  const x = c.getContext("2d")!;
  x.fillStyle = "#0e0d0b"; x.fillRect(0, 0, 720, 540);
  x.strokeStyle = "rgba(243,241,234,.08)"; x.lineWidth = 2;
  for (let i = -540; i < 720; i += 28) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 540, 540); x.stroke(); }
  // 24 texels per pixel at a whole-texel offset, so every cell edge is sharp: 384 x 240, centered over the label
  const CELL = 24, X0 = 360 - 8 * CELL, Y0 = 168;
  x.save(); x.translate(X0, Y0); x.scale(CELL, CELL);
  // the ground shows through the D-pad and the empty button cells, as on the flat mark
  x.fillStyle = "#f3f1ea"; x.fill(new Path2D(MARK_BODY), "evenodd");
  FOIL_CELLS.forEach((f, k) => {
    const [cx, cy] = MARK_RING[2 * k];
    const g = x.createLinearGradient(cx, cy + 1, cx + 1, cy); // lower left to upper right
    f.stops.forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g; x.fillRect(cx, cy, 1, 1);
  });
  x.restore();
  x.fillStyle = "rgba(243,241,234,.7)"; x.textAlign = "center";
  x.font = "600 22px 'JetBrains Mono Variable', monospace";
  x.fillText("GAMEPAD · LICENSE", 360, 450);
  back = prep(new THREE.CanvasTexture(c));
  return back;
}
