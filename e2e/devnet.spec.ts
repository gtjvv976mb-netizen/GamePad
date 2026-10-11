import { expect, test } from "@playwright/test";
import { assertDevnetRpc, DEVNET_GENESIS_HASH } from "../src/web3/devnet";

test.skip(({ isMobile }) => isMobile, "runs once, in node");

test("RPC ledger identity gates devnet transactions", async () => {
  const endpoint = (hash: string) => ({ getGenesisHash: () => ({ send: async () => hash }) });
  await expect(assertDevnetRpc(endpoint(DEVNET_GENESIS_HASH))).resolves.toBeUndefined();
  await expect(assertDevnetRpc(endpoint("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"))).rejects.toThrow("not Solana devnet");
  await expect(assertDevnetRpc({ getGenesisHash: () => ({ send: async () => { throw new Error("RPC unavailable"); } }) })).rejects.toThrow("RPC unavailable");
});
