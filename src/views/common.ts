import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "../web3/session";
import { useStore } from "../state/store";
import { useToast } from "../ui/Toast";
import { errorText } from "../lib/format";

// One store action at a time: a second A press, Enter or click while one runs is ignored.
let inflight = false;

/** Run a store action once there's someone to act as; otherwise open the wallet sheet. */
export function useAct() {
  const s = useSession();
  const store = useStore();
  const toast = useToast();
  return useCallback(async (fn: () => Promise<unknown>, done?: string) => {
    if (!s.address && !s.guest) { s.open(); return; }
    if (inflight || store.busy) return;
    inflight = true;
    try {
      const r = await fn();
      if (done) toast(done, typeof r === "string" ? r : undefined);
    } catch (e) {
      toast(errorText(e), undefined, 8000);
    } finally {
      inflight = false;
    }
  }, [s, toast, store.busy]);
}

/** How many items fit in a box, recomputed on resize. Item size is the box's --item, the gap its CSS gap. */
export function useFit(ref: React.RefObject<HTMLElement | null>, axis: "x" | "y", min = 1, max = 99, dep?: unknown) {
  const [n, setN] = useState(min);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cs = getComputedStyle(el);
      const gap = parseFloat(axis === "x" ? cs.columnGap : cs.rowGap) || 0;
      const item = parseFloat(cs.getPropertyValue("--item")) || 1;
      const size = axis === "x" ? el.clientWidth : el.clientHeight;
      setN(Math.max(min, Math.min(max, Math.floor((size + gap) / (item + gap)))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, axis, min, max, dep]);
  return n;
}

const NARROW = "(max-width: 820px)";
const onNarrow = (cb: () => void) => {
  const m = matchMedia(NARROW);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
/** Phone layout (tabs on top), live across rotation and resize. Matches the CSS breakpoint. */
export const useNarrow = () => useSyncExternalStore(onNarrow, () => matchMedia(NARROW).matches, () => false);
