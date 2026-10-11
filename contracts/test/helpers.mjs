// Test harness: Hardhat's in-process EVM (EDR, no network, no compiler download) driven by viem.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  decodeErrorResult,
  getAddress,
  parseEventLogs,
} from "viem";
import { hardhat } from "viem/chains";
import { compile } from "../scripts/build.mjs";
import { deployStore, loadArtifact } from "../scripts/deploy.mjs";

// Point Hardhat at contracts/hardhat.config.cjs so the tests also run from outside contracts/.
process.env.HARDHAT_CONFIG ??= fileURLToPath(new URL("../hardhat.config.cjs", import.meta.url));
const { default: hre } = await import("hardhat");

export const artifact = loadArtifact(); // built by `npm test` before the tests run
export const abi = artifact.abi;

const transport = custom(hre.network.provider);
export const publicClient = createPublicClient({ chain: hardhat, transport, pollingInterval: 10 });
export const walletOf = (account) => createWalletClient({ account, chain: hardhat, transport, pollingInterval: 10 });

// Hardhat's unlocked, pre-funded accounts (checksummed, as viem returns them in reads/events). `deployer` owns the store.
export const [deployer, treasury, studio, alice, bob, carol, newTreasury] = (
  await publicClient.request({ method: "eth_accounts" })
).map((a) => getAddress(a)); // not .map(getAddress): the index would be read as a chainId

export const BPS = 10_000n;

/** Deploys a fresh store (owner = deployer) and returns a small wrapper around it. */
export async function deploy({ treasury: t = treasury, baseUri = "ipfs://base/{id}.json" } = {}) {
  const address = await deployStore({ walletClient: walletOf(deployer), publicClient, artifact, treasury: t, baseUri });
  return storeAt(address);
}

export function storeAt(address, contractAbi = abi) {
  return {
    address,
    read: (functionName, args = []) => publicClient.readContract({ address, abi: contractAbi, functionName, args }),
    /** Sends a tx from `from` and returns the mined receipt (Hardhat automines). */
    async write(from, functionName, args = [], value) {
      const hash = await walletOf(from).writeContract({ address, abi: contractAbi, functionName, args, value });
      const receipt = await publicClient.getTransactionReceipt({ hash });
      assert.equal(receipt.status, "success");
      return receipt;
    },
    events: (receipt, eventName) => parseEventLogs({ abi: contractAbi, logs: receipt.logs, eventName }),
  };
}

/** Publishes a game from `from` and returns its id. */
export async function publish(store, from, price, royaltyBps = 0, uri = "ipfs://game.json") {
  const receipt = await store.write(from, "publishGame", [price, royaltyBps, uri]);
  return store.events(receipt, "GamePublished")[0].args.id;
}

/** Custom error name + args of a failed call/tx. */
function decodeRevert(err) {
  const revert = err instanceof BaseError ? err.walk((e) => e instanceof ContractFunctionRevertedError) : null;
  if (revert?.data) return { name: revert.data.errorName, args: revert.data.args };
  // Hardhat's provider errors carry the raw revert data without a JSON-RPC error code, so viem
  // can't decode them itself; find the data in the cause chain and decode it with the store ABI.
  for (let e = err; e; e = e.cause) {
    if (typeof e.data === "string" && /^0x[0-9a-f]{8}/i.test(e.data)) {
      const { errorName, args } = decodeErrorResult({ abi, data: e.data });
      return { name: errorName, args };
    }
  }
  return { name: err.shortMessage ?? err.message };
}

/** Asserts that `promise` reverts with the store's custom error `errorName` (optionally with exact args). */
export async function expectRevert(promise, errorName, args) {
  await assert.rejects(promise, (err) => {
    const got = decodeRevert(err);
    assert.equal(got.name, errorName, `expected revert ${errorName}, got: ${got.name}`);
    if (args) assert.deepEqual(got.args, args);
    return true;
  });
}

/** ETH paid for gas by a mined tx. */
export const gasCost = (receipt) => receipt.gasUsed * receipt.effectiveGasPrice;

export const balanceOf = (address) => publicClient.getBalance({ address });

/** Compiles and deploys a test-only fixture contract from test/fixtures. */
export async function deployFixture(file, name, args = []) {
  const { [name]: c } = compile([`test/fixtures/${file}`]);
  const hash = await walletOf(deployer).deployContract({ abi: c.abi, bytecode: c.bytecode, args });
  const { contractAddress } = await publicClient.getTransactionReceipt({ hash });
  return storeAt(contractAddress, c.abi);
}
