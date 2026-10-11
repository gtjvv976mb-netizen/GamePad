import { useEffect, useMemo, useRef, useState } from "react";
import type { Go } from "../App";
import { useStore, split } from "../state/store";
import { useCatalog, textureFor, thumbFor, type Entry } from "../state/catalog";
import { useScene } from "../state/scene";
import { useNav } from "../input/nav";
import { sol, short } from "../lib/format";
import { Sol } from "../ui/Sol";
import { IconLeft, IconRight } from "../ui/Icons";
import { useAct, useFit, useNarrow } from "./common";

export function MarketView({ go, focus }: { go: Go; focus?: string }) {
  const store = useStore();
  const catalog = useCatalog();
  const act = useAct();
  const narrow = useNarrow();
  const [only, setOnly] = useState<string | undefined>(focus);
  const byId = useMemo(() => new Map(catalog.map(g => [g.chainId, g])), [catalog]);
  const rows = useMemo(() => store.listings
    .map(l => ({ l, g: byId.get(l.gameId) }))
    .filter((x): x is { l: typeof x.l; g: Entry } => !!x.g && (!only || x.g.slug === only))
    .sort((a, b) => (b.l.mine ? 1 : 0) - (a.l.mine ? 1 : 0) || a.l.price / (a.g.price || 1) - b.l.price / (b.g.price || 1)),
  [store.listings, byId, only]);

  const listRef = useRef<HTMLUListElement>(null);
  const per = useFit(listRef, "y", 2, 9, narrow);
  const [sel, setSel] = useState(0);
  const cur = Math.min(sel, Math.max(0, rows.length - 1));
  const page = Math.floor(cur / per);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const focusGame = rows[cur]?.g ?? catalog.find(g => g.slug === only) ?? catalog[1];

  const scene = useMemo(() => ({ kind: "card" as const, texture: textureFor(focusGame), src: thumbFor(focusGame), key: focusGame.slug, palette: focusGame.palette, side: "left" as const, compact: true }), [focusGame]);
  useScene(scene);

  // Passing over rows on the way to a button is not a choice: only a pointer that rests selects.
  const hover = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hover.current), []);

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
  const cut = r ? split(r.l.price, r.g.royaltyPct, true, store.feeBps) : null;

  return (
    <>
      <div className="split">
        <div className="spacer-3d" />
        <section className="panel list" aria-labelledby="mk-h">
          <h2 id="mk-h">{only ? `Used · ${focusGame.title}` : "Used games"}</h2>
          <p className="sub">Every sale pays the studio its royalty before the seller.{only && <> <button className="linkish" onClick={() => { setOnly(undefined); setSel(0); }}>Show all games</button></>}</p>
          <p className="sr" aria-live="polite">{r ? `${r.g.title}, ${sol(r.l.price)}, ${r.l.mine ? "listed by you" : `sold by ${short(r.l.seller)}`}` : ""}</p>
          <ul ref={listRef} className="rows" aria-label="Listings">
            {rows.length === 0 && <li className="empty"><span className="dim">No used copies listed right now.</span></li>}
            {rows.slice(page * per, page * per + per).map(({ l, g }, k) => {
              const i = page * per + k;
              return (
                <li key={l.id} className="row" aria-current={i === cur || undefined} onClick={() => setSel(i)}
                  onMouseEnter={() => { window.clearTimeout(hover.current); hover.current = window.setTimeout(() => setSel(i), 220); }}
                  onMouseLeave={() => window.clearTimeout(hover.current)}>
                  <img src={thumbFor(g)} alt="" />
                  <span className="meta">
                    <span className="rt">{g.title}</span>
                    <span className="rs">{l.mine ? "Your listing" : short(l.seller)}</span>
                  </span>
                  <span className="rp"><Sol v={l.price} col />{g.price > 0 && <span className="save">−{Math.round((1 - l.price / g.price) * 100)}%</span>}</span>
                  <button className={`btn sm ${i === cur && !l.mine ? "primary" : ""}`} aria-label={`${l.mine ? "Cancel listing" : "Buy"} ${g.title}, ${sol(l.price)}`}
                    onClick={e => { e.stopPropagation(); setSel(i); buy(i); }}>{l.mine ? "Cancel" : "Buy"}</button>
                </li>
              );
            })}
          </ul>
          {/* where the money goes on the selected copy, and the way to its store page */}
          {r && cut && (
            <div className="legend mk-cut">
              <span>{r.l.mine ? "You get" : "Seller gets"} <b>{sol(cut.rest)}</b></span>
              <span>{r.g.studio} gets <b>{sol(cut.royalty)}</b> ({r.g.royaltyPct}%)</span>
              <button className="linkish" onClick={() => go("store", r.g.slug)} aria-label={`Store page for ${r.g.title}`}>Store page</button>
            </div>
          )}
          <div className="panel-foot">
            <button className="icon-btn" onClick={() => move((page - 1) * per)} disabled={page === 0} aria-label="Previous page"><IconLeft /></button>
            <span className="count">{rows.length} {rows.length === 1 ? "copy" : "copies"} · page {page + 1} of {pages}</span>
            <button className="icon-btn" onClick={() => move((page + 1) * per)} disabled={page >= pages - 1} aria-label="Next page"><IconRight /></button>
          </div>
        </section>
      </div>
      <div />
    </>
  );
}
