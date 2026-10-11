import { useMemo } from "react";
import { useStore, type Activity } from "../state/store";
import { useCatalog } from "../state/catalog";
import { useScene } from "../state/scene";
import { useSession } from "../web3/session";
import { CHAINS, STORE_ADDRESS, chainName, explorerTx, type ChainId } from "../web3/config";
import { useAct } from "./common";
import { HOUSE_PALETTE } from "../data/games";
import { Eth } from "../ui/Eth";
import { IconExternal } from "../ui/Icons";
import { AGlyph } from "../ui/Logo";

const VERB: Record<Activity["kind"], string> = { buy: "Bought", "bought-used": "Bought used", list: "Listed", cancel: "Cancelled listing", sold: "Sold", withdraw: "Withdrew", publish: "Published" };

export function ProfileView() {
  const s = useSession();
  const store = useStore();
  const catalog = useCatalog();
  const act = useAct();
  const scene = useMemo(() => ({ kind: "logo" as const, palette: HOUSE_PALETTE }), []);
  useScene(scene);
  const games = Object.values(store.owned).filter(n => n > 0).length; // titles, as the Library counts them
  const name = (id: number) => catalog.find(g => g.chainId === id)?.title ?? `Game #${id}`;

  return (
    <>
      <div className="split lead slim">
        <section className="panel" aria-labelledby="pf-h">
          <h2 id="pf-h">{s.address ? "Your wallet" : s.guest ? "Guest" : "Not connected"}</h2>
          {!s.address && !s.guest ? (
            <>
              <p className="sub flush">Your wallet is your account. Connect one to buy games, keep them, and sell them on.</p>
              <button className="btn primary" onClick={s.open}><AGlyph />Connect wallet</button>
            </>
          ) : (
            <>
              <dl className="kv">
                {s.address && <>
                  <dt>Address</dt><dd><span className="mono" title={s.address}>{s.address.slice(0, 8)}…{s.address.slice(-6)}</span></dd>
                  <dt>Network</dt><dd>
                    <select aria-label="Network" value={s.chainId} onChange={e => s.switchTo(+e.target.value as ChainId)}>
                      {CHAINS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </dd>
                  <dt>Signed in</dt><dd>{s.signedIn ? "Yes" : <button className="linkish" onClick={() => s.signIn().catch(() => {})}>Sign in</button>}</dd>
                </>}
                <dt>Games owned</dt><dd><span className="mono">{games}</span></dd>
                <dt>Earnings</dt><dd><span className="mono">{store.owedEth ? <Eth v={store.owedEth} /> : <>0<span className="u"> ETH</span></>}</span></dd>
              </dl>
              {store.mode === "preview" && s.address && !STORE_ADDRESS[s.chainId] && (
                <p className="sub flush">The store contract isn't deployed on {chainName(s.chainId)} yet, so purchases here are simulated.</p>
              )}
              {store.owedEth > 0 && (
                <div className="actions mb">
                  <button className="btn primary sm" onClick={() => act(() => store.withdraw(), "Earnings sent to your wallet")}>Withdraw earnings</button>
                </div>
              )}
              <h3 className="panel-h3">Recent</h3>
              {store.activity.length ? (
                <ul className="acts">
                  {store.activity.slice(0, 5).map(a => (
                    <li key={a.at}>
                      <span><b>{VERB[a.kind]}</b> {a.kind === "withdraw" ? "" : name(a.gameId)}</span>
                      <span className="mono"><Eth v={a.priceEth} col />{a.tx && s.chainId && explorerTx(s.chainId, a.tx) && <> <a href={explorerTx(s.chainId, a.tx)} target="_blank" rel="noreferrer" aria-label="View transaction"><IconExternal /></a></>}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="sub last">Nothing yet. Buy, sell or publish a game and it shows up here.</p>}
              <p className="links">
                <button className="linkish" onClick={s.signOut}>{s.address ? "Disconnect" : "Leave preview"}</button>
                {store.reset && <button className="linkish" onClick={store.reset}>Reset preview data</button>}
              </p>
            </>
          )}
        </section>
        <div className="spacer-3d" />
      </div>
      <div />
    </>
  );
}
