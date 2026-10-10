import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, usePublicClient, useSignMessage, useSwitchChain, type Connector } from "wagmi";
import { verifyMessage, type Address } from "viem";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { AnimatePresence, motion } from "motion/react";
import { CHAINS, STORE_ADDRESS, chainName, type ChainId } from "./config";
import { IconClose } from "../ui/Icons";
import { useNav } from "../input/nav";

type Proof = { address: Address; chainId: number; message: string; signature: `0x${string}`; at: number };
type Session = {
  address?: Address;
  /** signed in with Sign-In with Ethereum (EIP-4361) for this address */
  signedIn: boolean;
  guest: boolean;
  chainId: ChainId;
  /** a store contract is configured on this network, so purchases are real test transactions */
  live: boolean;
  open(): void;
  signIn(): Promise<void>;
  signOut(): void;
  switchTo(id: ChainId): void;
};

const Ctx = createContext<Session | null>(null);
export const useSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside provider");
  return s;
};

const PROOF = "gamepad-siwe";
const GUEST = "gamepad-guest";
const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const client = usePublicClient();
  const [proof, setProof] = useState<Proof | null>(() => read<Proof>(PROOF));
  const [guest, setGuest] = useState<boolean>(() => !!read<boolean>(GUEST));
  const [sheet, setSheet] = useState(false);

  const signedIn = !!(address && proof && proof.address.toLowerCase() === address.toLowerCase());

  const signIn = useCallback(async () => {
    if (!address) return;
    const message = createSiweMessage({
      address, chainId, domain: location.host || "gamepad.local", uri: location.origin.startsWith("http") ? location.origin : "https://gamepad.local",
      nonce: generateSiweNonce(), version: "1", issuedAt: new Date(),
      statement: "Sign in to GamePad. This is free and doesn't send a transaction.",
    });
    const signature = await signMessageAsync({ message });
    // Smart wallets (ERC-1271/6492) need the chain to verify; plain keys verify locally.
    let ok = false;
    try { ok = client ? await client.verifySiweMessage({ message, signature }) : false; } catch { ok = false; }
    if (!ok) ok = await verifyMessage({ address, message, signature }).catch(() => false);
    if (!ok) throw new Error("That signature didn't match this wallet.");
    const p = { address, chainId, message, signature, at: Date.now() };
    write(PROOF, p); setProof(p);
  }, [address, chainId, client, signMessageAsync]);

  const signOut = useCallback(() => {
    write(PROOF, null); setProof(null);
    write(GUEST, null); setGuest(false);
    if (isConnected) disconnect();
  }, [disconnect, isConnected]);

  const startGuest = useCallback(() => { write(GUEST, true); setGuest(true); setSheet(false); }, []);

  const value = useMemo<Session>(() => ({
    address, signedIn, guest: guest && !isConnected, chainId,
    live: isConnected && !!STORE_ADDRESS[chainId],
    open: () => setSheet(true), signIn, signOut,
    switchTo: id => switchChain({ chainId: id }),
  }), [address, signedIn, guest, isConnected, chainId, signIn, signOut, switchChain]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>{sheet && <WalletSheet onClose={() => setSheet(false)} onGuest={startGuest} />}</AnimatePresence>
    </Ctx.Provider>
  );
}

function WalletSheet({ onClose, onGuest }: { onClose(): void; onGuest(): void }) {
  const { connectors, connectAsync, isPending } = useConnect();
  const { isConnected, address } = useAccount();
  const session = useContext(Ctx);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "sign">(isConnected ? "sign" : "pick");
  useNav(a => { if (a === "back") { onClose(); return true; } return true; });

  useEffect(() => { if (session?.signedIn) onClose(); }, [session?.signedIn, onClose]);

  // EIP-6963 discovery lists each installed wallet by name; drop the generic fallback when one is found.
  const list = connectors.filter((c, _, all) => !(c.id === "injected" && all.some(o => o.type === "injected" && o.id !== "injected")));

  const connect = async (c: Connector) => {
    setErr(null);
    try { await connectAsync({ connector: c }); setStep("sign"); }
    catch (e) { setErr(short(e)); }
  };
  const sign = async () => {
    setErr(null);
    try { await session?.signIn(); }
    catch (e) { setErr(short(e)); }
  };

  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h"
        initial={{ y: 30, scale: .97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: "spring", damping: 24, stiffness: 300 }}>
        <button className="icon-btn x" onClick={onClose} aria-label="Close"><IconClose /></button>
        {step === "pick" ? <>
          <h2 id="sheet-h">Connect</h2>
          <p>Your wallet is your GamePad account. Games you buy are licenses it holds. Test networks only for now ({CHAINS.map(c => c.name).join(", ")}).</p>
          <div className="opts">
            {list.map(c => (
              <button key={c.uid} className="opt" onClick={() => connect(c)} disabled={isPending}>
                {c.icon ? <img src={c.icon} alt="" /> : <span className="ph">{c.name[0]}</span>}
                <span>{c.id === "injected" ? "Browser wallet" : c.name}<small>{c.id === "coinbaseWalletSDK" ? "Passkey smart wallet, no extension needed" : c.id === "injected" ? "MetaMask, Rabby or any installed wallet" : "Installed in this browser"}</small></span>
              </button>
            ))}
            <button className="opt" onClick={onGuest}>
              <span className="ph">?</span>
              <span>Look around without a wallet<small>Preview mode: purchases are simulated in this browser</small></span>
            </button>
          </div>
        </> : <>
          <h2 id="sheet-h">Sign in</h2>
          <p>Sign a message to prove {address ? <span className="mono">{address.slice(0, 6)}…{address.slice(-4)}</span> : "this wallet"} is yours. It's free and sends no transaction.</p>
          <div className="actions">
            <button className="btn primary" onClick={sign}><span className="glyph">A</span>Sign in</button>
            <button className="btn noglyph" onClick={onClose}>Not now</button>
          </div>
          {session && !STORE_ADDRESS[session.chainId] && <p style={{ marginTop: 14, fontSize: 12.5 }}>The store isn't deployed on {chainName(session.chainId)} yet, so buying stays in preview mode on this network.</p>}
        </>}
        {err && <div className="err" role="alert">{err}</div>}
      </motion.div>
    </motion.div>
  );
}

const short = (e: unknown) => {
  const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "Something went wrong.";
  return /reject|denied/i.test(m) ? "Request was declined in the wallet." : m.split("\n")[0];
};
