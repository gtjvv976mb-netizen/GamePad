import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

type T = { id: number; text: string; href?: string };
const Ctx = createContext<(text: string, href?: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function Toasts({ children }: { children: ReactNode }) {
  const [list, setList] = useState<T[]>([]);
  const push = useCallback((text: string, href?: string) => {
    const id = Date.now() + Math.random();
    setList(l => [...l.slice(-2), { id, text, href }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {list.map(t => (
            <motion.div key={t.id} className="toast" initial={{ opacity: 0, y: 16, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>
              {t.text}
              {t.href && <a href={t.href} target="_blank" rel="noreferrer">View</a>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
