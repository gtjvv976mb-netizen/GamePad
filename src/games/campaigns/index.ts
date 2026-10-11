import { ACTION_CAMPAIGNS } from "./action";
import { ADVENTURE_CAMPAIGNS } from "./adventure";
import { STRATEGY_CAMPAIGNS } from "./strategy";

export const CAMPAIGNS = [...ACTION_CAMPAIGNS, ...ADVENTURE_CAMPAIGNS, ...STRATEGY_CAMPAIGNS];
export const campaignFor = (slug: string) => CAMPAIGNS.find(c => c.slug === slug);
export const offlineGameUrl = (slug: string, demo = false) => `./games/${slug}.html${demo ? "?demo=1" : ""}`;
