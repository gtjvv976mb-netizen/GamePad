import { createConfig, http } from "wagmi";
import { baseSepolia, sepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import type { Address } from "viem";

// Test networks only. Mainnet stays off until the owner decides to launch with real money.
export const CHAINS = [baseSepolia, sepolia] as const;
export type ChainId = (typeof CHAINS)[number]["id"];

export const config = createConfig({
  chains: CHAINS,
  connectors: [
    injected({ shimDisconnect: true }),
    // Coinbase Smart Wallet works with a passkey, no browser extension needed.
    coinbaseWallet({ appName: "GamePad", preference: { options: "smartWalletOnly", telemetry: false } }),
  ],
  transports: { [baseSepolia.id]: http(), [sepolia.id]: http() },
});

const env = import.meta.env;
const addr = (v?: string) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);

/** Store contract per chain. Missing means that network runs in preview mode. */
export const STORE_ADDRESS: Record<number, Address | undefined> = {
  [baseSepolia.id]: addr(env.VITE_STORE_ADDRESS_BASE_SEPOLIA),
  [sepolia.id]: addr(env.VITE_STORE_ADDRESS_SEPOLIA),
};

export const chainName = (id?: number) => CHAINS.find(c => c.id === id)?.name ?? "Unsupported network";
/** Two-line network label for the rail: the chain, then what kind of network it is. */
export const chainLabel = (id?: number): [string, string] => (id === sepolia.id ? ["Ethereum", "testnet"] : ["Base", "testnet"]);
export const explorerTx = (chainId: number, hash: string) => {
  const c = CHAINS.find(x => x.id === chainId);
  return c?.blockExplorers?.default.url ? `${c.blockExplorers.default.url}/tx/${hash}` : undefined;
};

declare module "wagmi" {
  interface Register { config: typeof config }
}
