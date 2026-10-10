import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Go } from "../App";
import { useStore, split } from "../state/store";
import { useCatalog, textureFor, thumbFor } from "../state/catalog";
import { useScene } from "../state/scene";
import { useNav } from "../input/nav";
import { eth } from "../lib/format";
import { useSession } from "../web3/session";
import { useAct } from "./common";
import { HOUSE_PALETTE } from "../data/games";
import { IconLeft, IconRight } from "../ui/Icons";
import { AGlyph } from "../ui/Logo";

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
  const sx = useRef(0);

  // Fan up to HAND cards around the selected one.
  const start = Math.max(0, Math.min(cur - Math.floor(HAND / 2), mine.length - HAND));
  const hand = useMemo(() => mine.slice(start, start + HAND), [mine, start]);
  const scene = useMemo(() => mine.length
    ? { kind: "hand" as const, textures: hand.map(g => ({ key: g.slug, texture: textureFor(g), src: thumbFor(g) })), selected: cur - start, palette: game!.palette }
    : { kind: "logo" as const, palette: HOUSE_PALETTE },
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
    setPrice(String(Number((game.priceEth * 0.8).toFixed(4))));
    setSelling(true);
  }
  const p = Number(price);
  const valid = !!game && p > 0 && p < 100;
  const cut = game && valid ? split(p, game.royaltyPct, true) : null;
  const copies = game ? store.owned[game.chainId] ?? 0 : 0;

  if (!mine.length) {
    return (
      <>
        {/* desktop: the copy takes the left column, like Profile, so the logo keeps the right */}
        <div className="empty lead">
          <h1 className="title md">Nothing here yet</h1>
          <span className="dim">{session.address || session.guest ? "Games you buy show up here as licenses your wallet holds. You can resell any of them." : "Connect a wallet to see the games it owns."}</span>
          {session.address || session.guest
            ? <button className="btn primary" onClick={() => go("store")}><AGlyph />Browse the store</button>
            : <button className="btn primary" onClick={session.open}><AGlyph />Connect wallet</button>}
        </div>
        <div />
      </>
    );
  }

  return (
    <>
      {/* the fanned hand above: swipe or drag sideways to move through it */}
      <div className="lib-swipe" onPointerDown={e => { sx.current = e.clientX; }}
        onPointerUp={e => { const dx = e.clientX - sx.current; if (Math.abs(dx) > 40) pick(cur + (dx < 0 ? 1 : -1)); }} />
      <section className="lib">
        <p className="sr" aria-live="polite">{game!.title}, game {cur + 1} of {mine.length}</p>
        <div className="eyebrow">{game!.genre}{mine.length > 1 ? ` · ${cur + 1} of ${mine.length}` : ""}</div>
        <div className="lib-pick">
          {mine.length > 1 ? <button type="button" className="icon-btn" aria-label="Previous game" disabled={cur === 0} onClick={() => pick(cur - 1)}><IconLeft /></button> : <span />}
          <motion.h1 key={game!.slug} className="title md" initial={{ opacity: .35, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>{game!.title}</motion.h1>
          {mine.length > 1 ? <button type="button" className="icon-btn" aria-label="Next game" disabled={cur >= mine.length - 1} onClick={() => pick(cur + 1)}><IconRight /></button> : <span />}
        </div>
        {!selling ? (
          <div className="actions center">
            <button className="btn primary" onClick={startSell}><AGlyph />{copies > 1 ? `Sell 1 of ${copies}` : "Sell this copy"}</button>
            <button className="btn noglyph" onClick={() => go("store", game!.slug)}>Store page</button>
          </div>
        ) : (
          <form className="actions center" onSubmit={e => {
            e.preventDefault();
            if (valid) act(() => store.list(game!.chainId, p), `${game!.title} is listed on the market`).then(() => setSelling(false));
          }}>
            <label className="price-in">
              <span className="sr">Asking price in ETH</span>
              <input autoFocus inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} aria-describedby="cut" aria-invalid={!valid} />
              <span>ETH</span>
            </label>
            <button className="btn primary" type="submit" disabled={!valid}><AGlyph />List it</button>
            <button className="btn noglyph" type="button" onClick={() => setSelling(false)}>Cancel</button>
            {cut
              ? <div id="cut" className="legend full"><span>You get <b>{eth(cut.rest)}</b></span><span>{game!.studio} gets <b>{eth(cut.royalty)}</b> ({game!.royaltyPct}%)</span><span>GamePad <b>{eth(cut.fee)}</b></span></div>
              : <div id="cut" className="legend full">{p >= 100 ? "Keep the price under 100 ETH" : "Enter a price above 0"}</div>}
          </form>
        )}
      </section>
    </>
  );
}
