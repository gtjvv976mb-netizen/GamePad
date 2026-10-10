import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { reducedMotion, subscribeReducedMotion } from "../lib/motion";

/** Holographic foil, the only brand color: the seal on the mark, card backs and the 3D studio lights. */
export const FOIL = ["#8ef6ff", "#c9a7ff", "#ff9bd6", "#ffe08a"] as const;

/**
 * The Pixel mark: 16 x 10 pixels, viewBox 0 0 16 10. The D-pad and the two empty button cells are true holes
 * (evenodd), so the body takes var(--text) on any background.
 */
export const MARK_BODY =
  "M0 4H1V1H2V0H14V1H15V4H16V9H15V10H11V8H10V7H6V8H5V10H1V9H0ZM4 3V4H5V5H6V4H7V3H6V2H5V3ZM9 3V4H10V5H11V4H12V3H11V2H10V3ZM10 3H11V4H10Z";
/** The four button cells around the hub (10, 3), clockwise from the top. The foil pair sits on two opposite ones. */
export const MARK_RING: [number, number][] = [[10, 2], [11, 3], [10, 4], [9, 3]];
/**
 * Each foil cell is one half of the foil, run from its lower left to its upper right corner:
 * A (warm) lilac, pink, gold; B (cool) cyan, lilac, pink. Below 8 px per pixel a cell takes one saturated stop.
 */
export const FOIL_CELLS = [
  { flat: "#ff9bd6", stops: [[0, "#c9a7ff"], [0.45, "#ff9bd6"], [1, "#ffe08a"]] },
  { flat: "#c9a7ff", stops: [[0, "#8ef6ff"], [0.55, "#c9a7ff"], [1, "#ff9bd6"]] },
] as const;
const SEAL_BODY = "M0 1H1V0H4V1H5V4H4V5H1V4H0ZM1 2V3H2V4H3V3H4V2H3V1H2V2ZM2 2H3V3H2Z";
const SEAL_RING: [number, number][] = [[2, 1], [3, 2], [2, 3], [1, 2]];

const useStill = () => useSyncExternalStore(subscribeReducedMotion, reducedMotion, () => false);

// device pixels per CSS px, read live so the mark re-snaps on zoom or on a move to another screen
const dpr = () => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
const subscribeDpr = (cb: () => void) => {
  let mq: MediaQueryList | null = null;
  const on = () => { watch(); cb(); };
  const watch = () => {
    mq?.removeEventListener("change", on);
    mq = matchMedia(`(resolution: ${dpr()}dppx)`);
    mq.addEventListener("change", on);
  };
  watch();
  return () => mq?.removeEventListener("change", on);
};
const useDpr = () => useSyncExternalStore(subscribeDpr, dpr, () => 1);

/** CSS px per pixel that covers whole device pixels: 3 at the 30 px rail on a 1x or 2x screen, 3.33 at 1.5x (4.5 rounds up). */
const snap = (cssPerPixel: number, d: number) => Math.max(1, Math.round(cssPerPixel * d)) / d;

/**
 * Keeps an svg's top left corner on the device pixel grid: layout can put it on a fraction (a centered card,
 * a vw offset), so it is nudged by under one device pixel. It measures again after every render and on a
 * resize, and after mounting or a render it follows the svg for a few frames until it holds still, so the
 * nudge lands where a sliding tab view, the springing wallet sheet or a pressed button comes to rest.
 */
const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
function useOnGrid(d: number) {
  const ref = useRef<SVGSVGElement>(null);
  const settle = useRef(() => {});
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.translate = ""; // a nudge left from the previous screen scale is not layout
    let x = 0, y = 0, live = true, raf = 0, lastX = NaN, lastY = NaN, still = 0, frames = 0;
    const fit = () => {
      if (!live) return;
      const r = el.getBoundingClientRect();
      const bx = r.left - x, by = r.top - y; // where layout put it, before the nudge
      const nx = Math.round(bx * d) / d - bx, ny = Math.round(by * d) / d - by;
      if (!near(nx, x) || !near(ny, y)) { x = nx; y = ny; el.style.translate = `${x}px ${y}px`; }
      still = near(bx, lastX) && near(by, lastY) ? still + 1 : 0;
      lastX = bx; lastY = by;
    };
    const step = () => {
      fit();
      raf = live && still < 6 && ++frames < 90 ? requestAnimationFrame(step) : 0;
    };
    settle.current = () => {
      still = 0; frames = 0;
      if (raf) fit(); else step();
    };
    settle.current();
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    addEventListener("resize", fit);
    document.fonts?.ready.then(fit);
    return () => {
      live = false; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener("resize", fit);
      el.style.translate = "";
    };
  }, [d]);
  // text, a list or a title above it may have moved it without resizing its parent
  useLayoutEffect(() => settle.current());
  return ref;
}

/** The two foil cells on a ring of four, `turn` quarter turns clockwise from the rest pose (top and bottom). */
const Cells = ({ ring, turn, holo, id }: { ring: [number, number][]; turn: number; holo: boolean; id: string }) => (
  <>
    {holo && (
      <defs>
        {FOIL_CELLS.map((f, k) => (
          <linearGradient key={k} id={`${id}${k}`} x1="0" y1="1" x2="1" y2="0">
            {f.stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
          </linearGradient>
        ))}
      </defs>
    )}
    {FOIL_CELLS.map((f, k) => {
      const [x, y] = ring[(turn + 2 * k) % 4];
      return <rect key={k} x={x} y={y} width="1" height="1" fill={holo ? `url(#${id}${k})` : f.flat} />;
    })}
  </>
);

/**
 * GamePad mark: a controller cut from two plus signs. The left plus is the D-pad; the right plus keeps its hub
 * and two of its arms hold foil, the seal on the copy you own. With `turn` the seal turns a quarter, in one step.
 * `size` is the height in CSS px; it is snapped so every pixel covers whole device pixels.
 */
export function Logo({ size = 30, turn = 0, className = "" }: { size?: number; turn?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const d = useDpr();
  const p = snap(size / 10, d);
  const ref = useOnGrid(d);
  return (
    <span className={`logo ${className}`}>
      <svg ref={ref} width={16 * p} height={10 * p} viewBox="0 0 16 10" shapeRendering="crispEdges" aria-hidden="true">
        <path d={MARK_BODY} fill="var(--text)" fillRule="evenodd" />
        <Cells ring={MARK_RING} turn={turn} holo={p >= 8} id={`gp${id}`} />
      </svg>
    </span>
  );
}

/**
 * The seal alone, the button cluster lifted out as a 5 x 5 token: the busy indicator when `spin` is set,
 * turning a quarter every 120 ms, and still under reduced motion.
 */
export function Seal({ size = 15, spin = false, turn = 0 }: { size?: number; spin?: boolean; turn?: number }) {
  const id = useId().replace(/:/g, "");
  const still = useStill();
  const [k, setK] = useState(turn);
  useEffect(() => {
    setK(turn);
    if (!spin || still) return;
    const timer = setInterval(() => setK(n => n + 1), 120);
    return () => clearInterval(timer);
  }, [spin, still, turn]);
  const d = useDpr();
  const p = snap(size / 5, d);
  const ref = useOnGrid(d);
  return (
    <svg ref={ref} className="seal" width={5 * p} height={5 * p} viewBox="0 0 5 5" shapeRendering="crispEdges" aria-hidden="true">
      <path d={SEAL_BODY} fill="var(--text)" fillRule="evenodd" />
      <Cells ring={SEAL_RING} turn={k} holo={p >= 8} id={`seal${id}`} />
    </svg>
  );
}

/**
 * The A face button on the main action: one foil pixel of the mark (the seal's warm cell), square and sharp
 * like every cell of it, with the letter on it, so the button you press is the seal you get. The cell is an
 * svg kept on the device pixel grid, as the mark is; a CSS background would blur an edge at 1.25x or 1.5x.
 */
export function AGlyph() {
  const id = `a${useId().replace(/:/g, "")}`;
  const ref = useOnGrid(useDpr());
  return (
    <span className="glyph chip">
      <svg ref={ref} viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            {FOIL_CELLS[0].stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
          </linearGradient>
        </defs>
        <rect className="cell" width="32" height="32" fill={`url(#${id})`} />
        {/* a dark 2 px frame, shown while the button itself fills with foil, so the cell still reads as a pixel */}
        <path className="frame" d="M0 0H32V32H0ZM2 2V30H30V2Z" fill="var(--bg)" fillRule="evenodd" />
      </svg>
      A
    </span>
  );
}
