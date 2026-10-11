import { useMemo } from "react";
import { useStore, type Activity } from "../state/store";
import { useCatalog } from "../state/catalog";
import { useScene } from "../state/scene";
import { useSession } from "../web3/session";
import { NETWORK_NAME, STORE_PROGRAM, explorerAddress, explorerTx } from "../web3/config";
import { HOUSE_PALETTE } from "../data/games";
import { Sol } from "../ui/Sol";
import { IconExternal } from "../ui/Icons";
import { AGlyph } from "../ui/Logo";

const VERB: Record<Activity["kind"], string> = { buy: "Bought", "bought-used": "Bought used", list: "Listed", cancel: "Cancelled listing", sold: "Sold", publish: "Published" };

export function ProfileView() {
  const s = useSession();
  const store = useStore();
  const catalog = useCatalog();
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
                  <dt>Address</dt><dd><a className="mono" href={explorerAddress(s.address)} target="_blank" rel="noreferrer" title={s.address}>{s.address.slice(0, 6)}…{s.address.slice(-6)}</a></dd>
                  <dt>Network</dt><dd>{NETWORK_NAME}</dd>
                  <dt>Signed in</dt><dd>{s.signedIn ? "Yes" : <button className="linkish" onClick={() => s.signIn().catch(() => {})}>Sign in</button>}</dd>
                </>}
                <dt>Games owned</dt><dd><span className="mono">{games}</span></dd>
                {store.balance !== undefined && <><dt>Balance</dt><dd><span className="mono">{store.balance ? <Sol v={store.balance} /> : <>0<span className="u"> SOL</span></>}</span></dd></>}
              </dl>
              {store.mode === "live" && <p className="sub flush">Sales and royalties go straight to this wallet, so there is nothing to withdraw.</p>}
              {store.mode === "preview" && s.address && !STORE_PROGRAM && (
                <p className="sub flush">The store isn't on {NETWORK_NAME} yet, so purchases here are simulated.</p>
              )}
              <h3 className="panel-h3">Recent</h3>
              {store.activity.length ? (
                <ul className="acts">
                  {store.activity.slice(0, 5).map(a => (
                    <li key={a.at}>
                      <span><b>{VERB[a.kind] ?? a.kind}</b> {name(a.gameId)}</span>
                      <span className="mono"><Sol v={a.price} col />{a.tx && <> <a href={explorerTx(a.tx)} target="_blank" rel="noreferrer" aria-label="View transaction"><IconExternal /></a></>}</span>
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
