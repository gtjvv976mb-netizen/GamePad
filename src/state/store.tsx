import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { GAMES } from "../data/games";

export type Listing = { id: number; gameId: number; seller: string; priceEth: number; mine: boolean };
export type Activity = { kind: "buy" | "list" | "cancel" | "sold" | "bought-used" | "withdraw" | "publish"; gameId: number; priceEth: number; at: number; tx?: string };
export type CustomGame = { chainId: number; title: string; genre: string; priceEth: number; royaltyPct: number; cover?: string; studio?: string };

export type StoreApi = {
  /** live = real transactions on a test network, preview = simulated in this browser */
  mode: "live" | "preview";
  owned: Record<number, number>;
  listings: Listing[];
  owedEth: number;
  activity: Activity[];
  published: CustomGame[];
  busy: string | null;
  buy(gameId: number, priceEth: number): Promise<void>;
  list(gameId: number, priceEth: number): Promise<void>;
  cancel(listingId: number): Promise<void>;
  buyListing(listing: Listing): Promise<void>;
  withdraw(): Promise<void>;
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

const KEY = "gamepad-preview-v1";
const HANDLES = ["vexa.eth", "kirin.base", "nightowl.eth", "mossy.base", "rainjump.eth", "saltyd0g.base", "lumi.eth", "pix3l.base", "0x9f3a…12ab", "0x77c1…c0de"];
const FEE = 0.1;

type PreviewState = { owned: Record<number, number>; listings: Listing[]; owedEth: number; activity: Activity[]; published: CustomGame[]; nextListing: number };

function seed(): PreviewState {
  // Deterministic pseudo-random so the preview market looks the same on every load.
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const listings: Listing[] = [];
  let id = 1;
  for (const g of GAMES) {
    if (!g.priceEth) continue;
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++)
      listings.push({ id: id++, gameId: g.chainId, seller: HANDLES[Math.floor(rnd() * HANDLES.length)], priceEth: +(g.priceEth * (0.55 + rnd() * 0.35)).toFixed(4), mine: false });
  }
  return { owned: {}, listings, owedEth: 0, activity: [], published: [], nextListing: id };
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

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ }
  }, [st]);

  const run = useCallback(async (label: string, fn: (s: PreviewState) => PreviewState) => {
    setBusy(label);
    await wait(900);
    setSt(fn);
    setBusy(null);
  }, []);

  const log = (s: PreviewState, a: Omit<Activity, "at">): Activity[] => [{ ...a, at: Date.now() }, ...s.activity].slice(0, 40);

  const api = useMemo<StoreApi>(() => ({
    mode: "preview",
    ...st,
    busy,
    buy: (gameId, priceEth) => run("Buying", s => ({
      ...s, owned: { ...s.owned, [gameId]: (s.owned[gameId] ?? 0) + 1 }, activity: log(s, { kind: "buy", gameId, priceEth }),
    })),
    list: (gameId, priceEth) => run("Listing", s => ({
      ...s,
      owned: { ...s.owned, [gameId]: Math.max(0, (s.owned[gameId] ?? 0) - 1) },
      listings: [{ id: s.nextListing, gameId, seller: "You", priceEth, mine: true }, ...s.listings],
      nextListing: s.nextListing + 1,
      activity: log(s, { kind: "list", gameId, priceEth }),
    })),
    cancel: listingId => run("Cancelling", s => {
      const l = s.listings.find(x => x.id === listingId);
      if (!l) return s;
      return { ...s, listings: s.listings.filter(x => x.id !== listingId), owned: { ...s.owned, [l.gameId]: (s.owned[l.gameId] ?? 0) + 1 }, activity: log(s, { kind: "cancel", gameId: l.gameId, priceEth: l.priceEth }) };
    }),
    buyListing: l => run("Buying", s => ({
      ...s,
      listings: s.listings.filter(x => x.id !== l.id),
      owned: { ...s.owned, [l.gameId]: (s.owned[l.gameId] ?? 0) + 1 },
      activity: log(s, { kind: "bought-used", gameId: l.gameId, priceEth: l.priceEth }),
    })),
    withdraw: () => run("Withdrawing", s => ({ ...s, owedEth: 0, activity: log(s, { kind: "withdraw", gameId: 0, priceEth: s.owedEth }) })),
    publish: async g => {
      const chainId = 1000 + st.published.length + 1;
      await run("Publishing", s => ({ ...s, published: [...s.published, { ...g, chainId }], activity: log(s, { kind: "publish", gameId: chainId, priceEth: g.priceEth }) }));
      return chainId;
    },
    reset: () => setSt(seed()),
  }), [st, busy, run]);

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

/** Share of a sale that reaches each party, matching the contract's split. */
export const split = (priceEth: number, royaltyPct: number, resale: boolean) => {
  const fee = priceEth * FEE;
  const royalty = resale ? priceEth * royaltyPct / 100 : 0;
  return { fee, royalty, rest: priceEth - fee - royalty };
};
