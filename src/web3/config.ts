import { address, createSolanaRpc, type Address } from "@solana/kit";

// Solana devnet only. Mainnet stays off until the owner decides to launch with real money.
export const CLUSTER = "devnet" as const;
/** Wallet Standard chain id the wallet signs and sends on. */
export const CHAIN = "solana:devnet" as const;

const env = import.meta.env;
export const RPC_URL: string = env.VITE_SOLANA_RPC || "https://api.devnet.solana.com";
export const rpc = createSolanaRpc(RPC_URL);

const parse = (v?: string): Address | undefined => {
  try { return v && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v) ? address(v) : undefined; } catch { return undefined; }
};

/** The GamePad store program on devnet. Missing means the store runs in preview mode. */
export const STORE_PROGRAM: Address | undefined = parse(env.VITE_STORE_PROGRAM_DEVNET);

export const NETWORK_NAME = "Solana devnet";
/** Two-line network label for the rail: the chain, then what kind of network it is. */
export const NETWORK_LABEL: [string, string] = ["Solana", "devnet"];
export const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}?cluster=${CLUSTER}`;

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const toLamports = (sol: number) => BigInt(Math.round(sol * LAMPORTS_PER_SOL));
export const toSol = (lamports: bigint | number) => Number(lamports) / LAMPORTS_PER_SOL;
