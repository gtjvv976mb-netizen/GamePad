import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GAMES } from "../data/games";

export type Listing = { id: number; gameId: number; seller: string; price: number; mine: boolean };
/** Prices are in SOL. `tx` is the transaction signature on devnet, live mode only. */
export type Activity = { kind: "buy" | "list" | "cancel" | "sold" | "bought-used" | "publish"; gameId: number; price: number; at: number; tx?: string };
export type CustomGame = { chainId: number; title: string; genre: string; price: number; royaltyPct: number; cover?: string; studio?: string };

export type StoreApi = {
  /** live = real transactions on Solana devnet, preview = simulated in this browser */
  mode: "live" | "preview";
  owned: Record<number, number>;
  listings: Listing[];
  /** the wallet's SOL balance, live mode only. Sales and royalties land here directly. */
  balance?: number;
  activity: Activity[];
  published: CustomGame[];
  busy: string | null;
  // live mode resolves with the explorer link for the transaction
  buy(gameId: number, price: number): Promise<string | void>;
  list(gameId: number, price: number): Promise<string | void>;
  cancel(listingId: number): Promise<string | void>;
  buyListing(listing: Listing): Promise<string | void>;
  publish(g: Omit<CustomGame, "chainId">): Promise<number>;
  reset?(): void;
};

export const StoreCtx = createContext<StoreApi | null>(null);
export const useStore = () => {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("useStore outside provider");
  return s;
};

/* ---------------- preview mode: everything simulated, saved in this browser ---------------- */

// v2: prices moved from ETH to SOL, so v1 data is left behind.
const KEY = "gamepad-preview-v2";
const HANDLES = ["vexa.sol", "kirin.sol", "nightowl.sol", "mossy.sol", "rainjump.sol", "saltyd0g.sol", "lumi.sol", "pix3l.sol", "7xKpQ2rTn8vLmW4dZ3fQa", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"];
const FEE = 0.1;

type PreviewState = { owned: Record<number, number>; listings: Listing[]; activity: Activity[]; published: CustomGame[]; nextListing: number };

function seed(): PreviewState {
  // Deterministic pseudo-random so the preview market looks the same on every load.
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const listings: Listing[] = [];
  let id = 1;
  for (const g of GAMES) {
    if (!g.price) continue;
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++)
      listings.push({ id: id++, gameId: g.chainId, seller: HANDLES[Math.floor(rnd() * HANDLES.length)], price: +(g.price * (0.55 + rnd() * 0.35)).toFixed(3), mine: false });
  }
  return { owned: {}, listings, activity: [], published: [], nextListing: id };
}

function load(): PreviewState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...seed(), ...JSON.parse(raw) };
  } catch { /* storage blocked: fall back to a fresh seed */ }
  return seed();
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export function PreviewStore({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<PreviewState>(load);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ }
  }, [st]);

  const run = useCallback(async (label: string, fn: (s: PreviewState) => PreviewState) => {
    if (busyRef.current) return; // one transaction at a time
    busyRef.current = true;
    setBusy(label);
    try {
      await wait(900);
      setSt(fn);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, []);

  const log = (s: PreviewState, a: Omit<Activity, "at">): Activity[] => [{ ...a, at: Date.now() }, ...s.activity].slice(0, 40);

  const api = useMemo<StoreApi>(() => ({
    mode: "preview",
    ...st,
    busy,
    buy: (gameId, price) => run("Buying", s => ({
      ...s, owned: { ...s.owned, [gameId]: (s.owned[gameId] ?? 0) + 1 }, activity: log(s, { kind: "buy", gameId, price }),
    })),
    list: (gameId, price) => run("Listing", s => ({
      ...s,
      owned: { ...s.owned, [gameId]: Math.max(0, (s.owned[gameId] ?? 0) - 1) },
      listings: [{ id: s.nextListing, gameId, seller: "You", price, mine: true }, ...s.listings],
      nextListing: s.nextListing + 1,
      activity: log(s, { kind: "list", gameId, price }),
    })),
    cancel: listingId => run("Cancelling", s => {
      const l = s.listings.find(x => x.id === listingId);
      if (!l) return s;
      return { ...s, listings: s.listings.filter(x => x.id !== listingId), owned: { ...s.owned, [l.gameId]: (s.owned[l.gameId] ?? 0) + 1 }, activity: log(s, { kind: "cancel", gameId: l.gameId, price: l.price }) };
    }),
    buyListing: l => run("Buying", s => ({
      ...s,
      listings: s.listings.filter(x => x.id !== l.id),
      owned: { ...s.owned, [l.gameId]: (s.owned[l.gameId] ?? 0) + 1 },
      activity: log(s, { kind: "bought-used", gameId: l.gameId, price: l.price }),
    })),
    publish: async g => {
      const chainId = 1000 + st.published.length + 1;
      await run("Publishing", s => ({ ...s, published: [...s.published, { ...g, chainId }], activity: log(s, { kind: "publish", gameId: chainId, price: g.price }) }));
      return chainId;
    },
    reset: () => setSt(seed()),
  }), [st, busy, run]);

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

/** Share of a sale that reaches each party, matching the store program's split. */
export const split = (price: number, royaltyPct: number, resale: boolean) => {
  const fee = price * FEE;
  const royalty = resale ? price * royaltyPct / 100 : 0;
  return { fee, royalty, rest: price - fee - royalty };
};
