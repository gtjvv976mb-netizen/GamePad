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
  g("ndp", "Neon Drift Protocol", "Halfpipe Labs", "Racing", 0.24, 7, ["Arcade", "Multiplayer", "Synthwave"],
    "Thread a hover-car through a city that rewrites its streets every lap. Keep every part you win.",
    ["#1c0f2e", "#4f255e", "#ff6a52"]),
  g("hcr", "Hollow Crown", "Gravewright", "RPG", 0.25, 8, ["Dark fantasy", "Open world", "Story"],
    "Claim a crown that whispers back. 60 hours of choices that stick.",
    ["#17171c", "#4a3a44", "#e3a1ad"]),
  g("osv", "Orbital Salvage", "Low Orbit Co.", "Simulation", 0.12, 6, ["Space", "Physics", "Co-op"],
    "Cut apart derelict stations in zero-g, haul the scrap home, sell what you find.",
    ["#07080c", "#10233f", "#3f8cff"]),
  g("ptv", "Pixel Tavern", "Mug & Pixel", "Cozy", 0.08, 5, ["Pixel art", "Management", "Relaxing"],
    "Brew, serve and gossip in a tavern at the crossroads of four kingdoms.",
    ["#24130b", "#482214", "#f08a3a"]),
  g("sft", "Shardfall Tactics", "Kestrel Yard", "Strategy", 0.18, 8, ["Turn-based", "Ranked", "Competitive"],
    "Grid tactics on a map that cracks a little more every turn. Ranked seasons.",
    ["#0a1d36", "#1a395b", "#7ab8e8"]),
  g("kkn", "Kaiju Kitchen", "Big Spoon", "Party", 0.1, 5, ["Local co-op", "Chaos", "Family"],
    "Up to four cooks feed a giant monster through the dinner rush, before it eats the restaurant.",
    ["#3a1830", "#823643", "#ffc75e"]),
  g("eov", "Echoes of Vael", "Quiet Lantern", "Adventure", 0.16, 7, ["Narrative", "Puzzle", "Atmospheric"],
    "Follow a voice through a flooded archive and find out who left it.",
    ["#0b1240", "#4b3a8f", "#b598ff"]),
  g("gla", "Gridlock Arena", "Overclock", "Shooter", 0, 0, ["Free to play", "Arena", "Esports"],
    "Five-minute rounds on grid maps that turn during the match. Free to play.",
    ["#1a1213", "#ca2651", "#ffa03a"]),
  g("mmr", "Moss & Marrow", "Fernbone", "Roguelike", 0.11, 6, ["Deckbuilder", "Roguelike", "Hard"],
    "Grow a deck from the forest floor and fight your way down through the roots.",
    ["#0d2012", "#1d3b20", "#c4d24a"]),
  g("slc", "Starline Couriers", "Parcel Comet", "Simulation", 0.14, 6, ["Trading", "Space", "Chill"],
    "Run a one-ship delivery company across 40 systems. Don't open the packages.",
    ["#0c2148", "#153364", "#6aa8ff"]),
  g("dpt", "Deep Tide", "Brine Studio", "Horror", 0.17, 7, ["Survival horror", "Underwater", "Atmospheric"],
    "The rig at the bottom of the trench went silent. You came back up. Go back down.",
    ["#050a0d", "#0a242a", "#19b3bf"]),
  g("cbz", "Chrono Bazaar", "Tick Tock Works", "Card game", 0.12, 5, ["CCG", "Trading", "PvP"],
    "A card game where cards age. Trade them at the right moment or play them before they crumble.",
    ["#160f0d", "#823928", "#e08a4a"]),
  g("rrn", "Rift Runners", "Jumpcut", "Platformer", 0.21, 8, ["Speedrun", "Precision", "Pixel art"],
    "Precision platforming across 200 single-screen rooms. Respawns are instant.",
    ["#0e1013", "#104c7f", "#36a6e6"]),
  g("ibl", "Ironbloom", "Rustvine", "Survival", 0.16, 7, ["Crafting", "Base building", "Co-op"],
    "Grow a garden on a dead industrial planet. The machines and the plants both bite.",
    ["#1a1712", "#747149", "#d8b878"]),
  g("lmc", "Lumen Cascade", "Prism Pals", "Puzzle", 0.13, 6, ["Light", "Minimal", "Short"],
    "Bend light through 120 rooms of mirrors and glass. No timers.",
    ["#211735", "#6b4f9a", "#f0c8ff"]),
  g("sws", "Saltwind Sagas", "Harbor Nine", "RPG", 0.25, 9, ["Open world", "Sailing", "Pirates"],
    "Captain a ship across an archipelago that changes with the tides.",
    ["#2a120a", "#a8481a", "#ff8a3d"]),
].map((x, i) => ({ ...x, chainId: i + 1 }));

/** Palette for scenes that are not a game (logo, studio): graphite and brass. */
export const HOUSE_PALETTE: [string, string, string] = ["#0e0d0b", "#2b261d", "#e8c37a"];

export const bySlug = (slug: string) => GAMES.find(x => x.slug === slug);
export const byChainId = (id: number) => GAMES.find(x => x.chainId === id);
export const coverUrl = (slug: string) => `./covers/${slug}.jpg`;
