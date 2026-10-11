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
    "Drift through five multi-lap neon races against rival drivers. Master boost, earn medals and upgrade your car.",
    ["#1c0f2e", "#4f255e", "#ff6a52"]),
  g("hcr", "Hollow Crown", "Gravewright", "RPG", 0.25, 8, ["Dark fantasy", "Offline", "Story"],
    "Explore six ruined keeps, dodge telegraphed attacks and confront the Hollow King. Help keepers and forge stronger equipment.",
    ["#17171c", "#4a3a44", "#e3a1ad"]),
  g("osv", "Orbital Salvage", "Low Orbit Co.", "Simulation", 0.12, 6, ["Space", "Physics", "Offline"],
    "Pilot an inertial tug through five wreck fields. Tether physical cargo, repel drones, navigate airlocks and upgrade your ship.",
    ["#07080c", "#10233f", "#3f8cff"]),
  g("ptv", "Pixel Tavern", "Mug & Pixel", "Cozy", 0.08, 5, ["Pixel art", "Management", "Relaxing"],
    "Run a working tavern across six shifts. Move between pantry, two stoves and tables; time fresh batches for arriving travelers.",
    ["#24130b", "#482214", "#f08a3a"]),
  g("sft", "Shardfall Tactics", "Kestrel Yard", "Strategy", 0.18, 8, ["Turn-based", "Tactics", "Offline"],
    "Lead three specialists through six tactical missions. Read enemy intentions, shove foes into hazards and rescue, defend or escort.",
    ["#0a1d36", "#1a395b", "#7ab8e8"]),
  g("kkn", "Kaiju Kitchen", "Big Spoon", "Cooking", 0.1, 5, ["Combos", "Cooking", "Offline"],
    "Chop, grill, flip and season six monster feasts. Match craving chains and cool the kitchen before a telegraphed kaiju stomp.",
    ["#3a1830", "#823643", "#ffc75e"]),
  g("eov", "Echoes of Vael", "Quiet Lantern", "Adventure", 0.16, 7, ["Narrative", "Puzzle", "Atmospheric"],
    "Explore six flooded archives with a memory lens. Recover folios, question keepers and restore valves, shelves and ancient lights.",
    ["#0b1240", "#4b3a8f", "#b598ff"]),
  g("gla", "Gridlock Arena", "Overclock", "Shooter", 0, 0, ["Free to play", "Arena", "Offline"],
    "Clear five combat sectors with weapon pickups, dashes and aim controls. Learn six enemy behaviors and defeat escalating arena bosses.",
    ["#1a1213", "#ca2651", "#ffa03a"]),
  g("mmr", "Moss & Marrow", "Fernbone", "Roguelike", 0.11, 6, ["Deckbuilder", "Roguelike", "Hard"],
    "Shape a persistent deck of 24 spells through six forest expeditions. Choose branching routes, traders, camps, relics and boss battles.",
    ["#0d2012", "#1d3b20", "#c4d24a"]),
  g("slc", "Starline Couriers", "Parcel Comet", "Simulation", 0.14, 6, ["Delivery", "Navigation", "Offline"],
    "Drive five city delivery routes through traffic lights and busy intersections. Protect fragile parcels, recharge and improve your van.",
    ["#0c2148", "#153364", "#6aa8ff"]),
  g("dpt", "Deep Tide", "Brine Studio", "Horror", 0.17, 7, ["Survival horror", "Underwater", "Atmospheric"],
    "Dive through five multi-room ruins. Open pressure valves, evade wildlife and ration air while recovering relics and suit upgrades.",
    ["#050a0d", "#0a242a", "#19b3bf"]),
  g("cbz", "Chrono Bazaar", "Tick Tock Works", "Card game", 0.12, 5, ["Economy", "Strategy", "Offline"],
    "Run a caravan between three towns across six chapters. Fulfill contracts, forecast demand and sell aging cargo before it spoils.",
    ["#160f0d", "#823928", "#e08a4a"]),
  g("rrn", "Rift Runners", "Jumpcut", "Platformer", 0.21, 8, ["Speedrun", "Precision", "Pixel art"],
    "Double-jump and dash through five scrolling rifts. Ride moving platforms, find secrets, use checkpoints and face the Crown Guardian.",
    ["#0e1013", "#104c7f", "#36a6e6"]),
  g("ibl", "Ironbloom", "Rustvine", "Survival", 0.16, 7, ["Crafting", "Gardening", "Offline"],
    "Restore six industrial gardens with timber, ore and renewable crops. Complete keeper requests and rebuild pumps, bridges and windmills.",
    ["#1a1712", "#747149", "#d8b878"]),
  g("lmc", "Lumen Cascade", "Prism Pals", "Puzzle", 0.13, 6, ["Light", "Minimal", "Short"],
    "Restore six optical temples through connected rooms. Rotate mirrors, prisms and splitters, open shutters and route colored light.",
    ["#211735", "#6b4f9a", "#f0c8ff"]),
  g("sws", "Saltwind Sagas", "Harbor Nine", "Adventure", 0.25, 9, ["Sailing", "Exploration", "Offline"],
    "Sail six island passages with wind and inertia. Trade cannon fire with raiders, restore beacons and upgrade your hull and mast.",
    ["#2a120a", "#a8481a", "#ff8a3d"]),
].map((x, i) => ({ ...x, chainId: i + 1 }));

/** Palette for scenes that are not a game (logo, studio): graphite and brass. */
export const HOUSE_PALETTE: [string, string, string] = ["#0e0d0b", "#2b261d", "#e8c37a"];

export const bySlug = (slug: string) => GAMES.find(x => x.slug === slug);
export const byChainId = (id: number) => GAMES.find(x => x.chainId === id);
export const coverUrl = (slug: string) => `./covers/${slug}.jpg`;
