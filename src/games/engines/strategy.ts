import type { EngineFactory } from "../types";
import { TavernEngine } from "./strategy/tavern";
import { KitchenEngine } from "./strategy/kitchen";
import { TacticsEngine } from "./strategy/tactics";
import { DeckEngine } from "./strategy/deck";
import { BazaarEngine } from "./strategy/bazaar";
import { LightEngine } from "./strategy/light";

/** Original deterministic offline engines; every campaign has a distinct simulation. */
export const createStrategyEngine: EngineFactory = options => {
  if (!Number.isInteger(options.chapterIndex) || options.chapterIndex < 0 || options.chapterIndex >= options.campaign.chapters.length) throw new Error("Unknown strategy chapter.");
  switch (options.campaign.slug) {
    case "ptv": return new TavernEngine(options);
    case "kkn": return new KitchenEngine(options);
    case "sft": return new TacticsEngine(options);
    case "mmr": return new DeckEngine(options);
    case "cbz": return new BazaarEngine(options);
    case "lmc": return new LightEngine(options);
    default: throw new Error(`Unknown strategy campaign ${options.campaign.slug}.`);
  }
};
