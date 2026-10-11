import type { EngineFactory } from "../types";
import { AdventureWorld } from "./adventure/world";

/** The four adventures share world/save plumbing, with distinct real-time rules and scenes. */
export const createAdventureEngine: EngineFactory = options => new AdventureWorld(options);
