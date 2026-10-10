import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Stage, type Scene } from "./three/Stage";
import { SceneCtx } from "./state/scene";
import { useStore } from "./state/store";
import { useSession } from "./web3/session";
import { chainName } from "./web3/config";
import { useNav, usePad } from "./input/nav";
import { Logo } from "./ui/Logo";
import { IconLibrary, IconMarket, IconProfile, IconStore, IconStudio } from "./ui/Icons";
import { StoreView } from "./views/Store";
import { MarketView } from "./views/Market";
import { LibraryView } from "./views/Library";
import { StudioView } from "./views/Studio";
import { ProfileView } from "./views/Profile";
import { GAMES } from "./data/games";
import { coverTexture } from "./three/textures";

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

  const accent = scene.palette[2];
  useEffect(() => { document.documentElement.style.setProperty("--accent", accent); }, [accent]);

  return (
    <SceneCtx.Provider value={setScene}>
      <Stage scene={scene} />
      <div className="shade" />
      <div className="app">
        <nav className="rail" aria-label="GamePad">
          <button className="home" onClick={() => go("store")} aria-label="GamePad home"><Logo size={30} /></button>
          {pad && <span className="pad-hint" title={pad}>LB</span>}
          <div className="tabs" role="tablist" aria-orientation="vertical">
            {TABS.map(t => (
              <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} aria-controls="view" id={`tab-${t.id}`} onClick={() => go(t.id)}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          {pad && <span className="pad-hint">RB</span>}
          <div className="spacer" />
          <div className="net">{session.address ? <><b>{chainName(session.chainId).replace(" Sepolia", "")}</b>Sepolia</> : session.guest ? <><b>Guest</b>preview</> : null}</div>
        </nav>
        <AnimatePresence mode="wait">
          <motion.main key={tab} id="view" role="tabpanel" aria-labelledby={`tab-${tab}`} className="view"
            initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: .28, ease: [.2, .8, .2, 1] }}>
            {tab === "store" && <StoreView go={go} focus={focus} />}
            {tab === "market" && <MarketView go={go} focus={focus} />}
            {tab === "library" && <LibraryView go={go} focus={focus} />}
            {tab === "studio" && <StudioView go={go} />}
            {tab === "profile" && <ProfileView go={go} />}
          </motion.main>
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {store.busy && (
          <motion.div className="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alertdialog" aria-live="assertive" aria-label={store.busy}>
            <div className="card">
              <div className="spin" />
              <b>{store.busy}…</b>
              <span style={{ color: "var(--dim)", fontSize: 13 }}>{store.mode === "live" ? "Confirm in your wallet, then wait for the network." : "Preview mode: simulated, no real transaction."}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SceneCtx.Provider>
  );
}

/** Top bar shared by every tab: where you are, preview/live, and the wallet. */
export function TopBar({ crumb }: { crumb: string }) {
  const s = useSession();
  const store = useStore();
  return (
    <header className="topbar">
      <span className="crumb">{crumb}</span>
      <span className="grow" />
      {(s.address || s.guest) && (
        <span className={`mode ${store.mode === "live" ? "live" : ""}`} title={store.mode === "live" ? "Real transactions on a test network" : "Purchases are simulated in this browser"}>
          {store.mode === "live" ? "Testnet live" : "Preview"}
        </span>
      )}
      {s.address
        ? <button className="btn sm" onClick={() => location.hash = "#profile"}><span className="mono">{s.address.slice(0, 6)}…{s.address.slice(-4)}</span></button>
        : <button className="btn sm primary" onClick={s.open}>{s.guest ? "Connect wallet" : "Connect"}</button>}
    </header>
  );
}
