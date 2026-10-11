import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

type T = { id: number; text: string; href?: string; ms: number };
const Ctx = createContext<(text: string, href?: string, ms?: number) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function Toasts({ children }: { children: ReactNode }) {
  const [list, setList] = useState<T[]>([]);
  const push = useCallback((text: string, href?: string, ms?: number) => {
    const id = Date.now() + Math.random();
    setList(l => [...l.slice(-2), { id, text, href, ms: ms ?? (href ? 8000 : 4200) }]);
  }, []);
  const drop = useCallback((id: number) => setList(l => l.filter(t => t.id !== id)), []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {list.map(t => <ToastItem key={t.id} t={t} onDone={drop} />)}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

/** One toast. Its timer pauses while it is hovered or focused, so the 'View' link can be reached. */
function ToastItem({ t, onDone }: { t: T; onDone(id: number): void }) {
  const timer = useRef(0);
  const stop = useCallback(() => window.clearTimeout(timer.current), []);
  const start = useCallback(() => { stop(); timer.current = window.setTimeout(() => onDone(t.id), t.ms); }, [stop, onDone, t]);
  useEffect(() => { start(); return stop; }, [start, stop]);
  return (
    <motion.div className="toast" initial={{ opacity: 0, y: -12, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}
      onPointerEnter={stop} onPointerLeave={start} onFocus={stop} onBlur={start}>
      {t.text}
      {t.href && <a href={t.href} target="_blank" rel="noreferrer">View</a>}
    </motion.div>
  );
}
