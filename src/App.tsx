import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { Stage, type Scene } from "./three/Stage";
import { SceneCtx } from "./state/scene";
import { useStore } from "./state/store";
import { useCatalog } from "./state/catalog";
import { useSession } from "./web3/session";
import { NETWORK_LABEL } from "./web3/config";
import { useNav, usePad } from "./input/nav";
import { Logo, Seal } from "./ui/Logo";
import { World } from "./ui/World";
import { IconLibrary, IconMarket, IconPause, IconPlay, IconProfile, IconStore, IconStudio } from "./ui/Icons";
import { motionOff, setMotionStopped, subscribeMotion } from "./lib/motion";
import { useRevealed } from "./lib/show";
import { short } from "./lib/format";
import { StoreView } from "./views/Store";
import { MarketView } from "./views/Market";
import { LibraryView } from "./views/Library";
import { StudioView } from "./views/Studio";
import { ProfileView } from "./views/Profile";
import { useNarrow } from "./views/common";
import { GAMES } from "./data/games";
import { coverTexture } from "./three/textures";
import { calm } from "./three/color";

export type Tab = "store" | "market" | "library" | "studio" | "profile";
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "store", label: "Store", icon: <IconStore /> },
  { id: "market", label: "Market", icon: <IconMarket /> },
  { id: "library", label: "Library", icon: <IconLibrary /> },
  { id: "studio", label: "Studio", icon: <IconStudio /> },
  { id: "profile", label: "Profile", icon: <IconProfile /> },
];
const fromHash = (): Tab => (TABS.find(t => `#${t.id}` === location.hash)?.id ?? "store");

export type Go = (tab: Tab, focus?: string) => void;

export default function App() {
  const [tab, setTab] = useState<Tab>(fromHash);
  const [focus, setFocus] = useState<string | undefined>();
  const first = GAMES[1];
  const [scene, setScene] = useState<Scene>(() => ({ kind: "card", texture: coverTexture(first), key: first.slug, palette: first.palette, side: "right" }));
  const pad = usePad();
  const session = useSession();
  const store = useStore();
  const catalog = useCatalog();
  const narrow = useNarrow();
  const arrived = useRevealed();

  useEffect(() => {
    const on = () => setTab(fromHash());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  const go = useCallback<Go>((t, f) => {
    setFocus(f);
    if (location.hash !== `#${t}`) history.replaceState(null, "", `#${t}`);
    setTab(t);
  }, []);

  useNav(a => {
    const i = TABS.findIndex(t => t.id === tab);
    if (a === "prevTab") go(TABS[(i + TABS.length - 1) % TABS.length].id);
    else if (a === "nextTab") go(TABS[(i + 1) % TABS.length].id);
  });
  // While a transaction runs, every pad and key action stops here.
  useNav(() => true, !!store.busy);

  // Arrow keys along the tab list (up/down on the rail, left/right on the phone bar), Home and End.
  const onTabKey = (e: KeyboardEvent) => {
    const [prev, next] = narrow ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    const i = TABS.findIndex(t => t.id === tab), n = TABS.length;
    const j = e.key === prev ? (i + n - 1) % n : e.key === next ? (i + 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    e.stopPropagation(); // keep it from the view's own arrow handling
    go(TABS[j].id);
    requestAnimationFrame(() => document.getElementById(`tab-${TABS[j].id}`)?.focus());
  };

  // Signed out, the empty Library and Profile carry their own Connect wallet button.
  const hasGames = catalog.some(g => (store.owned[g.chainId] ?? 0) > 0);
  const ownCta = !session.address && !session.guest && (tab === "profile" || (tab === "library" && !hasGames));
  const [netA, netB] = NETWORK_LABEL;
  const label = TABS.find(t => t.id === tab)!.label;

  return (
    <SceneCtx.Provider value={setScene}>
      <World tint={calm(scene.palette[2])} />
      <Stage scene={scene} />
      <div className="shade" />
      {/* hidden while the fly-in runs; then the rail, top bar, hero and shelf arrive one after another */}
      <div className={`app ${arrived ? "in" : "pre"}`} inert={!!store.busy || session.sheetOpen || !arrived || undefined}>
        <button className="btn sm skip" onClick={() => document.getElementById("main")?.focus()}>Skip to content</button>
        <nav className="rail" aria-label="GamePad">
          <HomeMark onClick={() => go("store")} />
          {pad && <span className="pad-hint" title={pad}>LB</span>}
          <div className="tabs" role="tablist" aria-orientation={narrow ? "horizontal" : "vertical"} onKeyDown={onTabKey}>
            {TABS.map((t, i) => (
              <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} aria-controls="view" id={`tab-${t.id}`} style={{ "--i": i } as CSSProperties}
                tabIndex={tab === t.id ? 0 : -1} onClick={() => go(t.id)}>
                {tab === t.id && <motion.i layoutId="tab-mark" className="tab-mark" aria-hidden="true" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          {pad && <span className="pad-hint">RB</span>}
          <div className="spacer" />
          {session.address && <div className="net"><b>{netA}</b>{netB}</div>}
        </nav>
        <div className="col">
          <TopBar go={go} connect={!ownCta} />
          <main id="main" className="stack" tabIndex={-1}>
            {/* one tab panel that stays put; inside it the old view fades out while the new one slides in */}
            <div id="view" role="tabpanel" aria-labelledby={`tab-${tab}`} className="stack">
              <AnimatePresence>
                <View key={tab}>
                  {(tab === "market" || tab === "studio" || tab === "profile") && <h1 className="sr">{label}</h1>}
                  {tab === "store" && <StoreView go={go} focus={focus} />}
                  {tab === "market" && <MarketView go={go} focus={focus} />}
                  {tab === "library" && <LibraryView go={go} focus={focus} />}
                  {tab === "studio" && <StudioView go={go} />}
                  {tab === "profile" && <ProfileView />}
                </View>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
      <AnimatePresence>
        {store.busy && (
          <motion.div className="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <BusyCard label={store.busy} live={store.mode === "live"} />
          </motion.div>
        )}
      </AnimatePresence>
      <p className="sr" role="status" aria-live="polite">{store.busy ? `${store.busy}…` : ""}</p>
    </SceneCtx.Provider>
  );
}

/**
 * The home mark on the rail. Pointing at it, or reaching it with the keyboard, turns its seal a quarter, one step,
 * no tween. The state lives here, so only this button re-renders, not the app and its 3D stage.
 */
function HomeMark({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const [keyed, setKeyed] = useState(false);
  return (
    <button className="home" onClick={onClick} aria-label="GamePad home"
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      onFocus={e => setKeyed(e.currentTarget.matches(":focus-visible"))} onBlur={() => setKeyed(false)}>
      <Logo size={30} turn={hover || keyed ? 1 : 0} />
    </button>
  );
}

/** One tab's view. While it fades out it is inert, so clicks, focus and screen readers only reach the view coming in. */
function View({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.div className="view" inert={!present || undefined}
      initial={{ opacity: 0, x: 56, scale: .97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -36, transition: { duration: .18 } }}
      transition={{ type: "spring", stiffness: 260, damping: 28, mass: .9 }}>
      {children}
    </motion.div>
  );
}

/** A transaction in flight. It holds focus so nothing behind it can be pressed again, then hands focus back. */
function BusyCard({ label, live }: { label: string; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { if (prev?.isConnected && prev !== ref.current) prev.focus(); };
  }, []);
  return (
    <div className="card" tabIndex={-1} ref={ref}>
      <Seal size={40} spin />
      <b>{label}…</b>
      <span>{live ? "Confirm in your wallet, then wait for the network." : "Preview mode: simulated, no real transaction."}</span>
    </div>
  );
}

/** Top bar over every tab: preview or live, and the wallet. */
function TopBar({ go, connect }: { go: Go; connect: boolean }) {
  const s = useSession();
  const store = useStore();
  return (
    <header className="topbar">
      <span className="grow" />
      <MotionButton />
      {(s.address || s.guest) && (
        <span className={`mode ${store.mode === "live" ? "live" : ""}`} title={store.mode === "live" ? "Real transactions on Solana devnet" : "Purchases are simulated in this browser"}>
          {store.mode === "live" ? "Devnet live" : "Preview"}
        </span>
      )}
      {s.address
        ? <button className="btn sm" onClick={() => go("profile")}><span className="mono">{short(s.address)}</span></button>
        : connect && <button className="btn sm primary" onClick={s.open}>Connect wallet</button>}
    </header>
  );
}

/** Stops every animation and clip, and starts them again. The choice stays in this browser. */
function MotionButton() {
  const off = useSyncExternalStore(subscribeMotion, motionOff, () => false);
  return (
    <button className="icon-btn motion-btn" aria-pressed={off} aria-label="Stop motion" title={off ? "Play motion" : "Stop motion"}
      onClick={() => setMotionStopped(!off)}>
      {off ? <IconPlay /> : <IconPause />}
    </button>
  );
}
