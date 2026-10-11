import { useMemo, useState } from "react";
import type { Go } from "../App";
import { useStore, split } from "../state/store";
import { useScene } from "../state/scene";
import { imageTexture, titleTexture } from "../three/textures";
import { eth } from "../lib/format";
import { useAct } from "./common";
import { HOUSE_PALETTE } from "../data/games";
import { AGlyph } from "../ui/Logo";

const GENRES = ["Action", "Adventure", "RPG", "Strategy", "Racing", "Shooter", "Puzzle", "Simulation", "Roguelike", "Cozy", "Horror", "Party"];
const PALETTE = HOUSE_PALETTE;

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
  const why = title.trim().length < 2 ? "Add a title to publish" : p >= 10 ? "Keep the price under 10 ETH" : "Enter a price of 0 or more";
  const sale = split(p || 0, roy, false);

  return (
    <>
      <div className="split lead">
        <form className="panel" onSubmit={e => {
          e.preventDefault();
          if (!ok) return;
          act(async () => { await store.publish({ title: title.trim(), genre, priceEth: p, royaltyPct: roy, cover }); go("store", undefined); }, `${title.trim()} is on the shelf`);
        }}>
          <h2>Publish a game</h2>
          {store.mode === "live" && <p className="sub">Publishing signs one transaction on the test network.</p>}
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
              <div className="legend">
                <span>{p > 0 ? <>Per copy: you get <b>{eth(sale.rest)}</b> (GamePad 10%)</> : "Per copy: free, so nothing to split"}</span>
                <span>{roy > 0 ? <>Per resale: you get <b>{roy}%</b> of the price</> : "Per resale: no royalty"}</span>
              </div>
            </div>
          </div>
          <div className="actions mt">
            <button className="btn primary" type="submit" disabled={!ok}><AGlyph />Publish</button>
            {!ok && <span className="hint">{why}</span>}
          </div>
        </form>
        <div className="spacer-3d" />
      </div>
      <div />
    </>
  );
}
