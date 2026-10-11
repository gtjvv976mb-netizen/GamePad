import { StrictMode, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import { config } from "./web3/config";
import { SessionProvider, useSession } from "./web3/session";
import { LiveStore } from "./web3/LiveStore";
import { PreviewStore } from "./state/store";
import { Toasts } from "./ui/Toast";
import App from "./App";
import { motionMode, subscribeMotion } from "./lib/motion";

const queryClient = new QueryClient();

// The motion mode on <html>, for the stylesheet, and the pointer as --px/--py in -1..1 for the world's parallax.
const root = document.documentElement;
const mark = () => { root.dataset.motion = motionMode(); if (motionMode() !== "full") { root.style.setProperty("--px", "0"); root.style.setProperty("--py", "0"); } };
mark();
subscribeMotion(mark);
let frame = 0, px = 0, py = 0;
addEventListener("pointermove", e => {
  px = (e.clientX / innerWidth) * 2 - 1; py = (e.clientY / innerHeight) * 2 - 1;
  if (frame || motionMode() !== "full") return;
  frame = requestAnimationFrame(() => { frame = 0; root.style.setProperty("--px", px.toFixed(3)); root.style.setProperty("--py", py.toFixed(3)); });
}, { passive: true });

/** Motion's own animations follow the mode: all of them at full, transforms snap when calm or stopped. */
function Moves({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribeMotion, motionMode, () => "full" as const);
  return <MotionConfig reducedMotion={mode === "full" ? "never" : "always"}>{children}</MotionConfig>;
}

/** Real contract on a configured test network, otherwise the in-browser preview. */
function StoreSwitch() {
  const s = useSession();
  return s.live
    ? <LiveStore key={s.chainId} chainId={s.chainId}><App /></LiveStore>
    : <PreviewStore><App /></PreviewStore>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Moves>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <Toasts>
            <SessionProvider>
              <StoreSwitch />
            </SessionProvider>
          </Toasts>
        </QueryClientProvider>
      </WagmiProvider>
    </Moves>
  </StrictMode>,
);
