import { eth, ethCol } from "../lib/format";

/** An ETH amount with the unit set smaller and dimmer than the figure; the text reads the same. */
export function Eth({ v, col }: { v: number; col?: boolean }) {
  const s = (col ? ethCol : eth)(v);
  const i = s.indexOf(" ETH");
  return i < 0 ? <>{s}</> : <>{s.slice(0, i)}<span className="u"> ETH</span></>;
}
