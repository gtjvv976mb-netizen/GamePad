import { useId } from "react";

/** Controller outline, shared by the flat logo and the extruded 3D one (viewBox 0 0 64 40). */
export const CONTROLLER_PATH =
  "M20 5h24c8.2 0 13.6 4.4 15.6 11.6l3.1 11.9c1.6 6.2-3.3 11.4-8.9 9.6-3.6-1.2-5.7-5.6-9.4-7.1H19.6c-3.7 1.5-5.8 5.9-9.4 7.1-5.6 1.8-10.5-3.4-8.9-9.6l3.1-11.9C6.4 9.4 11.8 5 20 5z";
export const DPAD_PATH = "M14.5 13h5v4h4v5h-4v4h-5v-4h-4v-5h4z";

/**
 * GamePad mark: a controller whose face-button diamond is a cut gem, the token you own.
 * The gem's foil sheen drifts slowly unless the viewer prefers reduced motion.
 */
export function Logo({ size = 40, wordmark = false, className = "" }: { size?: number; wordmark?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <span className={`logo ${className}`}>
      <svg width={size * 1.6} height={size} viewBox="0 0 64 40" aria-hidden="true">
        <defs>
          <linearGradient id={`foil${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8ef6ff" />
            <stop offset=".35" stopColor="#c9a7ff" />
            <stop offset=".65" stopColor="#ff9bd6" />
            <stop offset="1" stopColor="#ffe08a" />
            <animateTransform className="foil-anim" attributeName="gradientTransform" type="rotate" values="0 .5 .5;360 .5 .5" dur="9s" repeatCount="indefinite" />
          </linearGradient>
        </defs>
        <path d={CONTROLLER_PATH} fill="var(--text)" />
        <path d={DPAD_PATH} fill="var(--bg)" />
        {/* gem: four facets, lit from the top left */}
        <g transform="translate(46 19.5)">
          <path d="M0-9 9 0 0 9-9 0z" fill={`url(#foil${id})`} />
          <path d="M0-9-9 0h9z" fill="#fff" opacity=".45" />
          <path d="M0-9 9 0H0z" fill="#fff" opacity=".12" />
          <path d="M-9 0 0 9V0z" fill="#000" opacity=".12" />
          <path d="M9 0 0 9V0z" fill="#000" opacity=".35" />
          <path d="M0-9 9 0 0 9-9 0z" fill="none" stroke="var(--bg)" strokeWidth="1.6" strokeLinejoin="round" />
        </g>
      </svg>
      {wordmark && <b className="wordmark">GamePad</b>}
    </span>
  );
}
