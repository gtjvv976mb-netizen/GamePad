/** ETH amount with as many decimals as small prices need, trailing zeros trimmed. */
export const eth = (n: number) => {
  if (n === 0) return "Free";
  if (n < 0.00001) return "<0.00001 ETH";
  const d = n < 0.001 ? 5 : n < 1 ? 4 : 3;
  return `${Number(n.toFixed(d))} ETH`;
};
export const short = (a?: string) => (a ? (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a) : "");
