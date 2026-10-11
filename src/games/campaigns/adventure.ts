import type { Campaign, CampaignChapter } from "../types";

// Every room is authored here. The engine adds no procedural exits or substitute objectives.
function room(...rows: string[]): string[] {
  if (rows.length !== 7 || rows.some(row => row.length !== 14)) throw new Error("Adventure rooms require seven 14-cell rows");
  return ["################", ...rows.map(row => `#${row}#`), "################"];
}
function chapter(title: string, briefing: string, after: string, objective: string, map: string[], extra: Record<string, unknown> = {}): CampaignChapter {
  return { title, briefing, after, objective, config: { map, ...extra } };
}

const hollow: Campaign = {
  slug: "hcr", title: "Hollow Crown", family: "adventure", mechanic: "Tactical sword exploration",
  description: "Carry an unlit crown through six ruined keeps. Recover the royal embers, face their wardens and decide what the throne is for.",
  controls: "Move with arrows/WASD or the pad. Strike beside a sentinel with Action. Alt braces against the next two attacks. Stand on embers or tonics and use Action to collect them.",
  actionLabel: "Strike / gather", altLabel: "Brace", palette: ["#191829", "#352c4a", "#a887e9"],
  chapters: [
    chapter("01 · The Unlit Gate", "The kingdom's last bell rings without a hand to pull it. You wake carrying a hollow crown. Its keeper asks you to recover the ember stolen by the gate sentinel.", "The first ember lights a name inside the crown: Iona, the bell keeper. This kingdom was built by people, not kings.", "Recover the ember, defeat both sentinels and reach the east stair.", room(
      "S...#...K..D.E", "....#.........", ".M..#..##.....", "..............", "..##.....M....", "..H...........", "......##......")),
    chapter("02 · Orchard of Ash", "Iona's voice leads you to an orchard turned to stone. Two embers rest among its roots. The old orchard guards still watch the paths; brace before approaching the armored one.", "The orchard ember remembers harvests shared with every village. Its warden lowers a sword that has been raised for a century.", "Take both orchard embers, defeat the three guards, then leave by the root gate.", room(
      "S..#.....K.D.E", "...#..##......", ".M.#..........", "........#.....", "..K.....#..B..", "..##..H.#.....", "......M.......")),
    chapter("03 · The Drowned Choir", "The choir's hall is dry now, but the drowned songs remain. Its armored cantor guards the bridge. Gather the two song embers and silence the sentinels so the singers can finally rest.", "For the first time, the choir sings the names of its own members. The crown glows warmer, and the stair below the nave opens.", "Recover two song embers and defeat the cantor and its two guards.", room(
      "S....#...K.D.E", "..M..#........", ".....#..###...", "..............", "..###...B.....", "..K........H..", ".......M......")),
    chapter("04 · The Broken Observatory", "At the observatory, a royal astronomer admits the crown once hid an approaching winter from the people. The star ember is trapped between two armored watchers. The tonics may be vital.", "The astronomer opens the winter charts to everyone. A crown can carry truth without claiming ownership of it.", "Retrieve the star ember, defeat both watchers and the scout, then reach the sky stair.", room(
      "S....#..K..D.E", "..H..#........", ".....#..B.....", "..............", "..B....###....", ".......H......", "...M..........")),
    chapter("05 · The People's Vault", "The vault holds the final two embers: a baker's promise and a mason's oath. The royal guards will not surrender them willingly. Keep your brace ready and use each fallen guard to renew your resolve.", "The vault opens onto a square full of sleeping statues. The crown now contains six ordinary promises. Only its owner remains asleep.", "Claim both promises, defeat the vault guards and climb to the throne.", room(
      "S..#...K...D.E", "...#..B.......", "...#.....##...", ".........H....", "..K..##.......", "..B.........B.", ".......H......")),
    chapter("06 · A Throne for No One", "The Hollow King offers you the throne if you keep the embers to yourself. His two captains guard the oath ember. Break their circle, gather the last light and carry the crown through the public gate.", "You place the crown on the town bell, not on a head. Every recovered name rings across the valley. The king's shadow disappears in the dawn.", "Defeat the king's three wardens, recover the oath ember and open the public gate.", room(
      "S....#..K..D.E", "..H..#..B.....", ".....#.....#..", "...........#..", "..B....B......", "....H.........", "..............")),
  ],
  ending: "The bell belongs to the valley now. Iona rings it when the first orchard blossoms, and every person whose promise lit your crown has a place in its song. You leave the throne empty and walk home.",
};

const echoes: Campaign = {
  slug: "eov", title: "Echoes of Vael", family: "adventure", mechanic: "Archive exploration and rune memory",
  description: "Find lost folios and restore six chambers of a living archive. Decipher ordered rune memories to return a city's voice.",
  controls: "Move with arrows/WASD or the pad. Action reads the folio or rune under your feet. Alt listens to the memory you have recovered. Wrong rune choices cost resolve and reset the sequence.",
  actionLabel: "Read / attune", altLabel: "Listen", palette: ["#142630", "#254955", "#69d6d0"],
  chapters: [
    chapter("01 · The Door That Forgot", "Vael's archive has forgotten its readers. A lamp calls you Archivist and asks for three scattered folios. Read all three, then walk the rune order they reveal. SUN, WAVE, ROOT and MOON are carved into the floor.", "The door remembers your footsteps. A child's borrowed book appears on its desk, overdue by one hundred years.", "Read three folios, attune the recovered rune order and reach the archive door.", room(
      "S...#...F..D.E", "....#....1....", ".F..#..##.....", ".........2....", "..##..........", "..F..3........", ".........4...."), { sequence: [1, 2, 3] }),
    chapter("02 · A River in Ink", "A mapmaker erased a river to make a border straighter. Recover the folios describing its true course. Their runes begin with WAVE; listen when you need the rest of the order.", "Blue ink spills gently through the map. The river again reaches all three villages, and the border becomes a footpath.", "Read all three river folios and restore the four-rune memory.", room(
      "S..#....F..D.E", "...#..2.......", ".F.#......##..", ".......4......", "...##.........", "..F...1.......", ".........3...."), { sequence: [2, 4, 1, 3] }),
    chapter("03 · The Garden Ledger", "The archive remembers a famine but not the gardeners who ended it. Search behind the shelves for their seed ledger. A rune appears twice in this memory; return to it when the sequence asks.", "The ledger names every gardener and the gardens they tended. Seeds sprout around the reading lamps.", "Gather the garden folios, then attune the five-step seed memory.", room(
      "S....#..F..D.E", "..3..#........", ".....#..###...", ".F............", "..###...1.....", "..F.....2.....", ".........4...."), { sequence: [3, 1, 2, 3, 4] }),
    chapter("04 · Observatory of Letters", "An astronomer's letters describe stars as questions, but a censor bound them as answers. Collect the original letters. Their memory begins beneath MOON and ends beneath SUN.", "The ceiling opens into a sky of handwritten constellations. None of them tells you what to think.", "Read the three letters and unlock the observatory's five-rune seal.", room(
      "S....#..F..D.E", "..4..#........", ".F...#..1.....", "..............", "..2....###....", ".......F......", "...3.........."), { sequence: [4, 2, 1, 3, 1] }),
    chapter("05 · The Unwritten Trial", "In the court archive, the final witness was silenced. Recover her pages from the sealed shelves. Her account doubles back: the sequence uses the same rune more than once.", "The witness's voice joins the record. The verdict dissolves, and a sentence of exile becomes an invitation to return.", "Recover the witness folios and finish the six-rune testimony.", room(
      "S..#...F...D.E", "...#..2.......", "...#.....##...", ".F.......4....", ".....##.......", "..3.........1.", ".......F......"), { sequence: [2, 3, 2, 4, 1, 3] }),
    chapter("06 · The City Speaks", "All Vael's stories converge at the oldest desk. The archive offers to keep them safe behind a final lock. Read the last three folios and restore the six-rune memory that turns a private vault into a public library.", "The final door opens inward and outward at once. People come through with stories the archive has never heard. The lamp finally asks your name.", "Collect the final folios, attune the city memory and open the public library.", room(
      "S....#..F..D.E", "..1..#..4.....", ".F...#.....#..", "...........#..", "..3....2......", "....F.........", ".............."), { sequence: [1, 4, 3, 2, 4, 1] }),
  ],
  ending: "You write your name on a borrowing card. Vael's archive becomes a library where stories can be questioned, shared and changed. Its first new reader is the child whose overdue book began your journey.",
};

const ironbloom: Campaign = {
  slug: "ibl", title: "Ironbloom", family: "adventure", mechanic: "Gather, grow and build",
  description: "Turn the bones of a silent factory into a living garden. Harvest wood and ore, grow ironflowers and craft six repairs before your energy runs out.",
  controls: "Move with arrows/WASD or the pad. Action gathers supplies, plants an empty bed using one wood, or harvests a mature bed. Beds grow after three turns. Alt crafts the chapter repair when you have its materials, or waits. Flowers restore energy.",
  actionLabel: "Gather / tend", altLabel: "Craft / wait", palette: ["#1a2b25", "#355240", "#98db8a"],
  chapters: [
    chapter("01 · A Seed in the Gearbox", "Your grandmother left a factory, one packet of ironflower seeds and a note: repair what you can, then let it grow. Gather fallen timber and scrap ore. Plant a bed, let it mature for three turns and craft the greenhouse latch.", "The greenhouse door swings free. A warm wind stirs inside a building that has been cold for years.", "Craft the latch with 2 wood, 1 ore and 1 bloom, then enter the greenhouse.", room(
      "S...#...W..D.E", "....#....O....", ".W..#..##.....", ".........P....", "..##..........", "..W..H........", ".........W...."), { wood: 2, ore: 1, bloom: 1 }),
    chapter("02 · Water for the Roots", "The greenhouse cistern is empty. Build a hand pump from scrap and living ironflower roots. Two beds must be planted. Collect the extra timber before planting so you still have enough for the pump.", "The pump brings clean water into the greenhouse. Your first seedlings survive the afternoon heat.", "Craft the pump with 2 wood, 2 ore and 2 blooms, then reach the cistern.", room(
      "S..#....W..D.E", "...#..O...P...", ".W.#......##..", ".......W......", "...##....O....", "..W...P.......", ".....H...W...."), { wood: 2, ore: 2, bloom: 2 }),
    chapter("03 · Crossing the Furnace", "The old furnace splits the garden in two. Its bridge can be repaired with a frame of wood and ironflower fibers. Tend both beds, recover enough ore for the hinges and keep an eye on your energy.", "You carry the first seedlings over the repaired bridge. The furnace becomes a warm nursery instead of a barrier.", "Craft the nursery bridge with 3 wood, 2 ore and 2 blooms.", room(
      "S....#..W..D.E", "..P..#...O....", ".W...#..###...", ".......W......", "..###...P.....", "..W.....O.....", "....H....W...."), { wood: 3, ore: 2, bloom: 2 }),
    chapter("04 · A Windmill of Leaves", "The workshop lamps need power. Build a windmill whose living blades turn with the breeze. Three beds can supply enough blooms; gather six fallen beams, and use the lunch basket if the work wears you down.", "Leaf-shaped blades turn over the workshop. The lamps brighten, and neighbors arrive carrying tools of their own.", "Craft the windmill with 3 wood, 2 ore and 3 blooms.", room(
      "S....#..W..D.E", "..P..#...O....", ".W...#..P.....", "......W.......", "..W....###....", "...O...W......", "...P..H...W..."), { wood: 3, ore: 2, bloom: 3 }),
    chapter("05 · The Rustwater Filter", "Rustwater leaks from the factory into the town stream. The ironflowers can filter it, but only if their roots are held inside a sound frame. Build the filter, and make the stream safe before the next rain.", "Clear water reaches the town. A child plants a seed beside the stream, and your grandmother's factory gains its first new name: the Commons.", "Craft the water filter with 3 wood, 3 ore and 3 blooms.", room(
      "S..#...W...D.E", "...#..P...O...", ".W.#.....##...", ".....W...P....", "..O..##..W....", "..P....O....W.", ".....H.W......"), { wood: 3, ore: 3, bloom: 3 }),
    chapter("06 · The Commons Opens", "The final gate once kept the factory's workers out. Build a flowering arch in its place. Gather the last beams and ore, tend the three beds and bring the garden into the square where everyone can enter.", "The old gate comes down. The arch takes root across the square, and the garden opens without a lock.", "Craft the flowering arch with 3 wood, 3 ore and 3 blooms and reach the square.", room(
      "S....#..W..D.E", "..P..#..O.....", ".W...#..P..#..", "......W....#..", "..O....W......", "..P.H...O...W.", ".....W........"), { wood: 3, ore: 3, bloom: 3 }),
  ],
  ending: "The Commons has no owner and no closing bell. Your grandmother's note hangs above a shared workbench: repair what you can, then let it grow. Children plant the next season's seeds among the quiet gears.",
};

const saltwind: Campaign = {
  slug: "sws", title: "Saltwind Sagas", family: "adventure", mechanic: "Tides, salvage and lighthouse navigation",
  description: "Sail a little cutter across six lost archipelagos. Read tides, salvage wrecks, repair your hull and relight the beacons that bring a fleet home.",
  controls: "Move with arrows/WASD or the pad. Action salvages a wreck, lights a beacon with one supply, or repairs 4 hull for one supply. Alt anchors for one turn. Shallows open at high tide (the tide changes every three turns); storms cost hull when crossed.",
  actionLabel: "Salvage / light / repair", altLabel: "Anchor", palette: ["#102c40", "#1c5065", "#63cbdc"],
  chapters: [
    chapter("01 · One Sail at Dawn", "A fog has hidden the returning fleet. Your cutter is the only boat small enough to pass the reefs. Salvage both wrecks for charts and repair supplies, then light the two harbor beacons. Anchor to wait for high tide at the shallows.", "Two lights answer one another across the bay. A distant ship rings its bell, but five more harbors remain dark.", "Recover both wreck charts, light two beacons and sail to the east channel.", room(
      "S~~~~#~~G~~R~E", "~~~~~#~~~B~~~~", "~G~~~#~~##~~~~", "~~~~~~~~~~~~~~", "~~##~~~~B~~~~~", "~~~~~~~~~~~~~~", "~~~~~~~X~~~~~~")),
    chapter("02 · Reef of Bells", "A reef surrounds the bell island. The tide opens its shallow passes for three turns at a time. Recover both charts, light the reef's two beacons and repair the cutter if the storm lane damages it.", "The reef bell rings with every wave. One of the fleet's skippers answers, steering toward your lights.", "Salvage two wrecks and light both reef beacons.", room(
      "S~~#~~~~G~~R~E", "~~~#~~B~~~~~~~", "~G~#~~~~~~##~~", "~~~~~~~X~~~~~~", "~~~##~~~~~~~~~", "~~~~~~B~~~~~~~", "~~~~~~~~~~~~~~")),
    chapter("03 · The Storm Compass", "The fleet's compass ship broke against the southern rocks. Its chart is split between three wrecks. Salvage them all, relight the compass beacons and cross the storm with enough supplies to repair your hull.", "The salvaged compass points toward a moving light on the horizon. The fleet is still together, following the old current.", "Recover three chart pieces and relight two compass beacons.", room(
      "S~~~~#~~G~~R~E", "~~B~~#~~~~~~~~", "~~~~~#~~###~~~", "~G~~~~~X~~~~~~", "~~###~~~B~~~~~", "~~G~~~~~~~~~~~", "~~~~~~~~~~~~~~")),
    chapter("04 · The Sleepless Isles", "The island watchkeepers have not seen a ship for a season. Three beacon fires can guide the fleet through the northern channel. Recover three wreck charts and carry a supply to each island watchtower.", "The watchkeepers gather around the first ships to return. Their children see sails in the channel again.", "Recover three charts and light all three island beacons.", room(
      "S~~~~#~~G~~R~E", "~~B~~#~~~~~~~~", "~G~~~#~~B~~~~~", "~~~~~~~~~~~~~~", "~~G~~~~###~~~~", "~~~~~~~~~~~~~~", "~~~B~~~~X~~~~~")),
    chapter("05 · The Narrow Current", "Only one passage remains between the fleet and home. The current runs through stormwater. Keep your repair supplies close, recover the three scattered charts and restore the three lights marking its banks.", "Three lights draw a safe curve through the dark. The fleet gathers behind your cutter, ready for the final crossing.", "Salvage all three wrecks and relight the three channel beacons.", room(
      "S~~#~~~G~~~R~E", "~~~#~~B~~~~~~~", "~G~#~~~~~##~~~", "~~~~~X~~~B~~~~", "~~~~~##~~~~~~~", "~~B~~~~G~~~~~~", "~~~~~~~~~~~~~~")),
    chapter("06 · A Harbor for Everyone", "The fog's last wall covers the home harbor. The old admiral wants the fleet to enter alone, but smaller boats are waiting outside. Recover every chart and light all three public beacons so the fishing boats can come in with you.", "Your lights guide every boat into the harbor. The fleet lowers its flags and shares its first catch with the waiting families.", "Recover all three charts, light the public beacons and bring the fleet home.", room(
      "S~~~~#~~G~~R~E", "~~B~~#~~B~~~~~", "~G~~~#~~~~~#~~", "~~~~~~~~~~~#~~", "~~~~~~~G~~~~~~", "~~B~~~~~~~~~~~", "~~~~~~X~~~~~~~")),
  ],
  ending: "At sunrise the harbor is crowded with cutters, fishing skiffs and the returning fleet. You hang the little boat's bell beside the public chart board. Any captain may add a route, and every new sailor knows where the lights lead.",
};

export const ADVENTURE_CAMPAIGNS: Campaign[] = [hollow, echoes, ironbloom, saltwind];
