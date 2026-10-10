import { useMemo } from "react";
import { TopBar, type Go } from "../App";
import { useStore, type Activity } from "../state/store";
import { useCatalog } from "../state/catalog";
import { useScene } from "../state/scene";
import { useSession } from "../web3/session";
import { CHAINS, STORE_ADDRESS, chainName, explorerTx, type ChainId } from "../web3/config";
import { eth } from "../lib/format";
import { useAct } from "./common";
import { IconExternal } from "../ui/Icons";

const PALETTE: [string, string, string] = ["#0c0c12", "#221c33", "#c9a7ff"];
const VERB: Record<Activity["kind"], string> = { buy: "Bought", "bought-used": "Bought used", list: "Listed", cancel: "Cancelled listing", sold: "Sold", withdraw: "Withdrew", publish: "Published" };

export function ProfileView({ go }: { go: Go }) {
  const s = useSession();
  const store = useStore();
  const catalog = useCatalog();
  const act = useAct();
  const scene = useMemo(() => ({ kind: "logo" as const, palette: PALETTE }), []);
  useScene(scene);
  const copies = Object.values(store.owned).reduce((a, b) => a + b, 0);
  const name = (id: number) => catalog.find(g => g.chainId === id)?.title ?? `Game #${id}`;

  return (
    <>
      <TopBar crumb="Profile" />
      <div className="split" style={{ gridTemplateColumns: "minmax(320px, 460px) minmax(0, 1fr)" }}>
        <section className="panel" aria-labelledby="pf-h">
          <h2 id="pf-h">{s.address ? "Your wallet" : s.guest ? "Guest" : "Not connected"}</h2>
          {!s.address && !s.guest ? (
            <>
              <p className="sub" style={{ margin: "0 0 14px" }}>Your wallet is your account. Connect one to buy games, keep them, and sell them on.</p>
              <button className="btn primary" onClick={s.open}><span className="glyph">A</span>Connect a wallet</button>
            </>
          ) : (
            <>
              <dl className="kv">
                <dt>Address</dt><dd>{s.address ? <span title={s.address}>{s.address.slice(0, 8)}…{s.address.slice(-6)}</span> : "Guest (preview)"}</dd>
                {s.address && <><dt>Network</dt><dd>
                  <select aria-label="Network" value={s.chainId} onChange={e => s.switchTo(+e.target.value as ChainId)} style={{ background: "none", border: 0, color: "inherit", font: "inherit", textAlign: "right" }}>
                    {CHAINS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </dd></>}
                {s.address && <><dt>Signed in</dt><dd>{s.signedIn ? "Yes" : <button className="linkish" onClick={() => s.signIn().catch(() => {})}>Sign in</button>}</dd></>}
                <dt>Mode</dt><dd>{store.mode === "live" ? "Live on test network" : "Preview"}</dd>
                <dt>Games owned</dt><dd>{copies}</dd>
                <dt>Earnings</dt><dd>{eth(store.owedEth).replace("Free", "0 ETH")}</dd>
              </dl>
              {store.mode === "preview" && s.address && !STORE_ADDRESS[s.chainId] && (
                <p className="sub" style={{ margin: "0 0 12px" }}>The store contract isn't deployed on {chainName(s.chainId)} yet, so purchases here are simulated.</p>
              )}
              <div className="actions" style={{ marginBottom: 16 }}>
                <button className="btn primary sm" disabled={store.owedEth <= 0} onClick={() => act(() => store.withdraw(), "Earnings sent to your wallet")}>Withdraw earnings</button>
                <button className="btn sm" onClick={() => go("library")}>Library</button>
                <button className="btn sm" onClick={s.signOut}>{s.address ? "Disconnect" : "Leave preview"}</button>
              </div>
              <h2 style={{ fontSize: 18, marginBottom: 8 }}>Recent</h2>
              {store.activity.length ? (
                <ul className="acts">
                  {store.activity.slice(0, 5).map(a => (
                    <li key={a.at}>
                      <span><b>{VERB[a.kind]}</b> {a.kind === "withdraw" ? "" : name(a.gameId)}</span>
                      <span className="mono">{eth(a.priceEth)}{a.tx && s.chainId && explorerTx(s.chainId, a.tx) && <> <a href={explorerTx(s.chainId, a.tx)} target="_blank" rel="noreferrer" aria-label="View transaction" style={{ color: "inherit" }}><IconExternal /></a></>}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="sub" style={{ margin: 0 }}>Nothing yet. Buy, sell or publish a game and it shows up here.</p>}
              {store.reset && <p style={{ margin: "14px 0 0" }}><button className="linkish" onClick={store.reset}>Reset preview data</button></p>}
            </>
          )}
        </section>
        <div className="spacer-3d" />
      </div>
      <div />
    </>
  );
}
