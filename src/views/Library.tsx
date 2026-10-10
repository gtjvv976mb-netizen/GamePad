import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TopBar, type Go } from "../App";
import { useStore, split } from "../state/store";
import { useCatalog, textureFor, thumbFor } from "../state/catalog";
import { useScene } from "../state/scene";
import { useNav } from "../input/nav";
import { eth } from "../lib/format";
import { useSession } from "../web3/session";
import { useAct } from "./common";

const LOGO_PALETTE: [string, string, string] = ["#0c0c12", "#221c33", "#c9a7ff"];
const HAND = 7; // cards fanned at once

export function LibraryView({ go, focus }: { go: Go; focus?: string }) {
  const store = useStore();
  const catalog = useCatalog();
  const session = useSession();
  const act = useAct();
  const mine = useMemo(() => catalog.filter(g => (store.owned[g.chainId] ?? 0) > 0), [catalog, store.owned]);
  const [sel, setSel] = useState(() => Math.max(0, mine.findIndex(g => g.slug === focus)));
  const cur = Math.min(sel, Math.max(0, mine.length - 1));
  const game = mine[cur];
  const [price, setPrice] = useState("");
  const [selling, setSelling] = useState(false);

  // Fan up to HAND cards around the selected one.
  const start = Math.max(0, Math.min(cur - Math.floor(HAND / 2), mine.length - HAND));
  const hand = mine.slice(start, start + HAND);
  const scene = useMemo(() => mine.length
    ? { kind: "hand" as const, textures: hand.map(g => ({ key: g.slug, texture: textureFor(g), src: thumbFor(g) })), selected: cur - start, palette: game!.palette }
    : { kind: "logo" as const, palette: LOGO_PALETTE },
  [mine.length, hand, cur, start, game]); // eslint-disable-line react-hooks/exhaustive-deps
  useScene(scene);

  const pick = (i: number) => { setSel(Math.max(0, Math.min(mine.length - 1, i))); setSelling(false); };
  useNav(a => {
    if (a === "left") pick(cur - 1);
    else if (a === "right") pick(cur + 1);
    else if (a === "confirm" && game && !selling) startSell();
    else if (a === "back" && selling) setSelling(false);
  });

  function startSell() {
    if (!game) return;
    setPrice((game.priceEth * 0.8).toFixed(4));
    setSelling(true);
  }
  const p = Number(price);
  const valid = game && p > 0 && p < 100;
  const cut = game && valid ? split(p, game.royaltyPct, true) : null;

  if (!mine.length) {
    return (
      <>
        <TopBar crumb="Library" />
        <div className="empty">
          <h1 className="title md">Nothing here yet</h1>
          <span style={{ color: "var(--dim)" }}>{session.address || session.guest ? "Games you buy show up here as licenses your wallet holds. You can resell any of them." : "Connect a wallet to see the games it owns."}</span>
          {session.address || session.guest
            ? <button className="btn primary" onClick={() => go("store")}><span className="glyph">A</span>Browse the store</button>
            : <button className="btn primary" onClick={session.open}><span className="glyph">A</span>Connect</button>}
        </div>
        <div />
      </>
    );
  }

  return (
    <>
      <TopBar crumb={`Library · ${mine.length} ${mine.length === 1 ? "game" : "games"}`} />
      <div />
      <AnimatePresence mode="wait">
        <motion.section key={game!.slug + selling} className="lib" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .25 }}>
          <div className="eyebrow">{cur + 1} / {mine.length} · {game!.genre}{(store.owned[game!.chainId] ?? 0) > 1 ? ` · ${store.owned[game!.chainId]} copies` : ""}</div>
          <h1 className="title md">{game!.title}</h1>
          {!selling ? (
            <div className="actions" style={{ justifyContent: "center" }}>
              <button className="btn primary" onClick={startSell}><span className="glyph">A</span>Sell this copy</button>
              <button className="btn noglyph" onClick={() => go("store", game!.slug)}>Store page</button>
            </div>
          ) : (
            <form className="actions" style={{ justifyContent: "center" }} onSubmit={e => {
              e.preventDefault();
              if (valid) act(() => store.list(game!.chainId, p), `${game!.title} is listed on the market`).then(() => setSelling(false));
            }}>
              <label className="price-in">
                <span className="sr">Asking price in ETH</span>
                <input autoFocus inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} aria-describedby="cut" />
                <span>ETH</span>
              </label>
              <button className="btn primary" type="submit" disabled={!valid}><span className="glyph">A</span>List it</button>
              <button className="btn noglyph" type="button" onClick={() => setSelling(false)}>Cancel</button>
              {cut && <div id="cut" className="legend" style={{ flexBasis: "100%", justifyContent: "center" }}>
                <span>You get {eth(cut.rest)}</span><span>{game!.studio} gets {eth(cut.royalty)} ({game!.royaltyPct}%)</span><span>GamePad {eth(cut.fee)}</span>
              </div>}
            </form>
          )}
        </motion.section>
      </AnimatePresence>
    </>
  );
}
