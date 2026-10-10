/** ETH amount with as many decimals as small prices need, trailing zeros trimmed. */
export const eth = (n: number) => {
  if (n === 0) return "Free";
  if (n < 0.00001) return "<0.00001 ETH";
  const d = n < 0.001 ? 5 : n < 1 ? 4 : 3;
  return `${Number(n.toFixed(d))} ETH`;
};
/** Fixed decimals for right-aligned columns, so the decimal points line up. */
export const ethCol = (n: number) => (n === 0 ? "Free" : `${n.toFixed(n < 0.001 ? 5 : 4)} ETH`);
export const short = (a?: string) => (a ? (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a) : "");

/** A wallet or network failure as one plain, active sentence. */
export const errorText = (e: unknown) => {
  const m = (e as { shortMessage?: string })?.shortMessage ?? (e as Error)?.message ?? "";
  if (/reject|denied/i.test(m)) return "You cancelled it in your wallet.";
  if (/insufficient funds/i.test(m)) return "Not enough test ETH in this wallet.";
  if (/provider not found|connector not found/i.test(m)) return "No wallet found in this browser. Try Coinbase Wallet.";
  return m.split("\n")[0] || "That didn't go through. Try again.";
};
