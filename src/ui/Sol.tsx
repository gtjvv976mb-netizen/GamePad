import { sol, solCol } from "../lib/format";

/** A SOL amount with the unit set smaller and dimmer than the figure; the text reads the same. */
export function Sol({ v, col }: { v: number; col?: boolean }) {
  const s = (col ? solCol : sol)(v);
  const i = s.indexOf(" SOL");
  return i < 0 ? <>{s}</> : <>{s.slice(0, i)}<span className="u"> SOL</span></>;
}
