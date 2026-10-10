import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { reducedMotion, subscribeReducedMotion } from "../lib/motion";
import { useNarrow } from "../views/common";

type Saver = Navigator & { connection?: { saveData?: boolean } };
const saveData = () => typeof navigator !== "undefined" && !!(navigator as Saver).connection?.saveData;

/**
 * The world behind the store: a Higgsfield clip of floating game worlds joined by bridges of foil light,
 * looped seamlessly under the 3D stage. Phones get a portrait cut. With Reduce motion or Data Saver on,
 * it rests on its first frame. `tint` is the selected game's color, washed softly over the clip.
 */
export function World({ tint }: { tint: string }) {
  const narrow = useNarrow();
  const still = useSyncExternalStore(subscribeReducedMotion, reducedMotion, () => false);
  const cut = narrow ? "phone" : "1080";
  const poster = `./world/poster-${cut}.jpg`;
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // React sets `muted` as a property only, and some browsers refuse to autoplay without it set first
    v.muted = true;
    if (still) v.pause();
    else v.play().catch(() => { /* autoplay refused: the poster stays */ });
  }, [still, cut]);

  return (
    <div className="world" aria-hidden="true" style={{ "--tint": tint } as CSSProperties}>
      {saveData()
        ? <img src={poster} alt="" />
        : (
          <video key={cut} ref={ref} poster={poster} muted loop playsInline autoPlay={!still} preload="auto" disablePictureInPicture>
            <source src={`./world/world-${cut}.webm`} type='video/webm; codecs="vp9"' />
            <source src={`./world/world-${cut}.mp4`} type="video/mp4" />
          </video>
        )}
      <div className="tint" />
    </div>
  );
}
