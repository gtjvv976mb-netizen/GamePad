import { createActionEngine } from "./engines/action";
import { createAdventureEngine } from "./engines/adventure";
import { createStrategyEngine } from "./engines/strategy";
import type { EngineOptions, GameEngine } from "./types";

export function createEngine(options: EngineOptions): GameEngine {
  switch (options.campaign.family) {
    case "action": return createActionEngine(options);
    case "adventure": return createAdventureEngine(options);
    case "strategy": return createStrategyEngine(options);
  }
}
