import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { motionOff, subscribeMotion } from "../lib/motion";
import { keepPlaying } from "../lib/media";
import { markIntroSeen, reveal, saveData, WANTS_INTRO } from "../lib/show";
import { useNarrow } from "../views/common";

/** Seconds into the fly-in when the camera bursts out of the warp and the interface comes in. */
const ARRIVE = 2.5;

/**
 * The world behind the store: a Higgsfield clip of floating game worlds joined by bridges of foil light, looped
 * seamlessly under the 3D stage. On the first visit of a session it opens with a second Higgsfield clip, a
 * fly-in through a warp tunnel that lands on the loop's first frame. Phones get portrait cuts of both. With
 * the stop button pressed it rests on a still; with Data Saver on it only ever shows the still.
 * `tint` is the selected game's color, washed softly over the clip.
 */
export function World({ tint }: { tint: string }) {
  const narrow = useNarrow();
  const off = useSyncExternalStore(subscribeMotion, motionOff, () => false);
  const cut = narrow ? "phone" : "1080";
  const poster = `./world/poster-${cut}.jpg`;
  const loop = useRef<HTMLVideoElement>(null);
  const intro = useRef<HTMLVideoElement>(null);
  const [flying, setFlying] = useState(WANTS_INTRO);
  const [leaving, setLeaving] = useState(false);

  // the loop plays whenever the fly-in is not covering it, and already under the cross-fade
  useEffect(() => {
    const v = loop.current;
    if (!v || (flying && !leaving)) return;
    return keepPlaying(v);
  }, [flying, leaving, cut]);

  // the fly-in: play once, bring the interface in as the camera arrives, then cross-fade into the loop
  useEffect(() => {
    const v = intro.current, l = loop.current;
    if (!flying || !v || !l) return;
    let done = false, started = false;
    const land = (fast: boolean) => {
      if (done) return;
      done = true;
      reveal();
      l.currentTime = 0;
      setLeaving(true);
      setTimeout(() => setFlying(false), fast ? 350 : 700);
    };
    const onTime = () => {
      if (v.currentTime >= ARRIVE) reveal();
      if (v.duration && v.currentTime >= v.duration - 0.6) land(false);
    };
    const skip = () => land(true);
    v.muted = true;
    v.play().then(() => { started = true; markIntroSeen(); }, skip);
    // a clip that has not started within 1.5 s (slow network) is skipped rather than waited for
    const late = setTimeout(() => { if (!started) skip(); }, 1500);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", skip);
    // any tap or key during the fly-in skips straight to the store
    addEventListener("pointerdown", skip, { once: true, capture: true });
    addEventListener("keydown", skip, { once: true, capture: true });
    return () => {
      clearTimeout(late);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", skip);
      removeEventListener("pointerdown", skip, { capture: true });
      removeEventListener("keydown", skip, { capture: true });
    };
  }, [flying]);

  // the stop button during the fly-in ends it
  useEffect(() => { if (off && flying) { reveal(); setFlying(false); } }, [off, flying]);

  return (
    <div className="world" aria-hidden="true" style={{ "--tint": tint } as CSSProperties}>
      {saveData()
        ? <img src={poster} alt="" />
        : (
          <video key={cut} ref={loop} className="loop" poster={poster} muted loop playsInline preload="auto" disablePictureInPicture>
            <source src={`./world/world-${cut}.webm`} type='video/webm; codecs="vp9"' />
            <source src={`./world/world-${cut}.mp4`} type="video/mp4" />
          </video>
        )}
      {flying && (
        <video ref={intro} className={`intro ${leaving ? "leaving" : ""}`} muted playsInline preload="auto" disablePictureInPicture>
          <source src={`./world/intro-${cut}.webm`} type='video/webm; codecs="vp9"' />
          <source src={`./world/intro-${cut}.mp4`} type="video/mp4" />
        </video>
      )}
      <div className="tint" />
    </div>
  );
}
