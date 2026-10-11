import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Go } from "../App";
import { useStore, split } from "../state/store";
import { useCatalog, textureFor, thumbFor } from "../state/catalog";
import { useScene } from "../state/scene";
import { useNav } from "../input/nav";
import { eth } from "../lib/format";
import { Eth } from "../ui/Eth";
import { IconLeft, IconRight } from "../ui/Icons";
import { AGlyph } from "../ui/Logo";
import { KineticTitle } from "../ui/Kinetic";
import { bigMotion } from "../lib/motion";
import { arrivedAt, idleFor, kick, now } from "../lib/show";
import { useSession } from "../web3/session";
import { useAct, useFit, useNarrow } from "./common";

const KEY = "gamepad-sel";

export function StoreView({ go, focus }: { go: Go; focus?: string }) {
  const catalog = useCatalog();
  const store = useStore();
  const act = useAct();
  const narrow = useNarrow();
  const [sel, setSel] = useState(() => {
    const want = focus ?? sessionStorage.getItem(KEY) ?? "hcr";
    return Math.max(0, catalog.findIndex(g => g.slug === want));
  });
  const game = catalog[sel] ?? catalog[0];
  const tilesRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const per = useFit(tilesRef, "x", 3, 10, narrow);
  const page = Math.floor(sel / per);
  const pages = Math.ceil(catalog.length / per);
  const owned = store.owned[game.chainId] ?? 0;
  const used = store.listings.filter(l => l.gameId === game.chainId && !l.mine);
  const floor = used.length ? Math.min(...used.map(l => l.priceEth)) : null;

  // the screen reader hears the games the visitor picks, not the ones the carousel turns to
  const [heard, setHeard] = useState<string | null>(null);
  const pick = (i: number, auto = false) => {
    const n = (i + catalog.length) % catalog.length;
    refocus.current = !!tilesRef.current?.contains(document.activeElement);
    setSel(n);
    if (!auto) { sessionStorage.setItem(KEY, catalog[n].slug); setHeard(catalog[n].slug); }
  };

  // each new game is a beat: the 3D card flips with a punch and the voxels scatter
  const firstGame = useRef(true);
  useEffect(() => { if (firstGame.current) { firstGame.current = false; return; } kick(); }, [game.slug]);

  // The hero is a carousel at full motion: once the first game has had 7 s on screen after the fly-in, and the
  // visitor has been idle a few seconds, the next game flips in, every 7 s. It holds
  // while the pointer rests on the hero or the shelf, while a transaction or the wallet sheet is open, and
  // whenever the tab is hidden.
  const session = useSession();
  const holding = useRef(false);
  const blocked = useRef(false);
  blocked.current = !!store.busy || session.sheetOpen;
  useEffect(() => {
    let t = 0;
    const tick = () => {
      if (bigMotion() && now() - arrivedAt() > 7 && !document.hidden && !holding.current && !blocked.current && idleFor() > 6) pick(sel + 1, true);
      else t = window.setTimeout(tick, 1500);
    };
    t = window.setTimeout(tick, 7000);
    return () => clearTimeout(t);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const hold = { onPointerEnter: () => { holding.current = true; }, onPointerLeave: () => { holding.current = false; } };
  // Keyboard focus follows the selection, so Enter always opens the tile that looks selected.
  useEffect(() => {
    if (refocus.current) tilesRef.current?.querySelector<HTMLElement>('.tile[aria-current="true"]')?.focus({ preventScroll: true });
    refocus.current = false;
  }, [sel, page]);

  const scene = useMemo(() => ({ kind: "card" as const, texture: textureFor(game), src: thumbFor(game), key: game.slug, palette: game.palette, side: "right" as const }), [game]);
  useScene(scene);

  const buy = () => act(() => store.buy(game.chainId, game.priceEth), `${game.title} is in your library`);

  useNav(a => {
    if (a === "left") pick(sel - 1);
    else if (a === "right") pick(sel + 1);
    else if (a === "up") pick(sel - per);
    else if (a === "down") pick(sel + per);
    else if (a === "confirm") { if (owned) go("library", game.slug); else buy(); }
    else if (a === "alt" && floor !== null) go("market", game.slug);
  });

  const studioCut = split(game.priceEth, game.royaltyPct, false).rest;

  return (
    <>
      {/* The copy re-enters for each game; the actions stay put, so Buy always means the game on screen. */}
      <section className="hero" {...hold}>
        <p className="sr" aria-live="polite">{heard === game.slug ? `${game.title}, ${owned ? "in your library" : game.priceEth ? eth(game.priceEth) : "free"}` : ""}</p>
        <div key={game.slug} className="cue">
          <div className="eyebrow" style={{ "--k": 0 } as CSSProperties}>{game.genre} · {game.studio}</div>
          <KineticTitle text={game.title} />
          <p className="blurb" style={{ "--k": 3 } as CSSProperties}>{game.blurb}</p>
          {(game.priceEth > 0 || game.royaltyPct > 0 || floor !== null) && (
            <dl className="facts" style={{ "--k": 4 } as CSSProperties}>
              {game.priceEth > 0 && <div className="fact"><dt>Studio gets</dt><dd><Eth v={studioCut} /></dd></div>}
              {game.royaltyPct > 0 && <div className="fact"><dt><span className="lg-only">Resale royalty</span><span className="sm-only">Royalty</span></dt><dd>{game.royaltyPct}%</dd></div>}
              {floor !== null && <div className="fact"><dt>Used from</dt><dd><Eth v={floor} /></dd></div>}
            </dl>
          )}
        </div>
        <div className="actions">
          {owned
            ? <button className="btn owned-chip" onClick={() => go("library", game.slug)}><span className="glyph">A</span><span>In your library{owned > 1 ? ` ×${owned}` : ""}</span></button>
            : <button className="btn primary" onClick={buy}><AGlyph />{game.priceEth ? `Buy · ${eth(game.priceEth)}` : "Get it free"}</button>}
          {floor !== null && !owned && <button className="btn" onClick={() => go("market", game.slug)}><span className="glyph">X</span>{used.length} used</button>}
        </div>
      </section>

      <div>
        <div className="shelf" {...hold}>
          <button className="icon-btn" onClick={() => pick(Math.max(0, (page - 1) * per))} disabled={page === 0} aria-label="Previous games"><IconLeft /></button>
          <div className="tiles" ref={tilesRef} style={{ "--per": per } as CSSProperties} role="group" aria-label="Games">
            {catalog.slice(page * per, page * per + per).map((g, i) => {
              const idx = page * per + i;
              const mine = store.owned[g.chainId];
              return (
                <button key={g.slug} className="tile" aria-current={idx === sel} tabIndex={idx === sel ? 0 : -1} onClick={() => pick(idx)} style={{ "--i": i } as CSSProperties}
                  aria-label={`${g.title}, ${mine ? "owned" : g.priceEth ? eth(g.priceEth) : "free"}`}>
                  {thumbFor(g) ? <img src={thumbFor(g)} alt="" /> : <span style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${g.palette[1]}, ${g.palette[0]})` }} />}
                  <span className={`tprice ${mine ? "own" : ""}`}>{mine ? "Owned" : g.priceEth ? g.priceEth.toFixed(4).replace(/0+$/, "") : "Free"}</span>
                  {!narrow && <span className="tname">{g.title}</span>}
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
