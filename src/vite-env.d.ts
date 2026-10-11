/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** the GamePad store program id on Solana devnet; empty runs the site in preview mode */
  readonly VITE_STORE_PROGRAM_DEVNET?: string;
  /** a devnet RPC endpoint; defaults to the public https://api.devnet.solana.com */
  readonly VITE_SOLANA_RPC?: string;
}
