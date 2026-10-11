import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
import { formatEther, parseEther, type Address, type Hash } from "viem";
import { storeAbi } from "./storeAbi";
import { STORE_ADDRESS, explorerTx, type ChainId } from "./config";
import { StoreCtx, type Activity, type CustomGame, type Listing, type StoreApi } from "../state/store";
import { GAMES } from "../data/games";

const SEEDED = GAMES.length;
const MAX_LISTINGS = 120;

/** Real store: reads and writes the GamePadStore contract on the connected test network. */
export function LiveStore({ chainId, children }: { chainId: ChainId; children: ReactNode }) {
  const store = STORE_ADDRESS[chainId]!;
  const { address, chainId: walletChain } = useAccount();
  const client = usePublicClient({ chainId });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const actKey = `gamepad-activity-${chainId}-${address?.toLowerCase()}`;
  const [activity, setActivity] = useState<Activity[]>(() => { try { return JSON.parse(localStorage.getItem(actKey) ?? "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(actKey, JSON.stringify(activity)); } catch { /* ignore */ } }, [actKey, activity]);

  const base = { address: store, abi: storeAbi, chainId } as const;
  const { data: gameCount, refetch: refetchCount } = useReadContract({ ...base, functionName: "gameCount" });
  const { data: listingCount, refetch: refetchListingCount } = useReadContract({ ...base, functionName: "listingCount" });
  const n = Number(gameCount ?? 0n);
  const ln = Number(listingCount ?? 0n);
  const ids = useMemo(() => Array.from({ length: n }, (_, i) => BigInt(i + 1)), [n]);
  const listingIds = useMemo(() => Array.from({ length: Math.min(ln, MAX_LISTINGS) }, (_, i) => BigInt(ln - i)), [ln]);

  const { data: games, refetch: refetchGames } = useReadContracts({ contracts: ids.map(id => ({ ...base, functionName: "games", args: [id] }) as const) });
  const { data: balances, refetch: refetchBalances } = useReadContract({
    ...base, functionName: "balanceOfBatch", args: [ids.map(() => address!), ids], query: { enabled: !!address && n > 0 },
  });
  const { data: rawListings, refetch: refetchListings } = useReadContracts({ contracts: listingIds.map(id => ({ ...base, functionName: "listings", args: [id] }) as const) });
  const { data: owed, refetch: refetchOwed } = useReadContract({ ...base, functionName: "owed", args: [address!], query: { enabled: !!address } });

  const refresh = useCallback(async () => {
    await Promise.all([refetchCount(), refetchListingCount()]);
    await Promise.all([refetchGames(), refetchBalances(), refetchListings(), refetchOwed()]);
  }, [refetchCount, refetchListingCount, refetchGames, refetchBalances, refetchListings, refetchOwed]);

  const owned = useMemo(() => {
    const o: Record<number, number> = {};
    balances?.forEach((b, i) => { if (b > 0n) o[i + 1] = Number(b); });
    return o;
  }, [balances]);

  const listings = useMemo<Listing[]>(() => (rawListings ?? []).flatMap((r, i) => {
    if (r.status !== "success") return [];
    const [seller, gameId, price, active] = r.result as readonly [Address, bigint, bigint, boolean];
    if (!active) return [];
    const mine = !!address && seller.toLowerCase() === address.toLowerCase();
    return [{ id: Number(listingIds[i]), gameId: Number(gameId), seller: mine ? "You" : seller, priceEth: Number(formatEther(price)), mine }];
  }), [rawListings, listingIds, address]);

  const published = useMemo<CustomGame[]>(() => (games ?? []).flatMap((r, i) => {
    if (r.status !== "success" || i < SEEDED) return [];
    // every game published after the seed catalog, by any studio
    const [studio, price, royaltyBps, active, uri] = r.result as readonly [Address, bigint, number, boolean, string];
    if (!active) return [];
    const meta = parseMeta(uri);
    const mine = !!address && studio.toLowerCase() === address.toLowerCase();
    return [{ chainId: i + 1, title: meta.name ?? `Game #${i + 1}`, genre: meta.genre ?? "Indie", priceEth: Number(formatEther(price)), royaltyPct: royaltyBps / 100, studio: mine ? "You" : `${studio.slice(0, 6)}…${studio.slice(-4)}` }];
  }), [games, address]);

  const priceOf = (gameId: number) => {
    const r = games?.[gameId - 1];
    return r?.status === "success" ? (r.result as unknown as readonly [Address, bigint])[1] : undefined;
  };

  // The caller toasts the outcome; send hands back the explorer link for its 'View'.
  const send = useCallback(async (label: string, call: () => Promise<Hash>, log?: Omit<Activity, "at" | "tx">) => {
    if (busyRef.current) return; // one transaction at a time
    busyRef.current = true;
    setBusy(label);
    try {
      if (walletChain !== chainId) await switchChainAsync({ chainId });
      const hash = await call();
      await client!.waitForTransactionReceipt({ hash });
      if (log) setActivity(a => [{ ...log, at: Date.now(), tx: hash }, ...a].slice(0, 40));
      await refresh();
      return explorerTx(chainId, hash);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, [walletChain, chainId, switchChainAsync, client, refresh]);

  const api = useMemo<StoreApi>(() => ({
    mode: "live",
    owned, listings, published, activity, busy,
    owedEth: Number(formatEther(owed ?? 0n)),
    buy: (gameId, priceEth) => {
      const value = priceOf(gameId) ?? parseEther(String(priceEth));
      return send("Buying", () => writeContractAsync({ ...base, functionName: "buy", args: [BigInt(gameId)], value }), { kind: "buy", gameId, priceEth: Number(formatEther(value)) });
    },
    list: (gameId, priceEth) => send("Listing", () => writeContractAsync({ ...base, functionName: "list", args: [BigInt(gameId), parseEther(String(priceEth))] }), { kind: "list", gameId, priceEth }),
    cancel: listingId => {
      const l = listings.find(x => x.id === listingId);
      return send("Cancelling", () => writeContractAsync({ ...base, functionName: "cancel", args: [BigInt(listingId)] }), l && { kind: "cancel", gameId: l.gameId, priceEth: l.priceEth });
    },
    buyListing: l => send("Buying", () => writeContractAsync({ ...base, functionName: "buyListing", args: [BigInt(l.id)], value: parseEther(String(l.priceEth)) }), { kind: "bought-used", gameId: l.gameId, priceEth: l.priceEth }),
    withdraw: () => send("Withdrawing", () => writeContractAsync({ ...base, functionName: "withdraw" }), { kind: "withdraw", gameId: 0, priceEth: Number(formatEther(owed ?? 0n)) }),
    publish: async g => {
      // Metadata goes on-chain as a small data URI. Cover images stay local until IPFS upload is added.
      const uri = `data:application/json;base64,${btoa(unescape(encodeURIComponent(JSON.stringify({ name: g.title, genre: g.genre }))))}`;
      await send("Publishing", () => writeContractAsync({ ...base, functionName: "publishGame", args: [parseEther(String(g.priceEth)), Math.round(g.royaltyPct * 100), uri] }), { kind: "publish", gameId: n + 1, priceEth: g.priceEth });
      return n + 1;
    },
  }), [owned, listings, published, activity, busy, owed, send, writeContractAsync, n]); // eslint-disable-line react-hooks/exhaustive-deps

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

function parseMeta(uri: string): { name?: string; genre?: string } {
  try {
    const m = uri.match(/^data:application\/json;base64,(.*)$/);
    return m ? JSON.parse(decodeURIComponent(escape(atob(m[1])))) : {};
  } catch { return {}; }
}
