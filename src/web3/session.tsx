import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WalletAccount } from "@wallet-standard/base";
import type { Instruction } from "@solana/kit";
import { AnimatePresence, motion } from "motion/react";
import { NETWORK_NAME, STORE_PROGRAM } from "./config";
import { sendWithWallet, signIn as siws, watchWallets, type Proof, type SolWallet } from "./wallets";
import { IconClose, IconEye, IconWallet } from "../ui/Icons";
import { AGlyph } from "../ui/Logo";
import { useNav } from "../input/nav";
import { errorText, short } from "../lib/format";

type Session = {
  /** the connected Solana account (base58) */
  address?: string;
  walletName?: string;
  /** signed in with Sign In With Solana for this address */
  signedIn: boolean;
  guest: boolean;
  /** the store program is deployed on devnet and a wallet is connected, so purchases are real devnet transactions */
  live: boolean;
  /** the wallet sheet is up, so the app behind it is inert */
  sheetOpen: boolean;
  open(): void;
  signIn(): Promise<void>;
  signOut(): void;
  /** signs the instructions in the wallet as one transaction and sends it to devnet; resolves to its signature */
  send(ixs: readonly Instruction[]): Promise<string>;
};

const Ctx = createContext<Session | null>(null);
export const useSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside provider");
  return s;
};

const PROOF = "gamepad-siws";
const GUEST = "gamepad-guest";
/** the wallet used last, reconnected silently on the next visit */
const LAST = "gamepad-wallet";
const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<SolWallet[]>([]);
  const [wallet, setWallet] = useState<SolWallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [proof, setProof] = useState<Proof | null>(() => read<Proof>(PROOF));
  const [guest, setGuest] = useState<boolean>(() => !!read<boolean>(GUEST));
  const [sheet, setSheet] = useState(false);
  const tried = useRef(false);

  useEffect(() => watchWallets(setWallets), []);

  // Reconnect the last wallet without a prompt once it registers; wallets that need a prompt just stay disconnected.
  useEffect(() => {
    if (tried.current) return;
    const last = read<string>(LAST);
    const w = last && wallets.find(x => x.name === last);
    if (!w) return;
    tried.current = true;
    w.features["standard:connect"].connect({ silent: true })
      .then(({ accounts }) => { if (accounts[0]) { setWallet(w); setAccount(accounts[0]); } })
      .catch(() => { /* not authorized any more */ });
  }, [wallets]);

  // Follow account switches and disconnects made inside the wallet.
  useEffect(() => wallet?.features["standard:events"]?.on("change", ({ accounts }) => {
    if (accounts) setAccount(accounts[0] ?? null);
  }), [wallet]);

  const connect = useCallback(async (w: SolWallet) => {
    const { accounts } = await w.features["standard:connect"].connect();
    if (!accounts[0]) throw new Error("The wallet didn't share an account.");
    setWallet(w); setAccount(accounts[0]);
    write(LAST, w.name); write(GUEST, null); setGuest(false);
    return accounts[0];
  }, []);

  const address = account?.address;
  const signedIn = !!(address && proof && proof.address === address);

  const signIn = useCallback(async () => {
    if (!wallet || !account) return;
    const p = await siws(wallet, account);
    write(PROOF, p); setProof(p);
  }, [wallet, account]);

  const signOut = useCallback(() => {
    write(PROOF, null); setProof(null);
    write(GUEST, null); setGuest(false);
    write(LAST, null);
    wallet?.features["standard:disconnect"]?.disconnect().catch(() => {});
    setWallet(null); setAccount(null);
  }, [wallet]);

  const send = useCallback(async (ixs: readonly Instruction[]) => {
    if (!wallet || !account) throw new Error("No wallet connected.");
    return sendWithWallet(wallet, account, ixs);
  }, [wallet, account]);

  const startGuest = useCallback(() => { write(GUEST, true); setGuest(true); setSheet(false); }, []);

  const value = useMemo<Session>(() => ({
    address, walletName: wallet?.name, signedIn, guest: guest && !address,
    live: !!address && !!STORE_PROGRAM, sheetOpen: sheet,
    open: () => setSheet(true), signIn, signOut, send,
  }), [address, wallet, signedIn, guest, sheet, signIn, signOut, send]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>{sheet && <WalletSheet wallets={wallets} connect={connect} onClose={() => setSheet(false)} onGuest={startGuest} />}</AnimatePresence>
    </Ctx.Provider>
  );
}

/** Wallet apps that open GamePad in their own browser, offered when no wallet is installed here. */
const here = () => encodeURIComponent(location.href.split("#")[0]);
const APPS = [
  { name: "Phantom", href: () => `https://phantom.app/ul/browse/${here()}?ref=${here()}` },
  { name: "Solflare", href: () => `https://solflare.com/ul/v1/browse/${here()}?ref=${here()}` },
];

function WalletSheet({ wallets, connect, onClose, onGuest }: { wallets: SolWallet[]; connect(w: SolWallet): Promise<WalletAccount>; onClose(): void; onGuest(): void }) {
  const session = useContext(Ctx);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "sign">(session?.address ? "sign" : "pick");
  const box = useRef<HTMLDivElement>(null);

  // The pad and arrow keys move between the sheet's buttons; A presses the focused one, B closes.
  useNav(a => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>("button:not([disabled]):not(.x), a.opt") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (a === "back") onClose();
    else if (a === "down" || a === "right") items[(i + 1) % items.length]?.focus();
    else if (a === "up" || a === "left") items[(i - 1 + items.length) % items.length]?.focus();
    else if (a === "confirm" && i >= 0) items[i].click();
    return true;
  });
  // focus moves into the sheet, and goes back to whatever opened it on close
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => { if (prev?.isConnected) prev.focus(); };
  }, []);
  useEffect(() => { box.current?.querySelector<HTMLElement>(".opt:not([disabled]), .btn.primary")?.focus(); }, [step]);

  useEffect(() => { if (session?.signedIn) onClose(); }, [session?.signedIn, onClose]);

  const pick = async (w: SolWallet) => {
    setErr(null); setPending(w.name);
    try { await connect(w); setStep("sign"); }
    catch (e) { setErr(errorText(e)); }
    finally { setPending(null); }
  };
  const sign = async () => {
    setErr(null);
    try { await session?.signIn(); }
    catch (e) { setErr(errorText(e)); }
  };

  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div ref={box} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h"
        initial={{ y: 30, scale: .97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: "spring", damping: 24, stiffness: 300 }}>
        <button className="icon-btn x" onClick={onClose} aria-label="Close"><IconClose /></button>
        {step === "pick" ? <>
          <h2 id="sheet-h">Connect</h2>
          <p>Your Solana wallet is your GamePad account. Games you buy are licenses the store keeps under your address. {NETWORK_NAME} only for now.</p>
          <div className="opts">
            {wallets.map(w => (
              <button key={w.name} className="opt" onClick={() => pick(w)} disabled={!!pending} aria-busy={pending === w.name || undefined}>
                {w.icon ? <img src={w.icon} alt="" /> : <span className="ph"><IconWallet /></span>}
                <span>{w.name}<small>{pending === w.name ? "Waiting for your wallet…" : "Installed in this browser"}</small></span>
              </button>
            ))}
            {!wallets.length && APPS.map(a => (
              <a key={a.name} className="opt" href={a.href()} target="_blank" rel="noreferrer">
                <span className="ph"><IconWallet /></span>
                <span>{a.name}<small>Opens GamePad in the {a.name} app, or gets the wallet</small></span>
              </a>
            ))}
            <button className="opt" onClick={onGuest}>
              <span className="ph"><IconEye /></span>
              <span>Look around without a wallet<small>Preview mode: purchases are simulated in this browser</small></span>
            </button>
          </div>
        </> : <>
          <h2 id="sheet-h">Sign in</h2>
          <p>Sign a message to prove {session?.address ? <span className="mono">{short(session.address)}</span> : "this wallet"} is yours. It's free and sends no transaction.</p>
          <div className="actions">
            <button className="btn primary" onClick={sign}><AGlyph />Sign in</button>
            <button className="btn noglyph" onClick={onClose}>Not now</button>
          </div>
          {!STORE_PROGRAM && <p className="note">The store isn't on {NETWORK_NAME} yet, so buying stays in preview mode for now.</p>}
        </>}
        {err && <div className="err" role="alert">{err}</div>}
      </motion.div>
    </motion.div>
  );
}
