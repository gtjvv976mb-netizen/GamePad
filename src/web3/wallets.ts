// Solana wallets through the Wallet Standard: Phantom, Solflare, Backpack and any other wallet that registers itself.
// Transactions are signed in the wallet and sent to devnet through our own RPC, so they land on devnet whatever
// network the wallet itself is showing.
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type {
  SolanaSignAndSendTransactionFeature, SolanaSignInFeature, SolanaSignInInput, SolanaSignMessageFeature, SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import {
  appendTransactionMessageInstructions, compileTransaction, createTransactionMessage, getBase58Decoder,
  getBase64Decoder, getTransactionEncoder, pipe, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash,
  type Address, type Base64EncodedWireTransaction, type Instruction, type Signature,
} from "@solana/kit";
import { ed25519 } from "@noble/curves/ed25519.js";
import { CHAIN, CLUSTER, rpc } from "./config";
import { assertDevnetRpc } from "./devnet";

type Connect = { "standard:connect": { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }> } };
type Disconnect = { "standard:disconnect"?: { disconnect(): Promise<void> } };
type Events = { "standard:events"?: { on(event: "change", cb: (p: { accounts?: readonly WalletAccount[] }) => void): () => void } };
type Features = Connect & Disconnect & Events & Partial<SolanaSignInFeature & SolanaSignMessageFeature & SolanaSignTransactionFeature & SolanaSignAndSendTransactionFeature>;
export type SolWallet = Wallet & { features: Features };

/** A wallet we can use: it connects, and it can sign a transaction one way or the other. */
const usable = (w: Wallet): w is SolWallet =>
  "standard:connect" in w.features && ("solana:signTransaction" in w.features || "solana:signAndSendTransaction" in w.features);

/** Installed Solana wallets, now and as they register (extensions often register after the page loads). */
export function watchWallets(cb: (ws: SolWallet[]) => void): () => void {
  const api = getWallets();
  const emit = () => cb(api.get().filter(usable));
  emit();
  const off = [api.on("register", emit), api.on("unregister", emit)];
  return () => off.forEach(f => f());
}

/* ---------------- Sign In With Solana ---------------- */

export type Proof = { address: string; message: string; signature: string; at: number };

const nonce = () => {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return getBase58Decoder().decode(b);
};

/** The message wallets show, in the Sign In With Solana format (the same lines the wallet builds itself). */
export function siwsMessage(i: Required<Pick<SolanaSignInInput, "domain" | "address" | "statement" | "uri" | "version" | "chainId" | "nonce" | "issuedAt">>) {
  return `${i.domain} wants you to sign in with your Solana account:\n${i.address}\n\n${i.statement}\n\nURI: ${i.uri}\nVersion: ${i.version}\nChain ID: ${i.chainId}\nNonce: ${i.nonce}\nIssued At: ${i.issuedAt}`;
}

/** Asks the wallet to sign in; checks the signature and that the message is ours before trusting it. */
export async function signIn(wallet: SolWallet, account: WalletAccount): Promise<Proof> {
  const input = {
    domain: location.host || "gamepad.local",
    address: account.address,
    statement: "Sign in to GamePad. This is free and doesn't send a transaction.",
    uri: location.origin.startsWith("http") ? location.origin : "https://gamepad.local",
    version: "1", chainId: CLUSTER, nonce: nonce(), issuedAt: new Date().toISOString(),
  };
  let bytes: Uint8Array, signature: Uint8Array, address = account.address, key = account.publicKey;
  const f = wallet.features;
  if (f["solana:signIn"]) {
    const [out] = await f["solana:signIn"].signIn(input);
    ({ signedMessage: bytes, signature } = out);
    address = out.account.address; key = out.account.publicKey;
  } else if (f["solana:signMessage"]) {
    bytes = new TextEncoder().encode(siwsMessage(input));
    [{ signature }] = await f["solana:signMessage"].signMessage({ account, message: bytes });
  } else throw new Error("This wallet can't sign messages. Try Phantom or Solflare.");

  const message = new TextDecoder().decode(bytes);
  const ours = message.includes(input.nonce) && message.startsWith(`${input.domain} wants you to sign in`) && message.includes(address);
  if (!ours || address !== account.address || !ed25519.verify(signature, bytes, new Uint8Array(key)))
    throw new Error("That signature didn't match this wallet.");
  return { address, message, signature: getBase58Decoder().decode(signature), at: Date.now() };
}

/* ---------------- transactions ---------------- */

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Signs the instructions as one transaction in the wallet, sends it to devnet and waits until it is confirmed. */
export async function sendWithWallet(wallet: SolWallet, account: WalletAccount, instructions: readonly Instruction[]): Promise<string> {
  await assertDevnetRpc(rpc);
  const f = wallet.features;
  const versions = f["solana:signTransaction"]?.supportedTransactionVersions ?? f["solana:signAndSendTransaction"]?.supportedTransactionVersions ?? ["legacy"];
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const msg = pipe(
    createTransactionMessage({ version: versions.includes(0) ? 0 : "legacy" }),
    m => setTransactionMessageFeePayer(account.address as Address, m),
    m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    m => appendTransactionMessageInstructions(instructions, m),
  );
  const wire = new Uint8Array(getTransactionEncoder().encode(compileTransaction(msg)));

  let sig: string;
  if (f["solana:signTransaction"]) {
    const [{ signedTransaction }] = await f["solana:signTransaction"].signTransaction({ account, chain: CHAIN, transaction: wire });
    const b64 = getBase64Decoder().decode(signedTransaction) as Base64EncodedWireTransaction;
    sig = await rpc.sendTransaction(b64, { encoding: "base64", preflightCommitment: "confirmed" }).send();
  } else {
    const [{ signature }] = await f["solana:signAndSendTransaction"]!.signAndSendTransaction({ account, chain: CHAIN, transaction: wire });
    sig = getBase58Decoder().decode(signature);
  }

  // Poll until confirmed; the blockhash expires after about a minute, so stop well after that.
  for (let i = 0; i < 90; i++) {
    const { value: [st] } = await rpc.getSignatureStatuses([sig as Signature]).send();
    if (st?.err) throw new Error(`The transaction failed on devnet: ${JSON.stringify(st.err, (_, v) => typeof v === "bigint" ? Number(v) : v)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    await wait(1000);
  }
  throw new Error("The network took too long. Check your wallet's activity before trying again.");
}

export const balanceOf = async (a: string) => (await rpc.getBalance(a as Address, { commitment: "confirmed" }).send()).value;
