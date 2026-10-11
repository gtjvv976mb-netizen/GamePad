import { createContext, useContext, useEffect } from "react";
import { useIsPresent } from "motion/react";
import type { Scene } from "../three/Stage";

export const SceneCtx = createContext<(s: Scene) => void>(() => {});

/** A tab declares what the 3D stage should show while it's open. A tab fading out has no say. */
export function useScene(scene: Scene) {
  const set = useContext(SceneCtx);
  const present = useIsPresent();
  useEffect(() => { if (present) set(scene); }, [scene, set, present]);
}
