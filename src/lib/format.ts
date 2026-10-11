/** SOL amount with as many decimals as small prices need, trailing zeros trimmed. */
export const sol = (n: number) => {
  if (n === 0) return "Free";
  if (n < 0.0001) return "<0.0001 SOL";
  const d = n < 0.01 ? 4 : n < 100 ? 3 : 2;
  return `${Number(n.toFixed(d))} SOL`;
};
/** Fixed decimals for right-aligned columns, so the decimal points line up. */
export const solCol = (n: number) => (n === 0 ? "Free" : `${n.toFixed(n < 0.01 ? 4 : 3)} SOL`);
/** A Solana address shortened to its first and last four characters; names pass through. */
export const short = (a?: string) => (a ? (a.length > 14 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a) : "");

/** A wallet or network failure as one plain, active sentence. */
export const errorText = (e: unknown) => {
  const m = (e as { shortMessage?: string })?.shortMessage ?? (e as Error)?.message ?? String(e ?? "");
  if (/reject|denied|cancel/i.test(m)) return "You cancelled it in your wallet.";
  if (/insufficient (funds|lamports)|debit an account|0x1\b|no record of a prior credit/i.test(m)) return "Not enough devnet SOL in this wallet. Get some free at faucet.solana.com.";
  if (/blockhash not found|block height exceeded|expired/i.test(m)) return "The network took too long. Try again.";
  if (/price changed/i.test(m)) return "The price changed. Check it and try again.";
  if (/no wallet/i.test(m)) return "No Solana wallet found in this browser. Try Phantom or Solflare.";
  return m.split("\n")[0] || "That didn't go through. Try again.";
};
