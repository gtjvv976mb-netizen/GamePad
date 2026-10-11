import type { EngineFactory, EngineView, GameButton, GameEngine, GameInput, GameStatus } from "../types";

type Kind = "hcr" | "eov" | "ibl" | "sws";
type Facing = "up" | "down" | "left" | "right";
type Enemy = { id: number; hp: number };
type AdventureState = {
  v: number; slug: Kind; chapter: number; x: number; y: number; facing: Facing;
  turn: number; movementClock: number; health: number; reserve: number; guard: number;
  picked: number[]; planted: { id: number; turn: number }[]; harvested: number[];
  enemies: Enemy[]; runeProgress: number; crafted: boolean; beacons: number[]; repairs: number;
  status: GameStatus; message: string;
};
const DIRECTIONS: Record<Facing, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const RUNE_NAMES = ["", "SUN", "WAVE", "ROOT", "MOON"];
const STATE_KEYS = "v slug chapter x y facing turn movementClock health reserve guard picked planted harvested enemies runeProgress crafted beacons repairs status message".split(" ").sort();
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export const createAdventureEngine: EngineFactory = ({ campaign, chapterIndex, restored }) => {
  if (!["hcr", "eov", "ibl", "sws"].includes(campaign.slug) || !integer(chapterIndex, 0, campaign.chapters.length - 1)) throw new Error("Unknown adventure chapter");
  const kind = campaign.slug as Kind;
  const chapter = campaign.chapters[chapterIndex];
  const config = chapter.config;
  const rows = config.map;
  if (!Array.isArray(rows) || rows.length !== 9 || rows.some(row => typeof row !== "string" || row.length !== 16)) throw new Error("Invalid adventure map");
  const map = (rows as string[]).join("");
  const size = 16;
  const ids = (chars: string) => Array.from(map, (char, id) => chars.includes(char) ? id : -1).filter(id => id >= 0);
  const starts = ids("S"), exits = ids("E");
  if (starts.length !== 1 || exits.length !== 1 || /[^#.SEKMBDHFPWO1234~GRX]/.test(map)) throw new Error("Invalid adventure room");
  const sequence = Array.isArray(config.sequence) ? config.sequence as number[] : [];
  if (kind === "eov" && (sequence.length < 3 || sequence.some(rune => !integer(rune, 1, 4) || !map.includes(String(rune))))) throw new Error("Invalid rune memory");
  const cost = { wood: Number(config.wood ?? 0), ore: Number(config.ore ?? 0), bloom: Number(config.bloom ?? 0) };
  if (kind === "ibl" && Object.values(cost).some(value => !integer(value, 1, 10))) throw new Error("Invalid repair recipe");
  const enemyIds = kind === "hcr" ? ids("MB") : [];
  const collectibleIds = ids(kind === "hcr" ? "KH" : kind === "eov" ? "F" : kind === "ibl" ? "WOH" : "G");
  const maxHealth = kind === "hcr" ? 12 : kind === "eov" ? 6 : 10;
  const maxReserve = kind === "hcr" ? 6 : kind === "ibl" ? 100 : 0;
  const enemyMax = (id: number) => map[id] === "B" ? 6 : 2;
  const initial: AdventureState = {
    v: 1, slug: kind, chapter: chapterIndex, x: starts[0] % size, y: Math.floor(starts[0] / size), facing: "right",
    turn: 0, movementClock: 0, health: maxHealth, reserve: kind === "hcr" ? 3 : maxReserve, guard: 0,
    picked: [], planted: [], harvested: [], enemies: enemyIds.map(id => ({ id, hp: enemyMax(id) })),
    runeProgress: 0, crafted: false, beacons: [], repairs: 0, status: "playing", message: "Explore the room. Use Action on marked tiles. Your adventure saves exactly where you stand.",
  };
  let state: AdventureState = initial;
  const picked = (id: number) => state.picked.includes(id);
  const collected = (char: string) => ids(char).filter(picked).length;
  const inventory = () => ({
    wood: collected("W") - state.planted.length - (state.crafted ? cost.wood : 0),
    ore: collected("O") - (state.crafted ? cost.ore : 0),
    bloom: state.harvested.length - (state.crafted ? cost.bloom : 0),
    supplies: collected("G") * 2 - state.beacons.length - state.repairs,
  });
  const allPicked = (chars: string) => ids(chars).every(picked);
  const complete = () => kind === "hcr" ? allPicked("K") && state.enemies.every(enemy => enemy.hp === 0)
    : kind === "eov" ? allPicked("F") && state.runeProgress === sequence.length
      : kind === "ibl" ? state.crafted : allPicked("G") && ids("B").every(id => state.beacons.includes(id));
  const doorOpen = () => kind === "hcr" ? allPicked("K") : kind === "eov" ? state.runeProgress === sequence.length : kind === "ibl" ? state.crafted : true;
  const highTide = () => Math.floor(state.turn / 3) % 2 === 1;
  const at = () => state.y * size + state.x;
  const distance = (id: number) => Math.abs(id % size - state.x) + Math.abs(Math.floor(id / size) - state.y);
  const stranded = () => kind === "sws" && inventory().supplies + (ids("G").length - collected("G")) * 2 < ids("B").length - state.beacons.length;
  const checkEnd = () => {
    if (state.health <= 0 || (kind === "ibl" && state.reserve <= 0) || stranded()) {
      state.status = "lost";
      state.message = kind === "hcr" ? "Your light fades. Restart this chapter and use your brace and tonics."
        : kind === "eov" ? "The memory falls silent. Restart and listen to the folios before attuning."
          : kind === "ibl" ? "You are too exhausted to continue. Restart, eat the lunch basket and harvest flowers to regain energy."
            : stranded() ? "Not enough supplies remain for the dark beacons. Restart and reserve one supply for every light." : "The cutter's hull gives way. Restart and save supplies for repairs.";
    } else if (map[at()] === "E" && complete()) {
      state.status = "won";
      state.message = chapter.after;
    }
  };
  const advance = () => {
    state.turn += 1;
    if (kind === "ibl") state.reserve = Math.max(0, state.reserve - 1);
    if (kind === "hcr") {
      for (const enemy of state.enemies) {
        if (enemy.hp > 0 && distance(enemy.id) === 1) {
          if (state.guard > 0) { state.guard -= 1; state.message += " Your brace absorbs the counterstrike."; }
          else state.health = Math.max(0, state.health - (map[enemy.id] === "B" ? 2 : 1));
        }
      }
    }
    checkEnd();
  };
  const listen = () => {
    const recovered = collected("F");
    return allPicked("F") ? `Memory: ${sequence.map(rune => RUNE_NAMES[rune]).join(" → ")}. Attune ${state.runeProgress + 1 > sequence.length ? "complete" : `step ${state.runeProgress + 1}`}.`
      : `Recovered ${recovered}/${ids("F").length} folios. Find them all to hear the complete memory.`;
  };
  const move = (direction: Facing) => {
    state.facing = direction;
    const [dx, dy] = DIRECTIONS[direction];
    const x = state.x + dx, y = state.y + dy, id = y * size + x;
    if (x < 0 || y < 0 || x >= size || y >= rows.length || map[id] === "#") { state.message = "The way is blocked. Look for another path."; return; }
    if (map[id] === "D" && !doorOpen()) { state.message = "The gate is sealed. Complete the room's task to open it."; return; }
    if (kind === "sws" && map[id] === "R" && !highTide()) { state.message = "The shallows are exposed. Anchor until HIGH TIDE to sail across."; return; }
    if (state.enemies.some(enemy => enemy.id === id && enemy.hp > 0)) { state.message = "A sentinel blocks the path. Strike beside it; brace for its counterattack."; return; }
    state.x = x; state.y = y;
    if (kind === "sws" && map[id] === "X") {
      state.health = Math.max(0, state.health - 1);
      state.message = "Stormwater strikes the hull! Use spare supplies to repair before sailing on.";
    } else if (map[id] === "E" && !complete()) state.message = "The exit waits. Finish the objective before leaving.";
    else if (collectibleIds.includes(id) && !picked(id)) state.message = "Stand here and use Action to gather this find.";
    else if (kind === "eov" && /[1-4]/.test(map[id])) state.message = `${RUNE_NAMES[Number(map[id])]} rune. Use Action to attune it. ${listen()}`;
    else if (kind === "ibl" && map[id] === "P") state.message = "An ironflower bed. Use Action to plant or harvest; it grows in three turns.";
    else if (kind === "sws" && map[id] === "B") state.message = "A dark beacon. Use Action with one supply to light it.";
    else state.message = kind === "sws" ? `${highTide() ? "High" : "Low"} tide. Charts and beacon lights will guide the fleet.` : "Follow the marked paths and recover what this room needs.";
    advance();
  };
  const action = () => {
    const id = at(), tile = map[id];
    if (collectibleIds.includes(id) && !picked(id)) {
      state.picked.push(id);
      if (tile === "H") {
        if (kind === "ibl") { state.reserve = Math.min(100, state.reserve + 35); state.message = "The lunch basket restores 35 energy."; }
        else { state.health = Math.min(maxHealth, state.health + 5); state.message = "A keeper's tonic restores 5 vitality."; }
      } else state.message = kind === "hcr" ? "An ember joins the hollow crown. Its promise is safe."
        : kind === "eov" ? `A folio's voice returns. ${listen()}`
          : kind === "ibl" ? `${tile === "W" ? "One wood" : "One ore"} gathered for the repair.` : "Wreck chart recovered. Two repair supplies are aboard.";
    } else if (kind === "hcr") {
      const [dx, dy] = DIRECTIONS[state.facing];
      const front = (state.y + dy) * size + state.x + dx;
      const enemy = state.enemies.find(foe => foe.id === front && foe.hp > 0) ?? state.enemies.find(foe => foe.hp > 0 && distance(foe.id) === 1);
      if (enemy) {
        enemy.hp = Math.max(0, enemy.hp - 2);
        if (enemy.hp === 0) { state.reserve = Math.min(6, state.reserve + 1); state.message = "The sentinel rests. Recover 1 brace charge."; }
        else state.message = "Your blade breaks the sentinel's armor. Brace before its next counterstrike.";
      } else state.message = "Your blade finds no enemy. Approach a sentinel to strike.";
    } else if (kind === "eov" && /[1-4]/.test(tile)) {
      if (!allPicked("F")) state.message = "The rune is silent. Read every folio in this room first.";
      else if (state.runeProgress === sequence.length) state.message = "The memory is whole. The archive gate is open.";
      else if (Number(tile) === sequence[state.runeProgress]) {
        state.runeProgress += 1;
        state.message = state.runeProgress === sequence.length ? "The final rune sings. The archive gate is open." : `Rune ${state.runeProgress} accepted. ${listen()}`;
      } else { state.runeProgress = 0; state.health = Math.max(0, state.health - 1); state.message = `That rune breaks the memory. Lose 1 resolve and start the sequence again. ${listen()}`; }
    } else if (kind === "ibl" && tile === "P") {
      const bed = state.planted.find(item => item.id === id);
      if (!bed) {
        if (inventory().wood > 0) { state.planted.push({ id, turn: state.turn }); state.message = "Planted an ironflower with 1 wood. It will mature in three turns."; }
        else state.message = "Planting needs 1 wood. Gather a fallen beam first.";
      } else if (state.harvested.includes(id)) state.message = "This bed has given its flower. Other beds still await you.";
      else if (state.turn - bed.turn >= 3) { state.harvested.push(id); state.reserve = Math.min(100, state.reserve + 20); state.message = "A mature ironflower yields 1 bloom and restores 20 energy."; }
      else state.message = `The ironflower needs ${3 - (state.turn - bed.turn)} more turns to grow. Keep gathering or wait.`;
    } else if (kind === "sws" && tile === "B" && !state.beacons.includes(id)) {
      if (inventory().supplies >= 1) { state.beacons.push(id); state.message = "One supply lights the beacon. A ship answers with its bell."; }
      else state.message = "The beacon needs 1 supply. Salvage a wreck first.";
    } else if (kind === "sws" && state.health < maxHealth && inventory().supplies > 0) {
      state.repairs += 1; state.health = Math.min(maxHealth, state.health + 4); state.message = "Used 1 supply to repair 4 hull.";
    } else state.message = kind === "sws" ? "No salvage here. Explore for wrecks, beacons and a safe route." : "Nothing to gather here. Continue exploring the room.";
    advance();
  };
  const alt = () => {
    if (kind === "hcr") {
      if (state.reserve > 0) { state.reserve -= 1; state.guard = 2; state.message = "Brace raised. Your next two incoming strikes are absorbed."; }
      else state.message = "No brace charges remain. Defeat a sentinel to recover one.";
    } else if (kind === "eov") state.message = listen();
    else if (kind === "ibl") {
      const materials = inventory();
      if (!state.crafted && materials.wood >= cost.wood && materials.ore >= cost.ore && materials.bloom >= cost.bloom) {
        state.crafted = true; state.message = "The repair is complete. The thorn gate opens; carry your garden to the exit.";
      } else state.message = state.crafted ? "The repair is complete. Reach the open gate." : `Recipe: ${cost.wood} wood + ${cost.ore} ore + ${cost.bloom} blooms. Wait one turn for your flowers to grow.`;
    } else state.message = `Anchor down. ${Math.floor((state.turn + 1) / 3) % 2 ? "High" : "Low"} tide; the water changes every three turns.`;
    advance();
  };
  const validateSave = (value: Record<string, unknown>) => {
    const fail = () => { throw new Error("Invalid adventure save; restart the chapter"); };
    if (Object.keys(value).sort().join(" ") !== STATE_KEYS.join(" ")) fail();
    if (value.v !== 1 || value.slug !== kind || value.chapter !== chapterIndex) fail();
    if (!integer(value.x, 0, 15) || !integer(value.y, 0, 8) || !["up", "down", "left", "right"].includes(value.facing as string)) fail();
    if (!integer(value.turn, 0, 1_000_000) || typeof value.movementClock !== "number" || !Number.isFinite(value.movementClock) || value.movementClock < 0 || value.movementClock > 0.16) fail();
    if (!integer(value.health, 0, maxHealth) || !integer(value.reserve, 0, maxReserve) || !integer(value.guard, 0, kind === "hcr" ? 2 : 0)) fail();
    const validIds = (list: unknown, permitted: number[]): list is number[] => Array.isArray(list) && new Set(list).size === list.length && list.every(id => integer(id, 0, map.length - 1) && permitted.includes(id));
    if (!validIds(value.picked, collectibleIds) || !validIds(value.harvested, kind === "ibl" ? ids("P") : []) || !validIds(value.beacons, kind === "sws" ? ids("B") : [])) fail();
    if (!Array.isArray(value.planted) || (kind !== "ibl" && value.planted.length > 0) || value.planted.some(bed => !record(bed) || Object.keys(bed).sort().join() !== "id,turn" || !integer(bed.id, 0, map.length - 1) || !ids("P").includes(bed.id) || !integer(bed.turn, 0, value.turn as number))) fail();
    const beds = value.planted as { id: number; turn: number }[];
    if (new Set(beds.map(bed => bed.id)).size !== beds.length || (value.harvested as number[]).some(id => !beds.some(bed => bed.id === id && (value.turn as number) - bed.turn >= 3))) fail();
    if (!Array.isArray(value.enemies) || value.enemies.length !== enemyIds.length || value.enemies.some(foe => !record(foe) || Object.keys(foe).sort().join() !== "hp,id" || !integer(foe.id, 0, map.length - 1) || !enemyIds.includes(foe.id) || !integer(foe.hp, 0, enemyMax(foe.id)))) fail();
    if (new Set((value.enemies as Enemy[]).map(foe => foe.id)).size !== enemyIds.length) fail();
    if (!integer(value.runeProgress, 0, kind === "eov" ? sequence.length : 0) || typeof value.crafted !== "boolean" || (kind !== "ibl" && value.crafted) || !integer(value.repairs, 0, kind === "sws" ? ids("G").length * 2 : 0)) fail();
    if (!["playing", "won", "lost"].includes(value.status as string) || typeof value.message !== "string" || value.message.length > 1000) fail();
    state = JSON.parse(JSON.stringify(value)) as AdventureState;
    const materials = inventory();
    if (kind === "ibl" && (materials.wood < 0 || materials.ore < 0 || materials.bloom < 0)) fail();
    if (kind === "sws" && materials.supplies < 0) fail();
    if (kind === "eov" && state.runeProgress > 0 && !allPicked("F")) fail();
    if (map[at()] === "#" || (map[at()] === "D" && !doorOpen()) || state.enemies.some(foe => foe.hp > 0 && foe.id === at())) fail();
    const dead = state.health === 0 || (kind === "ibl" && state.reserve === 0) || stranded();
    if ((state.status === "lost") !== dead || (state.status === "won" && (!complete() || map[at()] !== "E"))) fail();
    if (state.status === "playing" && complete() && map[at()] === "E") fail();
  };
  if (restored !== undefined) validateSave(restored);

  const view = (): EngineView => {
    const materials = inventory();
    const stats = kind === "hcr" ? [{ label: "Vitality", value: `${state.health}/12` }, { label: "Brace", value: state.reserve }, { label: "Embers", value: `${collected("K")}/${ids("K").length}` }, { label: "Sentinels", value: state.enemies.filter(foe => foe.hp > 0).length }]
      : kind === "eov" ? [{ label: "Resolve", value: `${state.health}/6` }, { label: "Folios", value: `${collected("F")}/${ids("F").length}` }, { label: "Runes", value: `${state.runeProgress}/${sequence.length}` }]
        : kind === "ibl" ? [{ label: "Energy", value: state.reserve }, { label: "Wood", value: materials.wood }, { label: "Ore", value: materials.ore }, { label: "Blooms", value: materials.bloom }]
          : [{ label: "Hull", value: `${state.health}/10` }, { label: "Supplies", value: materials.supplies }, { label: "Charts", value: `${collected("G")}/${ids("G").length}` }, { label: "Beacons", value: `${state.beacons.length}/${ids("B").length}` }, { label: "Tide", value: highTide() ? "HIGH" : "LOW" }];
    return { status: state.status, objective: chapter.objective, message: state.message, stats };
  };
  const update = (dt: number, input: GameInput) => {
    if (state.status !== "playing") return;
    if (!Number.isFinite(dt) || dt < 0) return;
    state.movementClock = Math.max(0, state.movementClock - Math.min(dt, 0.2));
    const directions: Facing[] = ["up", "down", "left", "right"];
    const tapped = directions.find(direction => input.pressed.has(direction));
    const held = directions.find(direction => input.held.has(direction));
    if (input.pressed.has("action")) action();
    else if (input.pressed.has("alt")) alt();
    else if (tapped || (held && state.movementClock === 0)) { move(tapped ?? held!); state.movementClock = 0.16; }
    else if (input.pointer?.pressed) {
      const pointer = input.pointer;
      const px = Math.floor((pointer.x - 24) / 46), py = Math.floor((pointer.y - 68) / 46);
      if (px < 0 || px >= size || py < 0 || py >= 9) return;
      const dx = px - state.x, dy = py - state.y;
      if (dx === 0 && dy === 0) action();
      else { const direction: GameButton = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up"; move(direction as Facing); state.movementClock = 0.16; }
    }
  };

  const render = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save(); ctx.scale(width / 960, height / 540);
    const [background, , accent] = campaign.palette;
    const gold = kind === "hcr" ? "#f3bf73" : kind === "eov" ? "#e4c586" : kind === "ibl" ? "#dfb771" : "#ffcf82";
    ctx.fillStyle = background; ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = "#ffffff08"; for (let x = 0; x < 960; x += 24) ctx.fillRect(x, 0, 1, 540);
    ctx.fillStyle = accent; ctx.font = "bold 24px monospace"; ctx.fillText(campaign.title.toUpperCase(), 24, 35);
    ctx.fillStyle = "#e5e8ec"; ctx.font = "12px monospace"; ctx.fillText(chapter.title, 24, 54);
    ctx.textAlign = "right"; ctx.fillStyle = gold; ctx.fillText(`CHAPTER ${chapterIndex + 1}/6 · TURN ${state.turn}`, 936, 35); ctx.textAlign = "left";
    const t = 46, ox = 24, oy = 68;
    const rect = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
    const diamond = (x: number, y: number, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 12); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill(); };
    const rune = (number: number, x: number, y: number) => {
      ctx.strokeStyle = gold; ctx.lineWidth = 2;
      if (number === 1) { ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke(); for (let a = 0; a < 8; a++) { const r = a * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(r) * 11, y + Math.sin(r) * 11); ctx.lineTo(x + Math.cos(r) * 15, y + Math.sin(r) * 15); ctx.stroke(); } }
      if (number === 2) { for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 15, y - 8 + i * 8); ctx.quadraticCurveTo(x - 5, y - 14 + i * 8, x, y - 8 + i * 8); ctx.quadraticCurveTo(x + 8, y - 2 + i * 8, x + 15, y - 8 + i * 8); ctx.stroke(); } }
      if (number === 3) { ctx.beginPath(); ctx.moveTo(x, y - 15); ctx.lineTo(x, y + 5); ctx.lineTo(x - 10, y + 14); ctx.moveTo(x, y + 5); ctx.lineTo(x + 10, y + 14); ctx.moveTo(x, y); ctx.lineTo(x - 10, y - 6); ctx.moveTo(x, y - 4); ctx.lineTo(x + 10, y - 10); ctx.stroke(); }
      if (number === 4) { ctx.beginPath(); ctx.arc(x, y, 13, .65, 5.6); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 7, y - 3, 10, 1.05, 5.1); ctx.stroke(); }
    };
    for (let id = 0; id < map.length; id++) {
      const tile = map[id], x = ox + (id % size) * t, y = oy + Math.floor(id / size) * t, cx = x + t / 2, cy = y + t / 2;
      const sea = kind === "sws" && tile !== "#";
      rect(x, y, t, t, tile === "#" ? kind === "sws" ? "#32494c" : "#343344" : sea ? (id % 3 ? "#14425d" : "#194b64") : kind === "ibl" ? (id % 3 ? "#314438" : "#394c3e") : kind === "eov" ? "#253d47" : "#292638");
      rect(x + 1, y + 1, t - 2, 1, "#ffffff0e"); rect(x + 1, y + 1, 1, t - 2, "#ffffff08");
      if (tile === "#") {
        if (kind === "ibl") { rect(x + 8, y + 10, 29, 24, "#3e6245"); rect(x + 14, y + 5, 18, 32, "#47774f"); rect(x + 21, y + 29, 5, 14, "#927254"); }
        else if (kind === "sws") { rect(x + 10, y + 15, 25, 23, "#768577"); rect(x + 16, y + 8, 14, 26, "#98a38d"); }
        else { rect(x + 4, y + 5, 38, 13, "#494453"); rect(x + 6, y + 23, 14, 17, "#454050"); rect(x + 23, y + 23, 17, 17, "#454050"); }
        continue;
      }
      if (sea) { rect(x + 7, y + 12 + (id % 3) * 8, 19, 2, "#77b9cd36"); rect(x + 25, y + 29, 10, 2, "#77b9cd26"); }
      else if (id % 7 === 0) { rect(x + 8, y + 33, 7, 2, "#ffffff15"); rect(x + 31, y + 12, 5, 2, "#ffffff12"); }
      if (tile === "D") { rect(x + 8, y + 5, 30, 36, doorOpen() ? "#759e704b" : "#554560"); rect(x + 13, y + 7, 4, 32, accent); rect(x + 29, y + 7, 4, 32, accent); if (!doorOpen()) rect(x + 13, y + 19, 20, 7, gold); }
      if (tile === "E") { rect(x + 6, y + 7, 34, 32, complete() ? "#79dfa459" : "#ffffff0c"); ctx.strokeStyle = complete() ? "#a7efb4" : gold; ctx.lineWidth = 2; ctx.strokeRect(x + 9, y + 9, 28, 28); ctx.beginPath(); ctx.moveTo(x + 17, cy); ctx.lineTo(x + 30, cy); ctx.lineTo(x + 25, cy - 5); ctx.moveTo(x + 30, cy); ctx.lineTo(x + 25, cy + 5); ctx.stroke(); }
      if (collectibleIds.includes(id) && !picked(id)) {
        if (tile === "K") { rect(x + 12, y + 31, 22, 5, "#69566d"); diamond(cx, cy - 2, gold); diamond(cx, cy - 2, "#ffe8b65e"); }
        if (tile === "F") { rect(x + 11, y + 10, 25, 29, "#ead7a5"); rect(x + 15, y + 14, 16, 2, "#8c7958"); rect(x + 15, y + 20, 13, 2, "#8c7958"); rect(x + 15, y + 26, 16, 2, "#8c7958"); }
        if (tile === "W") { rect(x + 9, y + 14, 29, 11, "#aa8154"); rect(x + 12, y + 26, 26, 9, "#816446"); rect(x + 12, y + 15, 3, 9, "#d2aa6c"); }
        if (tile === "O") { rect(x + 9, y + 16, 29, 22, "#656f80"); rect(x + 15, y + 10, 18, 27, "#8a9ba4"); rect(x + 21, y + 14, 7, 6, gold); }
        if (tile === "H") { rect(x + 15, y + 16, 18, 24, kind === "ibl" ? "#a37b42" : "#bc6685"); rect(x + 19, y + 9, 10, 9, "#e3ca9c"); rect(x + 22, y + 22, 4, 12, "#ffe9c3"); rect(x + 18, y + 26, 12, 4, "#ffe9c3"); }
        if (tile === "G") { rect(x + 8, y + 23, 31, 10, "#96704a"); rect(x + 19, y + 9, 4, 27, "#cca479"); rect(x + 23, y + 11, 13, 13, "#ded0b5"); rect(x + 9, y + 35, 31, 2, "#80d7e0"); }
      }
      if (kind === "eov" && /[1-4]/.test(tile)) { rect(x + 4, y + 4, 38, 38, "#31565e"); rune(Number(tile), cx, cy); }
      if (kind === "ibl" && tile === "P") {
        rect(x + 7, y + 10, 33, 30, "#785841"); for (let k = 0; k < 3; k++) rect(x + 10, y + 14 + k * 8, 26, 2, "#3e392a");
        const bed = state.planted.find(item => item.id === id);
        if (bed && !state.harvested.includes(id)) { const mature = state.turn - bed.turn >= 3; rect(cx - 2, cy - 2, 4, 17, "#90cc82"); rect(cx - 11, cy + 1, 10, 5, "#75a366"); rect(cx + 2, cy - 5, 9, 5, "#91c57c"); if (mature) { rect(cx - 7, cy - 13, 14, 11, gold); rect(cx - 3, cy - 10, 6, 5, "#7a657e"); } }
      }
      if (kind === "sws" && tile === "B") { rect(x + 9, y + 31, 30, 9, "#78897f"); rect(x + 17, y + 13, 14, 23, "#d9d3b6"); rect(x + 13, y + 8, 22, 7, "#685149"); rect(x + 20, y + 4, 8, 9, state.beacons.includes(id) ? "#ffdf87" : "#576c71"); if (state.beacons.includes(id)) rect(x + 4, y + 2, 38, 3, "#ffdf8759"); }
      if (kind === "sws" && tile === "R") { rect(x + 5, y + 29, 13, 8, highTide() ? "#76a1a66a" : "#c1b38a"); rect(x + 23, y + 12, 17, 9, highTide() ? "#76a1a66a" : "#c1b38a"); }
      if (kind === "sws" && tile === "X") { ctx.strokeStyle = "#bbc8e3"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 29, y + 7); ctx.lineTo(x + 19, y + 23); ctx.lineTo(x + 29, y + 21); ctx.lineTo(x + 17, y + 38); ctx.stroke(); }
    }
    for (const foe of state.enemies) {
      const x = ox + (foe.id % size) * t, y = oy + Math.floor(foe.id / size) * t;
      if (foe.hp === 0) { rect(x + 14, y + 30, 18, 5, "#756577"); continue; }
      const boss = map[foe.id] === "B";
      rect(x + 10, y + 18, 27, 22, boss ? "#8f6b8d" : "#5e6477"); rect(x + 15, y + 7, 17, 17, boss ? "#bb8fb0" : "#8992a5"); rect(x + 17, y + 14, 13, 4, "#e67b7e"); rect(x + 35, y + 13, 4, 25, "#c4b8ba"); rect(x + 8, y + 41, 30, 3, "#3b3348"); rect(x + 8, y + 41, 30 * foe.hp / enemyMax(foe.id), 3, "#e89298");
    }
    const hx = ox + state.x * t, hy = oy + state.y * t;
    if (kind === "sws") {
      rect(hx + 6, hy + 28, 34, 9, "#ac784b"); rect(hx + 13, hy + 37, 23, 4, "#6d503d"); rect(hx + 20, hy + 5, 4, 28, "#ead7aa"); ctx.fillStyle = "#f5ebd2"; ctx.beginPath(); ctx.moveTo(hx + 25, hy + 7); ctx.lineTo(hx + 38, hy + 26); ctx.lineTo(hx + 25, hy + 26); ctx.closePath(); ctx.fill(); rect(hx + 5, hy + 42, 35, 2, accent);
    } else {
      rect(hx + 10, hy + 39, 27, 4, "#0000005a"); rect(hx + 14, hy + 20, 18, 20, accent); rect(hx + 18, hy + 9, 13, 14, "#f0c6a0"); rect(hx + 16, hy + 6, 17, 7, kind === "hcr" ? "#ccb680" : kind === "eov" ? "#55828d" : "#bea666"); rect(hx + 19, hy + 15, 3, 3, "#2b2532"); rect(hx + 28, hy + 15, 3, 3, "#2b2532"); rect(hx + 16, hy + 39, 6, 4, "#363548"); rect(hx + 26, hy + 39, 6, 4, "#363548");
      if (kind === "hcr") { rect(hx + 34, hy + 17, 3, 23, "#dad4cf"); rect(hx + 30, hy + 32, 11, 3, gold); if (state.guard > 0) { ctx.strokeStyle = gold; ctx.lineWidth = 2; ctx.strokeRect(hx + 6, hy + 5, 35, 39); } }
    }
    const [dx, dy] = DIRECTIONS[state.facing]; rect(hx + 23 + dx * 21 - 2, hy + 23 + dy * 21 - 2, 4, 4, "#ffffff");
    rect(779, 68, 157, 414, "#ffffff08");
    ctx.fillStyle = gold; ctx.font = "bold 13px monospace"; ctx.fillText("FIELD JOURNAL", 790, 90);
    let lineY = 117;
    for (const stat of view().stats) { ctx.fillStyle = "#bac4c9"; ctx.font = "11px monospace"; ctx.fillText(stat.label.toUpperCase(), 790, lineY); ctx.fillStyle = "#f5f0e6"; ctx.font = "bold 17px monospace"; ctx.fillText(String(stat.value), 790, lineY + 21); lineY += 47; }
    const wrap = (words: string, y: number, color: string, font = "11px monospace") => {
      ctx.fillStyle = color; ctx.font = font; let line = ""; let yy = y;
      for (const word of words.split(" ")) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > 136 && line) { ctx.fillText(line, 790, yy); yy += 16; line = word; } else line = next; }
      if (line) { ctx.fillText(line, 790, yy); yy += 16; } return yy;
    };
    const hints = kind === "hcr" ? "Gold: ember. Rose: tonic. Gray: scout. Violet: warden. Brace before fighting."
      : kind === "eov" ? allPicked("F") ? sequence.map(n => RUNE_NAMES[n]).join(" → ") : "Paper: folios. Read every page before activating the rune memory."
        : kind === "ibl" ? `Repair: ${cost.wood} wood, ${cost.ore} ore, ${cost.bloom} blooms. Beds mature in three turns.`
          : "Wreck: chart +2 supplies. Beacon: costs 1. Storm: -1 hull. Shallows: high tide.";
    wrap(hints, Math.min(lineY + 8, 375), accent);
    ctx.fillStyle = "#cbd2d9"; ctx.font = "12px monospace"; ctx.fillText("D-PAD / ARROWS  MOVE     A  " + campaign.actionLabel.toUpperCase() + "     X  " + campaign.altLabel.toUpperCase(), 24, 512);
    if (state.status !== "playing") {
      rect(24, 202, 736, 137, "#0b1525ec"); ctx.fillStyle = state.status === "won" ? "#a7efb4" : "#efaa9b"; ctx.font = "bold 28px monospace"; ctx.textAlign = "center"; ctx.fillText(state.status === "won" ? "CHAPTER COMPLETE" : "TRY THE CHAPTER AGAIN", 392, 261); ctx.fillStyle = "#e9e8dc"; ctx.font = "14px monospace"; ctx.fillText(state.status === "won" ? "Your journey continues beyond this room." : "Learn from the room. Your adventure is still waiting.", 392, 297); ctx.textAlign = "left";
    }
    ctx.restore();
  };
  const engine: GameEngine = { update, render, view, save: () => JSON.parse(JSON.stringify(state)) as Record<string, unknown> };
  return engine;
};
