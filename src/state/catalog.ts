import { useMemo } from "react";
import type * as THREE from "three";
import { GAMES, HOUSE_PALETTE, type Game } from "../data/games";
import { useStore, type CustomGame } from "./store";
import { coverTexture, imageTexture, titleTexture } from "../three/textures";

export type Entry = Game & { custom?: CustomGame; active?: boolean };

const PALETTE = HOUSE_PALETTE;

/** Keep seed presentation while using the chain's current sale terms and published titles. */
export function useCatalog(): Entry[] {
  const { published, catalogUpdates } = useStore();
  return useMemo(() => [
    ...GAMES.map(g => ({ ...g, ...catalogUpdates?.[g.chainId] })),
    ...published.map<Entry>(p => ({
      slug: `custom-${p.chainId}`, chainId: p.chainId, title: p.title, studio: p.studio ?? "You", genre: p.genre, price: p.price,
      royaltyPct: p.royaltyPct, tags: [p.genre], blurb: p.studio && p.studio !== "You" ? "A new release from an independent studio." : "Published from your Studio.", palette: PALETTE, custom: p, active: p.active,
    })),
  ], [published, catalogUpdates]);
}

export function textureFor(e: Entry): THREE.Texture {
  if (!e.custom) return coverTexture(e);
  return e.custom.cover ? imageTexture(e.custom.cover) : titleTexture(e.title, e.palette);
}

export const thumbFor = (e: Entry) => e.custom ? e.custom.cover : `./covers/${e.slug}.jpg`;
