import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Address, Instruction } from "@solana/kit";
import { rpc, STORE_PROGRAM, explorerTx, toLamports, toSol } from "./config";
import {
  buyIx, buyListingIx, bytesOf, cancelIx, decodeGame, decodeLicense, decodeListing, decodeStore, filtersFor, listIx, publishGameIx, storePda,
  type GameAccount, type ListingAccount, type StoreAccount,
} from "./storeProgram";
import { balanceOf } from "./wallets";
import { useSession } from "./session";
import { StoreCtx, type Activity, type CustomGame, type Listing, type StoreApi } from "../state/store";
import { GAMES } from "../data/games";
import { short } from "../lib/format";

const SEEDED = GAMES.length;
const MAX_LISTINGS = 120;
const MAX_URI = 200;

type Chain = { store?: StoreAccount; games: GameAccount[]; owned: Record<number, number>; listings: ListingAccount[]; balance?: number };
const EMPTY: Chain = { games: [], owned: {}, listings: [] };

async function accountsOf<T>(program: Address, kind: Parameters<typeof filtersFor>[0], decode: (b: Uint8Array) => T | undefined, owner?: Address) {
  const rows = await rpc.getProgramAccounts(program, { encoding: "base64", commitment: "confirmed", filters: filtersFor(kind, owner) }).send();
  return rows.flatMap(r => { const v = decode(bytesOf(r.account.data)); return v ? [v] : []; });
}

async function readStore(program: Address) {
  const info = await rpc.getAccountInfo(await storePda(program), { encoding: "base64", commitment: "confirmed" }).send();
  return info.value ? decodeStore(bytesOf(info.value.data)) : undefined;
}

/** Real store: reads and writes the GamePad store program on Solana devnet with the connected wallet. */
export function LiveStore({ children }: { children: ReactNode }) {
  const program = STORE_PROGRAM!;
  const session = useSession();
  const me = session.address as Address;
  const [chain, setChain] = useState<Chain>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const actKey = `gamepad-activity-devnet-${me}`;
  const [activity, setActivity] = useState<Activity[]>(() => { try { return JSON.parse(localStorage.getItem(actKey) ?? "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(actKey, JSON.stringify(activity)); } catch { /* ignore */ } }, [actKey, activity]);

  const refresh = useCallback(async () => {
    const [store, games, licenses, listings, balance] = await Promise.all([
      readStore(program),
      accountsOf(program, "Game", decodeGame),
      accountsOf(program, "License", decodeLicense, me),
      accountsOf(program, "Listing", decodeListing),
      balanceOf(me).catch(() => undefined),
    ]);
    const owned: Record<number, number> = {};
    for (const l of licenses) if (l.count > 0) owned[Number(l.gameId)] = l.count;
    games.sort((a, b) => Number(a.id - b.id));
    listings.sort((a, b) => Number(b.id - a.id));
    setChain({ store, games, owned, listings: listings.slice(0, MAX_LISTINGS), balance: balance === undefined ? undefined : toSol(balance) });
  }, [program, me]);

  // Load now, then keep up with other players' listings and sales while the tab is open.
  useEffect(() => {
    let live = true;
    const tick = () => { if (live && document.visibilityState === "visible") refresh().catch(() => { /* devnet hiccup: keep the last view */ }); };
    tick();
    const t = setInterval(tick, 30_000);
    addEventListener("focus", tick);
    return () => { live = false; clearInterval(t); removeEventListener("focus", tick); };
  }, [refresh]);

  const gameOf = useCallback((id: number) => chain.games.find(g => Number(g.id) === id), [chain.games]);

  const listings = useMemo<Listing[]>(() => chain.listings.map(l => {
    const mine = l.seller === me;
    return { id: Number(l.id), gameId: Number(l.gameId), seller: mine ? "You" : l.seller, price: toSol(l.price), mine };
  }), [chain.listings, me]);

  const published = useMemo<CustomGame[]>(() => chain.games.flatMap(g => {
    // every game published after the seed catalog, by any studio
    if (Number(g.id) <= SEEDED || !g.active) return [];
    const meta = parseMeta(g.uri);
    const id = Number(g.id);
    return [{ chainId: id, title: meta.name ?? `Game #${id}`, genre: meta.genre ?? "Indie", price: toSol(g.price), royaltyPct: g.royaltyBps / 100, studio: g.studio === me ? "You" : short(g.studio) }];
  }), [chain.games, me]);

  // The caller toasts the outcome; send hands back the explorer link for its 'View'.
  // `build` runs once the store is busy, so it can read the freshest ids; it returns the instructions and what to log.
  type Built = { ixs: Instruction[]; log?: Omit<Activity, "at" | "tx"> };
  const send = useCallback(async (label: string, build: () => Promise<Built>) => {
    if (busyRef.current) return; // one transaction at a time
    busyRef.current = true;
    setBusy(label);
    try {
      const { ixs, log } = await build();
      const sig = await session.send(ixs);
      if (log) setActivity(a => [{ ...log, at: Date.now(), tx: sig }, ...a].slice(0, 40));
      await refresh().catch(() => {});
      return explorerTx(sig);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, [session, refresh]);

  /** The store account as it is right now, for the next game or listing id and the treasury. */
  const freshStore = useCallback(async () => {
    const s = await readStore(program);
    if (!s) throw new Error("The store isn't set up on devnet yet.");
    return s;
  }, [program]);

  const api = useMemo<StoreApi>(() => ({
    mode: "live",
    owned: chain.owned, listings, published, activity, busy, balance: chain.balance,
    buy: (gameId, price) => {
      const g = gameOf(gameId);
      const expected = g?.price ?? toLamports(price);
      return send("Buying", async () => {
        const s = await freshStore();
        if (!g) throw new Error("This game isn't in the store on devnet yet.");
        const ix = await buyIx(program, { buyer: me, gameId: BigInt(gameId), studio: g.studio, treasury: s.treasury, expectedPrice: expected });
        return { ixs: [ix], log: { kind: "buy", gameId, price: toSol(expected) } };
      });
    },
    list: (gameId, price) => send("Listing", async () => {
      const s = await freshStore();
      const ix = await listIx(program, { seller: me, gameId: BigInt(gameId), price: toLamports(price), nextId: s.listingCount + 1n });
      return { ixs: [ix], log: { kind: "list", gameId, price } };
    }),
    cancel: listingId => send("Cancelling", async () => {
      const l = chain.listings.find(x => Number(x.id) === listingId);
      if (!l) throw new Error("That listing is gone.");
      const ix = await cancelIx(program, { seller: me, listingId: l.id, gameId: l.gameId });
      return { ixs: [ix], log: { kind: "cancel", gameId: Number(l.gameId), price: toSol(l.price) } };
    }),
    buyListing: x => send("Buying", async () => {
      const l = chain.listings.find(y => Number(y.id) === x.id);
      const g = l && gameOf(Number(l.gameId));
      if (!l || !g) throw new Error("That listing is gone.");
      const s = await freshStore();
      const ix = await buyListingIx(program, { buyer: me, listingId: l.id, gameId: l.gameId, seller: l.seller, studio: g.studio, treasury: s.treasury });
      return { ixs: [ix], log: { kind: "bought-used", gameId: x.gameId, price: toSol(l.price) } };
    }),
    publish: async g => {
      // Metadata goes on-chain as a small data URI. Cover images stay local until uploads are added.
      const uri = `data:application/json;base64,${btoa(unescape(encodeURIComponent(JSON.stringify({ name: g.title, genre: g.genre }))))}`;
      if (uri.length > MAX_URI) throw new Error("That title is too long to publish. Shorten it and try again.");
      let id = 0;
      await send("Publishing", async () => {
        const s = await freshStore();
        id = Number(s.gameCount + 1n);
        const ix = await publishGameIx(program, me, s.gameCount + 1n, { price: toLamports(g.price), royaltyBps: Math.round(g.royaltyPct * 100), uri });
        return { ixs: [ix], log: { kind: "publish", gameId: id, price: g.price } };
      });
      return id;
    },
  }), [chain, listings, published, activity, busy, send, freshStore, gameOf, program, me]);

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

function parseMeta(uri: string): { name?: string; genre?: string } {
  try {
    const m = uri.match(/^data:application\/json;base64,(.*)$/);
    return m ? JSON.parse(decodeURIComponent(escape(atob(m[1])))) : {};
  } catch { return {}; }
}
