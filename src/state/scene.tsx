import { createContext, useContext, useEffect } from "react";
import type { Scene } from "../three/Stage";

export const SceneCtx = createContext<(s: Scene) => void>(() => {});

/** A tab declares what the 3D stage should show while it's open. */
export function useScene(scene: Scene) {
  const set = useContext(SceneCtx);
  useEffect(() => { set(scene); }, [scene, set]);
}
