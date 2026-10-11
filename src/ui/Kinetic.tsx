import { Fragment, type CSSProperties } from "react";

/**
 * A display title set letter by letter, so each one can rise into place in sequence (see .title .l in the
 * stylesheet). Words stay unbroken; the heading is named by its plain text.
 */
export function KineticTitle({ text, className = "title" }: { text: string; className?: string }) {
  let i = 0;
  return (
    <h1 className={className} aria-label={text}>
      {text.split(" ").map((w, wi) => (
        <Fragment key={wi}>
          {wi > 0 && " "}
          <span className="w">{[...w].map(ch => <span key={i} className="l" style={{ "--i": i++ } as CSSProperties}>{ch}</span>)}</span>
        </Fragment>
      ))}
    </h1>
  );
}
