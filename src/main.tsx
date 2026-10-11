import { StrictMode } from "react";
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

const queryClient = new QueryClient();

/** Real contract on a configured test network, otherwise the in-browser preview. */
function StoreSwitch() {
  const s = useSession();
  return s.live
    ? <LiveStore key={s.chainId} chainId={s.chainId}><App /></LiveStore>
    : <PreviewStore><App /></PreviewStore>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* with Reduce motion on, every Motion transform snaps and only the fades remain */}
    <MotionConfig reducedMotion="user">
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <Toasts>
            <SessionProvider>
              <StoreSwitch />
            </SessionProvider>
          </Toasts>
        </QueryClientProvider>
      </WagmiProvider>
    </MotionConfig>
  </StrictMode>,
);
