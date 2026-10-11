// The offline build injects image data before the runtime. Node model tests need
// no image loader, and a downloaded game never requests an asset from a server.
const atlas = (globalThis as typeof globalThis & { __GAMEPAD_ART__?: Record<string, string> }).__GAMEPAD_ART__ ?? {};
// The illustrated silhouettes extend beyond nominal grid rows. Explicit source
// bounds prevent a neighboring sprite's feet or mast appearing in another actor.
type Bounds = readonly [number, number, number, number];
const groups: [string | undefined, string, Bounds[]][] = [
  [atlas.fantasy, "knight archivist gardener boat sentinel wisp thornbeast pirate ember scroll wood flower fountain portal beacon chest", [
    [35, 35, 245, 295], [355, 26, 252, 307], [646, 44, 283, 289], [949, 18, 297, 323],
    [17, 335, 295, 316], [347, 349, 259, 316], [643, 333, 284, 331], [948, 350, 297, 320],
    [61, 655, 189, 280], [329, 681, 278, 239], [643, 675, 279, 230], [979, 665, 267, 276],
    [18, 935, 296, 296], [333, 919, 284, 314], [644, 907, 288, 326], [979, 951, 265, 283],
  ]],
  [atlas.space, "racer tug courier diver drone turret jelly shark cargo parcel relic oxygen asteroid gate platform terminal", [
    [23, 55, 285, 239], [326, 44, 307, 268], [638, 54, 284, 255], [1002, 22, 194, 295],
    [26, 334, 285, 254], [315, 360, 315, 258], [641, 318, 277, 310], [958, 350, 284, 253],
    [24, 633, 289, 270], [340, 650, 266, 246], [670, 634, 237, 269], [1039, 624, 139, 280],
    [30, 925, 284, 284], [327, 905, 291, 308], [628, 960, 316, 240], [1005, 901, 186, 324],
  ]],
  [atlas.strategy, "bartender chef ranger guardian monster wolf merchant scholar herb berry grain spice potion card crystal mirror", [
    [26, 6, 278, 307], [315, 0, 320, 312], [635, 14, 293, 307], [948, 0, 300, 319],
    [12, 321, 294, 311], [312, 314, 321, 323], [628, 324, 315, 313], [973, 327, 275, 311],
    [15, 641, 296, 292], [320, 638, 290, 294], [628, 640, 312, 293], [957, 637, 281, 305],
    [25, 933, 266, 307], [312, 932, 307, 309], [661, 933, 233, 302], [977, 945, 264, 296],
  ]],
] as const;
const sprites = new Map<string, { image?: HTMLImageElement; bounds: Bounds }>();
for (const [url, names, bounds] of groups) {
  const image = typeof Image === "undefined" || !url ? undefined : new Image();
  if (image && url) image.src = url;
  names.split(" ").forEach((name, index) => sprites.set(name, { image, bounds: bounds[index] }));
}

/** Original transparent art with preserved silhouette proportions. */
export function drawSprite(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, size = 48, options: { angle?: number; flip?: boolean; alpha?: number } = {}) {
  const sprite = sprites.get(id);
  if (!sprite) return;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(options.angle ?? 0);
  ctx.scale(options.flip ? -1 : 1, 1); ctx.globalAlpha *= options.alpha ?? 1;
  const image = sprite.image;
  if (image?.complete && image.naturalWidth > 0) {
    const [x, y, w, h] = sprite.bounds;
    const scale = size / Math.max(w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, x, y, w, h, -w * scale / 2, -h * scale / 2, w * scale, h * scale);
  } else {
    ctx.fillStyle = "#dbc191"; ctx.beginPath(); ctx.arc(0, -size * .16, size * .15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8099bc"; ctx.fillRect(-size * .18, 0, size * .36, size * .3);
  }
  ctx.restore();
}

export function artReady() { return [...sprites.values()].every(s => !s.image || s.image.complete && s.image.naturalWidth > 0); }
