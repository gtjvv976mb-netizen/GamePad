import { useId, useSyncExternalStore } from "react";
import { reducedMotion, subscribeReducedMotion } from "../lib/motion";

/** Controller outline, shared by the flat logo and the extruded 3D one (viewBox 0 0 64 40). */
export const CONTROLLER_PATH =
  "M20 5h24c8.2 0 13.6 4.4 15.6 11.6l3.1 11.9c1.6 6.2-3.3 11.4-8.9 9.6-3.6-1.2-5.7-5.6-9.4-7.1H19.6c-3.7 1.5-5.8 5.9-9.4 7.1-5.6 1.8-10.5-3.4-8.9-9.6l3.1-11.9C6.4 9.4 11.8 5 20 5z";
export const DPAD_PATH = "M14.5 13h5v4h4v5h-4v4h-5v-4h-4v-5h4z";
/** Holographic foil, the only brand color: the gem, card backs and the 3D studio lights. */
export const FOIL = ["#8ef6ff", "#c9a7ff", "#ff9bd6", "#ffe08a"] as const;
const STOPS = [0, 0.35, 0.65, 1];

const useStill = () => useSyncExternalStore(subscribeReducedMotion, reducedMotion, () => false);

// Gradient over the middle of the gem's box, so all four hues land on the visible diamond.
const Foil = ({ id, still }: { id: string; still: boolean }) => (
  <linearGradient id={id} x1=".25" y1=".25" x2=".75" y2=".75">
    {FOIL.map((c, i) => <stop key={c} offset={STOPS[i]} stopColor={c} />)}
    {!still && <animateTransform attributeName="gradientTransform" type="rotate" values="0 .5 .5;360 .5 .5" dur="9s" repeatCount="indefinite" />}
  </linearGradient>
);

/** The cut gem: four facets lit from the top left, centred on 0,0. */
const Facets = ({ fill }: { fill: string }) => (
  <>
    <path d="M0-9 9 0 0 9-9 0z" fill={fill} />
    <path d="M0-9-9 0h9z" fill="#fff" opacity=".3" />
    <path d="M0-9 9 0H0z" fill="#fff" opacity=".12" />
    <path d="M-9 0 0 9V0z" fill="#000" opacity=".12" />
    <path d="M9 0 0 9V0z" fill="#000" opacity=".25" />
  </>
);

/**
 * GamePad mark: a controller whose face-button diamond is a cut gem, the token you own.
 * The gem's foil sheen drifts slowly unless the viewer prefers reduced motion.
 */
export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const still = useStill();
  return (
    <span className={`logo ${className}`}>
      <svg width={size * 1.6} height={size} viewBox="0 0 64 40" aria-hidden="true">
        <defs><Foil id={`foil${id}`} still={still} /></defs>
        <path d={CONTROLLER_PATH} fill="var(--text)" />
        <path d={DPAD_PATH} fill="var(--bg)" />
        <g transform="translate(46 19.5)">
          <Facets fill={`url(#foil${id})`} />
          <path d="M0-9 9 0 0 9-9 0z" fill="none" stroke="var(--bg)" strokeWidth="1.6" strokeLinejoin="round" />
        </g>
      </svg>
    </span>
  );
}

/** The A face button on the main action: the logo's own cut gem with the letter on it, so the button you press is the token you get. */
export function AGlyph() {
  const id = useId().replace(/:/g, "");
  return (
    <span className="glyph">
      <svg className="gem-glyph" viewBox="-9 -9 18 18" aria-hidden="true">
        <defs><Foil id={`gg${id}`} still /></defs>
        <Facets fill={`url(#gg${id})`} />
      </svg>
      A
    </span>
  );
}

/** The gem alone, turning: the busy indicator. */
export function Gem({ size = 44 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="gem" width={size} height={size} viewBox="-10 -10 20 20" aria-hidden="true">
      <defs><Foil id={`gem${id}`} still /></defs>
      <Facets fill={`url(#gem${id})`} />
    </svg>
  );
}
