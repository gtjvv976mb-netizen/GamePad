// Dry-runs scripts/deploy.mjs's deploy + seeding logic against the in-process chain.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther } from "viem";
import { CHAINS, deployStore, loadSeed, seedCatalog } from "../scripts/deploy.mjs";
import { abi, alice, artifact, deployer, publicClient, storeAt, walletOf } from "./helpers.mjs";

describe("deploy script", () => {
  it("parses the 16-game seed catalog", () => {
    const games = loadSeed();
    assert.equal(games.length, 16);
    assert.deepEqual(games.map((g) => g.slug), [
      "ndp", "hcr", "osv", "ptv", "sft", "kkn", "eov", "gla",
      "mmr", "slc", "dpt", "cbz", "rrn", "ibl", "lmc", "sws",
    ]);
    assert.deepEqual(games[0], {
      id: 1, slug: "ndp", title: "Neon Drift Protocol", price: parseEther("0.012"), royaltyBps: 700, uri: "ipfs://pending/ndp.json",
    });
    assert.deepEqual([games[7].price, games[7].royaltyBps], [0n, 0]); // Gridlock Arena is free
    assert.deepEqual([games[15].price, games[15].royaltyBps], [parseEther("0.0127"), 900]);
  });

  it("only targets testnets, with the front-end env var names", () => {
    assert.deepEqual(Object.keys(CHAINS), ["baseSepolia", "sepolia"]);
    assert.equal(CHAINS.baseSepolia.chain.id, 84532);
    assert.equal(CHAINS.baseSepolia.envVar, "VITE_STORE_ADDRESS_BASE_SEPOLIA");
    assert.equal(CHAINS.sepolia.chain.id, 11155111);
    assert.equal(CHAINS.sepolia.envVar, "VITE_STORE_ADDRESS_SEPOLIA");
  });

  it("deploys with treasury = deployer and seeds ids 1..16 in order", async () => {
    const walletClient = walletOf(deployer);
    const address = await deployStore({ walletClient, publicClient, artifact });
    const store = storeAt(address);
    assert.equal(await store.read("treasury"), deployer);
    assert.equal(await store.read("owner"), deployer);

    const games = loadSeed();
    await seedCatalog({ walletClient, publicClient, address, abi, games, log: () => {} });
    assert.equal(await store.read("gameCount"), 16n);
    for (const g of games) {
      assert.deepEqual(await store.read("games", [BigInt(g.id)]), [deployer, g.price, g.royaltyBps, true, g.uri]);
    }

    // The seeded store works end to end: the free game can be claimed.
    await store.write(alice, "buy", [8n], 0n);
    assert.equal(await store.read("balanceOf", [alice, 8n]), 1n);

    // Seeding twice is refused.
    await assert.rejects(seedCatalog({ walletClient, publicClient, address, abi, games, log: () => {} }), /fresh deployment/);
  });
});
