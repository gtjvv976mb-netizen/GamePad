// Sets up the GamePad store on Solana DEVNET and publishes the 16 seed games in catalog order, so on-chain game ids
// match `chainId` in src/data/games.ts. Safe to re-run: it skips what is already there.
//
//   STORE_PROGRAM=<program id> [TREASURY=<address>] [STUDIO_KEYPAIR=path] [KEYPAIR=~/.config/solana/id.json]
//   [RPC_URL=https://api.devnet.solana.com] node program/scripts/seed.mjs
//
// KEYPAIR pays and becomes the store authority. STUDIO_KEYPAIR publishes the seed games and receives their sales and
// royalties; a new one is made and saved to program/.keys/studio.json if missing. TREASURY receives GamePad's 10% fee
// and must not be the studio (defaults to KEYPAIR). Every recipient is topped up to stay rent-exempt, because the
// runtime refuses a small payment into an account that would be left below the rent-exempt minimum.
// Only devnet is supported: the script stops if RPC_URL points anywhere else.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AccountRole, address, appendTransactionMessageInstructions, createKeyPairSignerFromBytes, createSolanaRpc, createTransactionMessage,
  generateKeyPairSigner, getBase64EncodedWireTransaction, getSignatureFromTransaction, getU32Encoder, getU64Encoder, pipe,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners,
} from "@solana/kit";
import { GAMES } from "../../src/data/games.ts";
import { decodeGame, decodeStore, gamePda, initializeIx, publishGameIx, storePda, SYSTEM_PROGRAM } from "../../src/web3/storeProgram.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const FEE_BPS = 1000;
const LAMPORTS = 1_000_000_000n;
const lamports = sol => BigInt(Math.round(sol * 1e9));

if (!/devnet/.test(RPC_URL)) throw new Error(`RPC_URL must be a devnet endpoint (got ${RPC_URL}). Mainnet waits for the owner's go-ahead.`);
if (!process.env.STORE_PROGRAM) throw new Error("STORE_PROGRAM is not set (the program id printed by `anchor deploy`)");
const program = address(process.env.STORE_PROGRAM);
const rpc = createSolanaRpc(RPC_URL);

const readKey = path => createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path, "utf8"))));
const payer = await readKey((process.env.KEYPAIR || "~/.config/solana/id.json").replace(/^~/, homedir()));

async function studioKey() {
  const path = process.env.STUDIO_KEYPAIR || join(HERE, "..", ".keys", "studio.json");
  if (existsSync(path)) return readKey(path);
  // generate an extractable key so it can be saved for the next run
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const sk = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).slice(-32);
  const pk = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify([...sk, ...pk]), { mode: 0o600 });
  console.log(`New studio key saved to ${path}`);
  return readKey(path);
}
const studio = await studioKey();
const treasury = address(process.env.TREASURY || payer.address);
if (treasury === studio.address) throw new Error("TREASURY must be a different address from the studio");

const wait = ms => new Promise(r => setTimeout(r, ms));
async function send(feePayer, instructions) {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    m => setTransactionMessageFeePayerSigner(feePayer, m),
    m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    m => appendTransactionMessageInstructions(instructions, m),
  );
  const tx = await signTransactionMessageWithSigners(msg);
  const sig = getSignatureFromTransaction(tx);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" }).send();
  for (let i = 0; i < 90; i++) {
    const { value: [st] } = await rpc.getSignatureStatuses([sig]).send();
    if (st?.err) throw new Error(`transaction ${sig} failed: ${JSON.stringify(st.err, (_, v) => typeof v === "bigint" ? Number(v) : v)}`);
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return sig;
    await wait(1000);
  }
  throw new Error(`transaction ${sig} was not confirmed in time`);
}

/** A System Program transfer, with the payer signing. */
const transfer = (to, amount) => ({
  programAddress: SYSTEM_PROGRAM,
  accounts: [{ address: payer.address, role: AccountRole.WRITABLE_SIGNER, signer: payer }, { address: to, role: AccountRole.WRITABLE }],
  data: new Uint8Array([...getU32Encoder().encode(2), ...getU64Encoder().encode(amount)]),
});
const balance = async a => (await rpc.getBalance(a, { commitment: "confirmed" }).send()).value;
async function topUp(to, min, label) {
  const have = await balance(to);
  if (have >= min) return;
  await send(payer, [transfer(to, min - have)]);
  console.log(`Funded ${label} ${to} with ${Number(min - have) / 1e9} SOL`);
}

console.log(`Program   ${program}\nAuthority ${payer.address} (${Number(await balance(payer.address)) / 1e9} SOL)\nStudio    ${studio.address}\nTreasury  ${treasury}`);
await topUp(studio.address, LAMPORTS / 10n, "the studio"); // rent for 16 game accounts, plus fees
await topUp(treasury, LAMPORTS / 100n, "the treasury");

const storeAddr = await storePda(program);
const read = async a => {
  const v = (await rpc.getAccountInfo(a, { encoding: "base64", commitment: "confirmed" }).send()).value;
  return v ? new Uint8Array(Buffer.from(v.data[0], "base64")) : undefined;
};
let store = await read(storeAddr).then(b => b && decodeStore(b));
if (!store) {
  const sig = await send(payer, [await initializeIx(program, payer.address, FEE_BPS, treasury)]);
  console.log(`Store set up: fee ${FEE_BPS / 100}%, treasury ${treasury} (${sig})`);
  store = decodeStore(await read(storeAddr));
}

for (const g of GAMES) {
  const id = BigInt(g.chainId);
  const existing = await read(await gamePda(program, id)).then(b => b && decodeGame(b));
  if (existing) { console.log(`  #${id} ${g.slug} already published`); continue; }
  if (store.gameCount + 1n !== id) throw new Error(`the store's next game id is ${store.gameCount + 1n}, but ${g.slug} needs ${id}; seed a fresh store`);
  const ix = await publishGameIx(program, studio.address, id, { price: lamports(g.price), royaltyBps: Math.round(g.royaltyPct * 100), uri: `ipfs://pending/${g.slug}.json` });
  // the studio signs and pays its own rent
  ix.accounts[2] = { ...ix.accounts[2], signer: studio };
  const sig = await send(studio, [ix]);
  store = decodeStore(await read(storeAddr));
  console.log(`  #${id} ${g.slug.padEnd(4)} ${g.title.padEnd(20)} ${g.price} SOL, royalty ${g.royaltyPct}% (${sig.slice(0, 12)}…)`);
}
console.log(`Done. Set the repository variable VITE_STORE_PROGRAM_DEVNET=${program} and run the Pages deploy.`);
