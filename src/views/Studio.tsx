import { useMemo, useState } from "react";
import { TopBar, type Go } from "../App";
import { useStore, split } from "../state/store";
import { useScene } from "../state/scene";
import { imageTexture, titleTexture } from "../three/textures";
import { eth } from "../lib/format";
import { useAct } from "./common";

const GENRES = ["Action", "Adventure", "RPG", "Strategy", "Racing", "Shooter", "Puzzle", "Simulation", "Roguelike", "Cozy", "Horror", "Party"];
const PALETTE: [string, string, string] = ["#14121c", "#3a2f5c", "#c9a7ff"];

/** Shrink an uploaded cover to the card's 4:3 at 720×540 so it stays light. */
async function toCover(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = 720; c.height = 540;
  const s = Math.max(720 / img.width, 540 / img.height);
  c.getContext("2d")!.drawImage(img, (720 - img.width * s) / 2, (540 - img.height * s) / 2, img.width * s, img.height * s);
  return c.toDataURL("image/jpeg", 0.86);
}

export function StudioView({ go }: { go: Go }) {
  const store = useStore();
  const act = useAct();
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("Action");
  const [price, setPrice] = useState("0.008");
  const [roy, setRoy] = useState(8);
  const [cover, setCover] = useState<string | undefined>();

  const tex = useMemo(() => cover ? imageTexture(cover) : titleTexture(title || "Your game", PALETTE), [cover, title]);
  const scene = useMemo(() => ({ kind: "card" as const, texture: tex, src: cover, key: "studio", palette: PALETTE, side: "right" as const }), [tex]);
  useScene(scene);

  const p = Number(price);
  const ok = title.trim().length > 1 && p >= 0 && p < 10;
  const sale = split(p || 0, roy, false), resale = split(p * 0.7 || 0, roy, true);

  return (
    <>
      <TopBar crumb="Studio · publish a game" />
      <div className="split" style={{ gridTemplateColumns: "minmax(320px, 520px) minmax(0, 1fr)" }}>
        <form className="panel" onSubmit={e => {
          e.preventDefault();
          if (!ok) return;
          act(async () => { await store.publish({ title: title.trim(), genre, priceEth: p, royaltyPct: roy, cover }); go("store", undefined); }, `${title.trim()} is on the shelf`);
        }}>
          <h2>Publish a game</h2>
          <p className="sub">{store.mode === "live" ? "Publishing signs one transaction on the test network." : "Preview mode: publishing is simulated in this browser."}</p>
          <div className="form">
            <div className="field full"><label htmlFor="st-t">Title</label><input id="st-t" type="text" value={title} maxLength={40} onChange={e => setTitle(e.target.value)} placeholder="Comet Garden" /></div>
            <div className="field"><label htmlFor="st-g">Genre</label><select id="st-g" value={genre} onChange={e => setGenre(e.target.value)}>{GENRES.map(x => <option key={x}>{x}</option>)}</select></div>
            <div className="field"><label htmlFor="st-p">Price (ETH)</label><input id="st-p" type="number" min="0" step="0.0001" value={price} onChange={e => setPrice(e.target.value)} /></div>
            <div className="field full">
              <label htmlFor="st-r">Resale royalty: {roy}%</label>
              <input id="st-r" type="range" min="0" max="15" value={roy} onChange={e => setRoy(+e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="st-c">Cover art</label>
              <label className="drop" htmlFor="st-c">{cover ? "Change cover" : "Upload a 4:3 image"}</label>
              <input id="st-c" type="file" accept="image/*" className="sr" onChange={async e => { const f = e.target.files?.[0]; if (f) setCover(await toCover(f)); }} />
            </div>
            <div className="field full">
              <div className="splitbar" aria-hidden="true"><span style={{ width: `${(sale.rest / (p || 1)) * 100}%` }} /><span style={{ width: 0 }} /><span style={{ flex: 1 }} /></div>
              <div className="legend">
                <span><i style={{ background: "var(--text)" }} />New sale: you get {p ? eth(sale.rest) : "—"}</span>
                <span><i style={{ background: "#c9a7ff" }} />Each resale at 70%: you get {p ? eth(resale.royalty) : "—"}</span>
                <span><i style={{ background: "rgba(243,241,234,.3)" }} />GamePad 10%</span>
              </div>
            </div>
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="btn primary" type="submit" disabled={!ok}><span className="glyph">A</span>Publish</button>
          </div>
        </form>
        <div className="spacer-3d" />
      </div>
      <div />
    </>
  );
}
