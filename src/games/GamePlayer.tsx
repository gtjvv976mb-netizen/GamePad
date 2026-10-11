import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { suspendStoreNavigation } from "../input/nav";
import { campaignFor, offlineGameUrl } from "./campaigns";
import "./player.css";

export type PlayGame = (slug: string, demo?: boolean) => void;
export type GameLaunch = { slug: string; demo: boolean };

export function GamePlayer({ launch, close }: { launch: GameLaunch; close: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const campaign = campaignFor(launch.slug)!;
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  // The standalone game polls its own controller. Store navigation must stop during play.
  useLayoutEffect(suspendStoreNavigation, []);
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== location.origin || e.data?.slug !== launch.slug) return;
      if (e.data.type === "gamepad-close" || e.data.type === "gamepad-saved") close();
    };
    addEventListener("message", receive);
    const previous = previousFocus.current;
    return () => { removeEventListener("message", receive); clearTimeout(timer.current); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [close, launch.slug]);
  function back() {
    frame.current?.contentWindow?.postMessage({ type: "gamepad-save" }, location.origin);
    timer.current = setTimeout(close, 300); // Closing is still possible if the frame failed to load.
  }
  return <section className="game-player" role="dialog" aria-modal="true" aria-label={`${campaign.title} campaign`}>
    <div className="player-bar">
      <button className="btn sm" onClick={back}>Back to GamePad</button>
      <span>{launch.demo ? "First chapter demo" : `${campaign.chapters.length} chapter campaign`}</span>
      {!launch.demo && <a className="btn sm" href={offlineGameUrl(launch.slug)} download={`${launch.slug}-gamepad-offline.html`}>Download offline</a>}
    </div>
    {!loaded && <div className="player-loading" role="status">Loading {campaign.title}…</div>}
    <iframe ref={frame} title={`${campaign.title} game`} src={offlineGameUrl(launch.slug, launch.demo)} allow="gamepad; fullscreen" onLoad={() => { setLoaded(true); frame.current?.contentWindow?.focus(); }} />
  </section>;
}
