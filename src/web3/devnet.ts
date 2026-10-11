// Cluster names in URLs are not proof of which ledger an RPC serves.
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

type GenesisRpc = { getGenesisHash(): { send(): Promise<string> } };

/** Check the actual ledger before asking a wallet to sign or seeding a store. */
export async function assertDevnetRpc(rpc: GenesisRpc): Promise<void> {
  const hash = await rpc.getGenesisHash().send();
  if (hash !== DEVNET_GENESIS_HASH) {
    throw new Error("This RPC is not Solana devnet. No transaction was signed or sent.");
  }
}
