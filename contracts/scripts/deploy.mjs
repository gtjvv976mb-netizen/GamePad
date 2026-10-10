// Deploys GamePadStore to a TESTNET with viem (treasury = deployer) and optionally seeds the catalog.
//
//   PRIVATE_KEY=0x... CHAIN=baseSepolia [RPC_URL=https://...] [BASE_URI=ipfs://...] npm run deploy [-- --seed]
//
// CHAIN is `baseSepolia` (default) or `sepolia`. Mainnets are deliberately not supported here.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, formatEther, http, parseEther, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia } from "viem/chains";
import { ARTIFACT_PATH, ROOT } from "./build.mjs";

export const CHAINS = {
  baseSepolia: { chain: baseSepolia, envVar: "VITE_STORE_ADDRESS_BASE_SEPOLIA" },
  sepolia: { chain: sepolia, envVar: "VITE_STORE_ADDRESS_SEPOLIA" },
};
export const SEED_PATH = join(ROOT, "seed-games.json");
const DEFAULT_BASE_URI = "ipfs://pending/{id}.json";

export function loadArtifact(path = ARTIFACT_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Reads seed-games.json into publishGame args: { id, slug, title, price (wei), royaltyBps, uri }. */
export function loadSeed(path = SEED_PATH) {
  const rows = JSON.parse(readFileSync(path, "utf8"));
  return rows.map((g, i) => {
    if (g.id !== i + 1) throw new Error(`seed entry ${i} has id ${g.id}; ids must be 1..n in order`);
    const royaltyBps = Math.round(g.royaltyPct * 100);
    if (royaltyBps < 0 || royaltyBps > 1500) throw new Error(`${g.slug}: royalty ${g.royaltyPct}% exceeds 15%`);
    return { id: g.id, slug: g.slug, title: g.title, price: parseEther(String(g.priceEth)), royaltyBps, uri: g.uri };
  });
}

/** Deploys the store; returns its address. */
export async function deployStore({ walletClient, publicClient, artifact, treasury, baseUri = DEFAULT_BASE_URI }) {
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [treasury ?? walletClient.account.address, baseUri],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`deploy failed: ${hash}`);
  return receipt.contractAddress;
}

/** Publishes every seed game in order (one tx each, awaited so nonces stay sequential) and checks the ids. */
export async function seedCatalog({ walletClient, publicClient, address, abi, games, log = console.log }) {
  const start = await publicClient.readContract({ address, abi, functionName: "gameCount" });
  if (start !== 0n) throw new Error(`store already has ${start} games; seeding expects a fresh deployment`);
  for (const g of games) {
    const hash = await walletClient.writeContract({
      address,
      abi,
      functionName: "publishGame",
      args: [g.price, g.royaltyBps, g.uri],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const [ev] = parseEventLogs({ abi, logs: receipt.logs, eventName: "GamePublished" });
    if (receipt.status !== "success" || ev?.args.id !== BigInt(g.id)) {
      throw new Error(`publishing ${g.slug} did not produce id ${g.id} (tx ${hash})`);
    }
    log(`  #${g.id} ${g.slug.padEnd(4)} ${g.title.padEnd(20)} ${formatEther(g.price)} ETH, royalty ${g.royaltyBps / 100}%`);
  }
}

async function main() {
  const seed = process.argv.includes("--seed");
  const chainName = process.env.CHAIN ?? "baseSepolia";
  const target = CHAINS[chainName];
  if (!target) throw new Error(`CHAIN must be one of: ${Object.keys(CHAINS).join(", ")} (got "${chainName}")`);
  let pk = process.env.PRIVATE_KEY?.trim();
  if (!pk) throw new Error("PRIVATE_KEY is not set (use a throwaway testnet key funded from a faucet)");
  if (!pk.startsWith("0x")) pk = `0x${pk}`;

  const account = privateKeyToAccount(pk);
  const transport = http(process.env.RPC_URL || undefined); // falls back to the chain's public RPC
  const publicClient = createPublicClient({ chain: target.chain, transport });
  const walletClient = createWalletClient({ account, chain: target.chain, transport });

  // Guard against an RPC_URL that points at a different network (e.g. a mainnet).
  const rpcChainId = await publicClient.getChainId();
  if (rpcChainId !== target.chain.id) {
    throw new Error(`RPC_URL is chain ${rpcChainId}, but CHAIN=${chainName} is ${target.chain.id}; refusing to deploy`);
  }
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Deployer ${account.address} on ${target.chain.name} (${formatEther(balance)} ETH)`);
  if (balance === 0n) throw new Error("deployer has no ETH; fund it from a testnet faucet first");

  const artifact = loadArtifact();
  const address = await deployStore({ walletClient, publicClient, artifact, baseUri: process.env.BASE_URI });
  console.log(`GamePadStore deployed at ${address}`);
  const explorer = target.chain.blockExplorers?.default.url;
  if (explorer) console.log(`  ${explorer}/address/${address}`);

  if (seed) {
    const games = loadSeed();
    console.log(`Seeding ${games.length} games...`);
    await seedCatalog({ walletClient, publicClient, address, abi: artifact.abi, games });
  }

  console.log("\nAdd this to the front-end .env:");
  console.log(`${target.envVar}=${address}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\nDeploy failed: ${err.shortMessage ?? err.message}`);
    process.exit(1);
  });
}
