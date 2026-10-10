import { useCallback, useEffect, useState } from "react";
import { useSession } from "../web3/session";
import { useToast } from "../ui/Toast";

/** Run a store action once there's someone to act as; otherwise open the wallet sheet. */
export function useAct() {
  const s = useSession();
  const toast = useToast();
  return useCallback(async (fn: () => Promise<unknown>, done?: string) => {
    if (!s.address && !s.guest) { s.open(); return; }
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      const m = (e as { shortMessage?: string })?.shortMessage ?? (e as Error)?.message ?? "That didn't go through.";
      toast(/reject|denied/i.test(m) ? "Cancelled in your wallet" : m.split("\n")[0]);
    }
  }, [s, toast]);
}

/** How many items of a given size fit in a box, recomputed on resize. */
export function useFit(ref: React.RefObject<HTMLElement | null>, item: number, gap: number, axis: "x" | "y" = "x", min = 1, max = 99) {
  const [n, setN] = useState(min);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const size = axis === "x" ? el.clientWidth : el.clientHeight;
      setN(Math.max(min, Math.min(max, Math.floor((size + gap) / (item + gap)))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, item, gap, axis, min, max]);
  return n;
}

export const isNarrow = () => typeof window !== "undefined" && window.innerWidth <= 820;
