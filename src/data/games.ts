// Seed catalog. The Solana store program (program/) publishes these in this order, so
// `chainId` here matches the game id the program assigns when seeded. Prices are in SOL.
export type Game = {
  slug: string;
  chainId: number;
  title: string;
  studio: string;
  genre: string;
  price: number;
  royaltyPct: number;
  tags: string[];
  blurb: string;
  /** deep, mid, accent: pulled from the cover art, drive the 3D backdrop and glow */
  palette: [string, string, string];
  /** short looping cover animation (Higgsfield) for the 3D card */
  loop?: boolean;
};

const g = (
  slug: string, title: string, studio: string, genre: string, price: number, royaltyPct: number,
  tags: string[], blurb: string, palette: [string, string, string], loop = true,
): Omit<Game, "chainId"> => ({ slug, title, studio, genre, price, royaltyPct, tags, blurb, palette, loop });

export const GAMES: Game[] = [
  g("ndp", "Neon Drift Protocol", "Halfpipe Labs", "Racing", 0.24, 7, ["Arcade", "Offline", "Campaign"],
    "Race through five neon circuits. Master steering, checkpoint routes and boost to break the city's blockade.",
    ["#1c0f2e", "#4f255e", "#ff6a52"]),
  g("hcr", "Hollow Crown", "Gravewright", "RPG", 0.25, 8, ["Dark fantasy", "Offline", "Story"],
    "Explore six ruined keeps, battle their wardens and recover the seals that will quiet a whispering crown.",
    ["#17171c", "#4a3a44", "#e3a1ad"]),
  g("osv", "Orbital Salvage", "Low Orbit Co.", "Simulation", 0.12, 6, ["Space", "Physics", "Offline"],
    "Pilot an inertial tug through five salvage fields. Tractor in drifting cargo and bring it safely back to dock.",
    ["#07080c", "#10233f", "#3f8cff"]),
  g("ptv", "Pixel Tavern", "Mug & Pixel", "Cozy", 0.08, 5, ["Pixel art", "Management", "Relaxing"],
    "Mix recipes, manage your pantry and serve travelers through six chapters of a tavern's story.",
    ["#24130b", "#482214", "#f08a3a"]),
  g("sft", "Shardfall Tactics", "Kestrel Yard", "Strategy", 0.18, 8, ["Turn-based", "Tactics", "Offline"],
    "Command two allies across six grid battles. Spend action points, hold your ground and outmaneuver the enemy.",
    ["#0a1d36", "#1a395b", "#7ab8e8"]),
  g("kkn", "Kaiju Kitchen", "Big Spoon", "Cooking", 0.1, 5, ["Combos", "Cooking", "Offline"],
    "Cook six monster feasts. Match flavors, build combos and manage the heat before dinner becomes a disaster.",
    ["#3a1830", "#823643", "#ffc75e"]),
  g("eov", "Echoes of Vael", "Quiet Lantern", "Adventure", 0.16, 7, ["Narrative", "Puzzle", "Atmospheric"],
    "Follow a voice through six flooded archives. Collect clues and decode the rune sequences hiding its story.",
    ["#0b1240", "#4b3a8f", "#b598ff"]),
  g("gla", "Gridlock Arena", "Overclock", "Shooter", 0, 0, ["Free to play", "Arena", "Offline"],
    "Survive five arena missions. Aim, fire and dash through escalating enemy waves to shut down the grid.",
    ["#1a1213", "#ca2651", "#ffa03a"]),
  g("mmr", "Moss & Marrow", "Fernbone", "Roguelike", 0.11, 6, ["Deckbuilder", "Roguelike", "Hard"],
    "Build a deck from the forest floor. Balance damage, guard and growth through six battles beneath the roots.",
    ["#0d2012", "#1d3b20", "#c4d24a"]),
  g("slc", "Starline Couriers", "Parcel Comet", "Simulation", 0.14, 6, ["Delivery", "Navigation", "Offline"],
    "Collect and deliver parcels through five courier routes. Dodge traffic and keep the city's final delivery promise.",
    ["#0c2148", "#153364", "#6aa8ff"]),
  g("dpt", "Deep Tide", "Brine Studio", "Horror", 0.17, 7, ["Survival horror", "Underwater", "Atmospheric"],
    "Dive into five drowned ruins. Recover relics, navigate currents and ration oxygen between bubble vents.",
    ["#050a0d", "#0a242a", "#19b3bf"]),
  g("cbz", "Chrono Bazaar", "Tick Tock Works", "Card game", 0.12, 5, ["Economy", "Strategy", "Offline"],
    "Trade goods that gain value as they age. Buy, wait and sell through six markets before your stock crumbles.",
    ["#160f0d", "#823928", "#e08a4a"]),
  g("rrn", "Rift Runners", "Jumpcut", "Platformer", 0.21, 8, ["Speedrun", "Precision", "Pixel art"],
    "Run and jump through five rift missions. Collect every shard, clear hazards and reach the exit portal.",
    ["#0e1013", "#104c7f", "#36a6e6"]),
  g("ibl", "Ironbloom", "Rustvine", "Survival", 0.16, 7, ["Crafting", "Gardening", "Offline"],
    "Restore six industrial gardens. Gather scrap, plant and harvest ironblooms, then craft a way forward.",
    ["#1a1712", "#747149", "#d8b878"]),
  g("lmc", "Lumen Cascade", "Prism Pals", "Puzzle", 0.13, 6, ["Light", "Minimal", "Short"],
    "Restore six light chambers. Rotate mirrors and guide multiple beams into their receivers without a timer.",
    ["#211735", "#6b4f9a", "#f0c8ff"]),
  g("sws", "Saltwind Sagas", "Harbor Nine", "Adventure", 0.25, 9, ["Sailing", "Exploration", "Offline"],
    "Sail six island passages. Navigate reef tides, recover salvage and bring your battered ship safely home.",
    ["#2a120a", "#a8481a", "#ff8a3d"]),
].map((x, i) => ({ ...x, chainId: i + 1 }));

/** Palette for scenes that are not a game (logo, studio): graphite and brass. */
export const HOUSE_PALETTE: [string, string, string] = ["#0e0d0b", "#2b261d", "#e8c37a"];

export const bySlug = (slug: string) => GAMES.find(x => x.slug === slug);
export const byChainId = (id: number) => GAMES.find(x => x.chainId === id);
export const coverUrl = (slug: string) => `./covers/${slug}.jpg`;
