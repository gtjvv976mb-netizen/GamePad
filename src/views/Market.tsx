import { useMemo, useRef, useState } from "react";
import { TopBar, type Go } from "../App";
import { useStore, split } from "../state/store";
import { useCatalog, textureFor, thumbFor, type Entry } from "../state/catalog";
import { useScene } from "../state/scene";
import { useNav } from "../input/nav";
import { eth, short } from "../lib/format";
import { IconLeft, IconRight } from "../ui/Icons";
import { isNarrow, useAct, useFit } from "./common";

export function MarketView({ go, focus }: { go: Go; focus?: string }) {
  const store = useStore();
  const catalog = useCatalog();
  const act = useAct();
  const [only, setOnly] = useState<string | undefined>(focus);
  const byId = useMemo(() => new Map(catalog.map(g => [g.chainId, g])), [catalog]);
  const rows = useMemo(() => store.listings
    .map(l => ({ l, g: byId.get(l.gameId) }))
    .filter((x): x is { l: typeof x.l; g: Entry } => !!x.g && (!only || x.g.slug === only))
    .sort((a, b) => (b.l.mine ? 1 : 0) - (a.l.mine ? 1 : 0) || a.l.priceEth / (a.g.priceEth || 1) - b.l.priceEth / (b.g.priceEth || 1)),
  [store.listings, byId, only]);

  const listRef = useRef<HTMLDivElement>(null);
  const per = useFit(listRef, isNarrow() ? 52 : 58, 0, "y", 2, 9);
  const [sel, setSel] = useState(0);
  const cur = Math.min(sel, Math.max(0, rows.length - 1));
  const page = Math.floor(cur / per);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const focusGame = rows[cur]?.g ?? catalog.find(g => g.slug === only) ?? catalog[1];

  const scene = useMemo(() => ({ kind: "card" as const, texture: textureFor(focusGame), src: thumbFor(focusGame), key: focusGame.slug, palette: focusGame.palette, side: "left" as const, compact: true }), [focusGame]);
  useScene(scene);

  const buy = (i: number) => {
    const r = rows[i];
    if (!r) return;
    if (r.l.mine) return act(() => store.cancel(r.l.id), "Listing cancelled, the copy is back in your library");
    return act(() => store.buyListing(r.l), `${r.g.title} is in your library`);
  };
  const move = (i: number) => setSel(Math.max(0, Math.min(rows.length - 1, i)));

  useNav(a => {
    if (a === "up") move(cur - 1);
    else if (a === "down") move(cur + 1);
    else if (a === "left") move(cur - per);
    else if (a === "right") move(cur + per);
    else if (a === "confirm") buy(cur);
    else if (a === "back" && only) { setOnly(undefined); setSel(0); }
  });

  const r = rows[cur];
  const cut = r ? split(r.l.priceEth, r.g.royaltyPct, true) : null;

  return (
    <>
      <TopBar crumb="Market · used copies from players" />
      <div className="split">
        <div className="spacer-3d" style={{ alignSelf: "end" }}>
          {r && cut && (
            <dl className="facts" style={{ marginBottom: 0 }}>
              <div className="fact"><dt>Seller gets</dt><dd>{eth(cut.rest)}</dd></div>
              <div className="fact"><dt>{r.g.studio} gets</dt><dd>{eth(cut.royalty)}</dd></div>
              <div className="fact"><dt>Vs. new</dt><dd>{r.g.priceEth ? `−${Math.round((1 - r.l.priceEth / r.g.priceEth) * 100)}%` : "—"}</dd></div>
            </dl>
          )}
        </div>
        <section className="panel" aria-labelledby="mk-h" style={{ display: "flex", flexDirection: "column", height: "min(100%, 640px)" }}>
          <h2 id="mk-h">{only ? `Used · ${focusGame.title}` : "Used games"}</h2>
          <p className="sub">Every sale pays the studio its royalty before the seller.{only && <> <button className="linkish" onClick={() => { setOnly(undefined); setSel(0); }}>Show all games</button></>}</p>
          <div ref={listRef} className="rows" style={{ flex: 1, minHeight: 0 }} role="listbox" aria-label="Listings">
            {rows.length === 0 && <div className="empty" style={{ margin: "24px auto" }}><span style={{ color: "var(--dim)" }}>No used copies listed right now.</span></div>}
            {rows.slice(page * per, page * per + per).map(({ l, g }, k) => {
              const i = page * per + k;
              return (
                <div key={l.id} className="row" role="option" aria-selected={i === cur} aria-current={i === cur} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}>
                  <img src={thumbFor(g)} alt="" />
                  <span style={{ minWidth: 0 }}>
                    <span className="rt" style={{ display: "block" }}>{g.title}</span>
                    <span className="rs" style={{ display: "block" }}>{l.mine ? "Your listing" : short(l.seller)}</span>
                  </span>
                  <span className="rp">{eth(l.priceEth)}{g.priceEth > 0 && <span className="save">−{Math.round((1 - l.priceEth / g.priceEth) * 100)}%</span>}</span>
                  <button className={`btn sm ${l.mine ? "" : "primary"}`} onClick={e => { e.stopPropagation(); setSel(i); buy(i); }}>{l.mine ? "Cancel" : "Buy"}</button>
                </div>
              );
            })}
          </div>
          <div className="panel-foot">
            <button className="icon-btn" onClick={() => move((page - 1) * per)} disabled={page === 0} aria-label="Previous page"><IconLeft /></button>
            <span className="count">{rows.length} {rows.length === 1 ? "copy" : "copies"} · page {page + 1} of {pages}</span>
            <button className="icon-btn" onClick={() => move((page + 1) * per)} disabled={page >= pages - 1} aria-label="Next page"><IconRight /></button>
          </div>
        </section>
      </div>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn noglyph sm" onClick={() => go("store", focusGame.slug)}>See {focusGame.title} in the store</button>
      </div>
    </>
  );
}
