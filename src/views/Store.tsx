import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TopBar, type Go } from "../App";
import { useStore, split } from "../state/store";
import { useCatalog, textureFor, thumbFor } from "../state/catalog";
import { useScene } from "../state/scene";
import { useNav } from "../input/nav";
import { eth } from "../lib/format";
import { IconLeft, IconRight } from "../ui/Icons";
import { isNarrow, useAct, useFit } from "./common";

const KEY = "gamepad-sel";

export function StoreView({ go, focus }: { go: Go; focus?: string }) {
  const catalog = useCatalog();
  const store = useStore();
  const act = useAct();
  const [sel, setSel] = useState(() => {
    const want = focus ?? sessionStorage.getItem(KEY) ?? "hcr";
    return Math.max(0, catalog.findIndex(g => g.slug === want));
  });
  const game = catalog[sel] ?? catalog[0];
  const tilesRef = useRef<HTMLDivElement>(null);
  const per = useFit(tilesRef, isNarrow() ? 78 : 148, isNarrow() ? 8 : 12, "x", 3, 10);
  const page = Math.floor(sel / per);
  const pages = Math.ceil(catalog.length / per);
  const owned = store.owned[game.chainId] ?? 0;
  const used = store.listings.filter(l => l.gameId === game.chainId && !l.mine);
  const floor = used.length ? Math.min(...used.map(l => l.priceEth)) : null;

  const pick = (i: number) => {
    const n = (i + catalog.length) % catalog.length;
    setSel(n);
    sessionStorage.setItem(KEY, catalog[n].slug);
  };

  const scene = useMemo(() => ({ kind: "card" as const, texture: textureFor(game), src: thumbFor(game), key: game.slug, palette: game.palette, side: "right" as const }), [game]);
  useScene(scene);

  const buy = () => act(() => store.buy(game.chainId, game.priceEth), `${game.title} is in your library`);

  useNav(a => {
    if (a === "left") pick(sel - 1);
    else if (a === "right") pick(sel + 1);
    else if (a === "up") pick(sel - per);
    else if (a === "down") pick(sel + per);
    else if (a === "confirm" && !owned) buy();
    else if (a === "alt" && floor !== null) go("market", game.slug);
  });

  const studioCut = split(game.priceEth, game.royaltyPct, false).rest;

  return (
    <>
      <TopBar crumb="Store" />
      <AnimatePresence mode="wait">
        <motion.section key={game.slug} className="hero" aria-live="polite"
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .3, ease: [.2, .8, .2, 1] }}>
          <div className="eyebrow">{game.genre} · {game.studio}</div>
          <h1 className="title">{game.title}</h1>
          <p className="blurb">{game.blurb}</p>
          <dl className="facts">
            <div className="fact"><dt>Price</dt><dd>{eth(game.priceEth)}</dd></div>
            <div className="fact"><dt>Studio gets</dt><dd>{game.priceEth ? eth(studioCut) : "—"}</dd></div>
            <div className="fact"><dt>Resale royalty</dt><dd>{game.royaltyPct}%</dd></div>
            {floor !== null && <div className="fact"><dt>Used from</dt><dd>{eth(floor)}</dd></div>}
          </dl>
          <div className="actions">
            {owned
              ? <span className="owned-chip">In your library{owned > 1 ? ` ×${owned}` : ""}</span>
              : <button className="btn primary" onClick={buy}><span className="glyph">A</span>{game.priceEth ? `Buy · ${eth(game.priceEth)}` : "Get it free"}</button>}
            {floor !== null && <button className="btn" onClick={() => go("market", game.slug)}><span className="glyph">X</span>{used.length} used</button>}
            {owned > 0 && <button className="btn noglyph" onClick={() => go("library", game.slug)}>Sell yours</button>}
          </div>
        </motion.section>
      </AnimatePresence>

      <div>
        <div className="shelf">
          <button className="icon-btn" onClick={() => pick(Math.max(0, (page - 1) * per))} disabled={page === 0} aria-label="Previous games"><IconLeft /></button>
          <div className="tiles" ref={tilesRef} style={{ gridAutoColumns: `calc((100% - ${(per - 1) * (isNarrow() ? 8 : 12)}px) / ${per})` }} role="listbox" aria-label="Games">
            {catalog.slice(page * per, page * per + per).map((g, i) => {
              const idx = page * per + i;
              const mine = store.owned[g.chainId];
              return (
                <button key={g.slug} className="tile" role="option" aria-selected={idx === sel} aria-current={idx === sel} onClick={() => pick(idx)} aria-label={g.title}>
                  {thumbFor(g) ? <img src={thumbFor(g)} alt="" /> : <span style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${g.palette[1]}, ${g.palette[0]})` }} />}
                  <span className={`tprice ${mine ? "own" : ""}`}>{mine ? "Owned" : g.priceEth ? g.priceEth.toFixed(4).replace(/0+$/, "") : "Free"}</span>
                  {!isNarrow() && <span className="tname">{g.title}</span>}
                </button>
              );
            })}
          </div>
          <button className="icon-btn" onClick={() => pick(Math.min(catalog.length - 1, (page + 1) * per))} disabled={page >= pages - 1} aria-label="More games"><IconRight /></button>
        </div>
        <div className="pager" aria-hidden="true">{Array.from({ length: pages }, (_, i) => <i key={i} className={i === page ? "on" : ""} />)}</div>
      </div>
    </>
  );
}
