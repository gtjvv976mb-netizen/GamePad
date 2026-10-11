import type { Campaign, CampaignChapter } from '../types';

const chapter = (title: string, briefing: string, objective: string, after: string, config: Record<string, unknown>): CampaignChapter => ({ title, briefing, objective, after, config });
const race = (points: number[][], mines: number[][], width = 118) => ({ points, mines, width });
const salvage = (pods: number[][], rocks: number[][], base: number[] = [120, 270]) => ({ pods, rocks, base });
const delivery = (stops: number[][], buildings: number[][], traffic: number[][]) => ({ stops, buildings, traffic, hub: [92, 270] });
const dive = (relics: number[][], air: number[][], walls: number[][], currents: number[][], exit: number[], oxygen = 28) => ({ relics, air, walls, currents, exit, oxygen, start: [75, 105] });
const arena = (waves: number[][][], walls: number[][]) => ({ waves, walls, start: [480, 270] });
const RIDGES = [
 [[110,530,160,22],[320,465,150,22],[525,390,150,22],[720,325,160,22],[940,380,150,22],[1150,305,155,22],[1365,245,160,22],[1580,320,155,22],[1790,390,160,22],[2010,325,155,22],[2220,245,160,22],[2430,310,150,22],[2635,245,250,22]],
 [[110,520,155,22],[325,440,150,22],[545,355,145,22],[765,285,155,22],[985,365,150,22],[1200,290,150,22],[1410,205,160,22],[1630,280,155,22],[1850,365,160,22],[2070,285,155,22],[2290,205,160,22],[2495,280,150,22],[2690,210,220,22]],
 [[110,515,150,22],[320,425,145,22],[530,340,150,22],[740,265,155,22],[955,350,150,22],[1175,275,145,22],[1380,195,165,22],[1600,275,150,22],[1810,355,155,22],[2025,275,150,22],[2240,190,155,22],[2445,270,150,22],[2650,200,250,22]],
 [[110,520,150,22],[315,440,145,22],[515,360,145,22],[720,280,150,22],[930,360,145,22],[1135,280,150,22],[1345,205,150,22],[1550,280,155,22],[1760,355,150,22],[1970,270,150,22],[2180,190,150,22],[2390,265,160,22],[2610,185,285,22]],
 [[110,515,145,22],[315,425,145,22],[525,335,145,22],[735,250,150,22],[945,335,145,22],[1150,255,150,22],[1360,170,150,22],[1570,250,150,22],[1780,335,150,22],[1990,250,150,22],[2200,165,150,22],[2410,240,160,22],[2630,170,285,22]],
] as number[][][];
const rift = (index: number) => {
 const p=RIDGES[index], route=p.map(([x,y,w])=>[x+w/2,y-18]), checkpoints=[[65,602],route[4],route[8]];
 const ground=[[0,620,370,100],[680,640,190,80],[1490,660,170,60],[2050,640,175,80],[2820,600,180,120]];
 return {world:[3000,720],biome:['moonlit','windward','garden','mirrors','crown'][index],platforms:[...ground,...p],route,runes:[route[0],route[2],route[4],route[6],route[8],route[10],route[12]].map(([x,y])=>[x,y-15]),spikes:[[460,680,130,40],[1730,680,155,40],[2320,680,120,40]],start:[65,602],exit:[p[12][0]+p[12][2]-45,p[12][1]-25],checkpoints,secrets:[[p[3][0]+p[3][2]/2,p[3][1]-155],[p[9][0]+p[9][2]/2,p[9][1]-150]],motions:index>0?[[8,0,20,4.8],[12,0,18,5.5]]:[],fragile:index>1?[10,14]:[],patrols:[[p[3][0]+p[3][2]/2,p[3][1]-20,0,40],[p[7][0]+p[7][2]/2,p[7][1]-20,0,35],...(index===4?[[p[12][0]+p[12][2]/2,p[12][1]-25,2,70]]:[])],bossName:index===4?'The Crown Guardian':undefined};
};

/** Original, fully local chapters. Coordinates are authored level geometry, not remote assets. */
export const ACTION_CAMPAIGNS: Campaign[] = [
  {
    slug: 'ndp', title: 'Neon Drift Protocol', family: 'action', mechanic: 'Hover racing',
    description: 'Pilot a courier hovercraft through five forbidden circuits to restore the city’s transport grid.',
    controls: 'Up: thrust · Down: brake/reverse · Left/Right: steer · Action: boost · Alt: drift / handbrake', actionLabel: 'Boost', altLabel: 'Brake', palette: ['#101d35', '#54264b', '#03f5d1'],
    chapters: [
      chapter('01 · Ignition Alley', 'The transit grid has gone dark. Mechanic Ada lends you her old hovercraft; prove its steering on the abandoned service loop.', 'Pass each numbered gate in order, then cross the finish. Stay on the illuminated road.', 'Ada’s engine works. A hidden broadcast reveals that five relay circuits were cut deliberately.', race([[160, 410], [160, 140], [790, 140], [790, 410]], [])),
      chapter('02 · Switchback District', 'The first relay lies beyond a district of tight switchbacks. Ease off the thrust before each turn.', 'Complete the switchback circuit without destroying the hull.', 'The relay returns local transport to the district. Its logs point toward the canal.', race([[130, 420], [130, 160], [340, 160], [340, 360], [590, 360], [590, 120], [820, 120], [820, 420]], [[465, 360]], 116)),
      chapter('03 · Canal Ghosts', 'Someone has left pulse mines on the canal road. Their magenta warning rings are visible; give them room.', 'Thread every gate around the canal mines, then return to the start.', 'The canal lights return. Ada decodes a beacon from the rooftop exchange.', race([[150, 420], [110, 260], [250, 125], [520, 100], [810, 180], [830, 370], [550, 420]], [[205, 190], [675, 125], [815, 310]], 126)),
      chapter('04 · Rooftop Relay', 'The exchange road zigzags across the rooftops. Controlled braking matters more than speed.', 'Restore the exchange by passing all seven rooftop gates.', 'The exchange exposes the blackout source: the old Central Ring’s locked relay.', race([[135, 425], [135, 145], [420, 145], [420, 300], [655, 300], [655, 115], [840, 115], [840, 425]], [[280, 160], [540, 285], [825, 265]], 110)),
      chapter('05 · Central Ring', 'The final relay only accepts a complete circuit. The city listens as Ada counts down your run.', 'Finish the Central Ring with your hull intact to reboot the network.', 'The ring accepts your signature. Bridges, trains and landing lanes ignite across the city.', race([[130, 415], [105, 255], [215, 120], [440, 100], [665, 125], [845, 235], [800, 415], [490, 425]], [[160, 175], [550, 118], [820, 340], [330, 418]], 120)),
    ], ending: 'The city moves again. Ada paints your callsign on the hovercraft, and the Night Courier route becomes the first free line in the new grid.',
  },
  {
    slug: 'osv', title: 'Orbital Salvage', family: 'action', mechanic: 'Inertial salvage',
    description: 'Thrust, brake and tow derelict cargo through an asteroid field to rebuild a stranded orbital station.',
    controls: 'Arrows: directional thrust · Action: tractor pickup/unload · Alt: stabilizing brake · Hold Tractor: repel drones', actionLabel: 'Tractor', altLabel: 'Stabilize', palette: ['#11162e', '#3b3c60', '#8bacff'],
    chapters: [
      chapter('01 · Empty Berth', 'Your station has lost its supply convoy. Retrieve the two drifting power cells; inertia persists until you brake.', 'Tractor each cell, then unload it inside the blue station ring.', 'Emergency lighting flickers on. A distress chart marks the convoy wreck.', salvage([[430, 160], [745, 380]], [[480, 285, 38]])),
      chapter('02 · Wreck Field', 'Convoy cargo is scattered behind dense rock. Carry one crate at a time and stabilize before unloading.', 'Recover three cargo crates without losing your tug.', 'The station receives food and reactor coolant. One crate contains a route to an abandoned repair dock.', salvage([[750, 100], [775, 435], [500, 275]], [[350, 165, 44], [355, 375, 46], [650, 275, 47]])),
      chapter('03 · Broken Dock', 'The repair dock has collapsed into an arc of metal. Its four tool lockers can still save the station.', 'Tow all four lockers through the gaps in the debris arc.', 'The engineers repair the oxygen scrubber and discover the missing antenna coordinates.', salvage([[800, 100], [825, 260], [790, 440], [525, 100]], [[400, 110, 46], [425, 245, 48], [450, 400, 50], [660, 175, 44], [640, 365, 45]])),
      chapter('04 · Silent Array', 'The antenna parts lie among old satellite cores. Heavier cargo reduces your acceleration: make space to brake.', 'Deliver four antenna modules to the station berth.', 'A voice answers the rebuilt array. A rescue ship is approaching, but the station lacks its docking beacon.', salvage([[840, 95], [710, 270], [840, 450], [485, 435]], [[320, 160, 50], [320, 365, 50], [540, 250, 56], [715, 125, 44], [720, 410, 44]])),
      chapter('05 · Home Signal', 'The beacon’s five components are the last things the convoy carried. Bring them home through the outer field.', 'Assemble the rescue beacon by salvaging all five components.', 'The beacon locks onto the rescue ship. Its engines paint the station windows gold.', salvage([[850, 80], [820, 200], [825, 365], [800, 465], [535, 95]], [[295, 125, 43], [310, 290, 50], [340, 445, 44], [545, 200, 48], [540, 385, 49], [715, 290, 48]])),
    ], ending: 'The station’s families board the rescue ship. You leave one lamp burning at the salvage berth, a promise to every traveler who may need a way home.',
  },
  {
    slug: 'slc', title: 'Starline Couriers', family: 'action', mechanic: 'City delivery',
    description: 'Navigate a night city’s traffic and deliver the parcels that reconnect five isolated neighborhoods.',
    controls: 'Arrows: drive · Action: pick up/deliver · Alt: turbo (uses battery) · Blue markers: business pickups · Depot repairs and charges', actionLabel: 'Deliver', altLabel: 'Turbo', palette: ['#1b1732', '#354764', '#ffb65e'],
    chapters: [
      chapter('01 · The First Letter', 'The last train has gone. Take two letters from the depot to neighbors waiting under amber delivery lights.', 'Pick up at the blue depot, drive to the numbered address and deliver; repeat for every parcel.', 'Two windows light up. The neighbors ask you to carry medicine to the canal district.', delivery([[810, 110], [800, 425]], [[230, 180, 220, 170], [590, 180, 160, 165]], [[500, 80, 0, 150], [515, 460, 0, -155]])),
      chapter('02 · Canal Medicine', 'Traffic still crosses the canal. Watch the red shuttles and stop at the depot between deliveries.', 'Deliver three medicine boxes. Avoid traffic and keep the van’s battery charged.', 'The clinic opens for the night. A musician sends three instrument cases to the market.', delivery([[470, 80], [820, 270], [470, 470]], [[220, 155, 170, 225], [560, 150, 160, 230]], [[470, 270, 140, 0], [825, 70, 0, 145], [120, 430, 165, 0]])),
      chapter('03 · Market Encore', 'The market’s musicians cannot perform without their instruments. Slip through the service streets.', 'Deliver the three cases in sequence, returning to the depot for each one.', 'The market fills with music. Their broadcast reaches families on the hill.', delivery([[810, 85], [810, 450], [475, 265]], [[220, 130, 170, 120], [220, 310, 170, 120], [595, 165, 150, 215]], [[480, 80, 0, 150], [835, 275, -150, 0], [470, 465, 155, 0]])),
      chapter('04 · Hilltop Stories', 'Four families need the memory drives that the courier network lost. The hill streets are busy tonight.', 'Bring all four memory drives to their owners.', 'Forgotten voices play through the hill. One final parcel must reach the city’s broadcast tower.', delivery([[480, 78], [840, 165], [825, 450], [465, 450]], [[225, 135, 170, 240], [585, 235, 155, 125], [580, 80, 155, 90]], [[480, 270, 165, 0], [840, 80, 0, 160], [115, 430, 175, 0], [465, 465, 0, -145]])),
      chapter('05 · Dawn Route', 'The final route carries a city-wide invitation. Make five stops before the tower can broadcast everyone’s reply.', 'Complete the five-stop dawn route with your van intact.', 'The tower receives every reply. The invitation goes out: the city’s first shared dawn festival.', delivery([[470, 80], [835, 80], [840, 270], [830, 465], [470, 460]], [[225, 150, 170, 230], [585, 155, 170, 225]], [[470, 270, 170, 0], [835, 80, 0, 170], [120, 455, 180, 0], [475, 80, 0, 160], [820, 455, -155, 0]])),
    ], ending: 'At dawn, every neighborhood meets in the market. Your little van is parked beside the stage, covered in handwritten thank-you notes.',
  },
  {
    slug: 'dpt', title: 'Deep Tide', family: 'action', mechanic: 'Oxygen expedition',
    description: 'Dive through five drowned ruins, follow air pockets and recover the pieces of an ancient tide engine.',
    controls: 'Arrows: swim · Action: recover relic/use exit · Alt: swim burst (costs oxygen) · Bubbles refill air · Action also releases pressure valves', actionLabel: 'Recover', altLabel: 'Burst', palette: ['#061b33', '#22585c', '#59f2df'],
    chapters: [
      chapter('01 · The Sunken Door', 'A tide pulse is flooding the coast. Recover two brass keys from the first chamber; the silver bubbles restore your air.', 'Recover both keys, then use the green exit seal. Surface air and bubble vents refill oxygen.', 'The door opens onto a city buried beneath the current.', dive([[320, 190], [730, 400]], [[450, 120], [700, 280]], [[410, 240, 55, 245]], [[500, 350, 300, 120, -25, 0]], [870, 440])),
      chapter('02 · Whisper Hall', 'Records say the tide engine had three governors. Its first fragments lie below the hall’s broken pillars.', 'Find all three fragments and reach the seal while managing your air.', 'The hall’s inscriptions reveal how the engine was silenced.', dive([[280, 430], [570, 180], [830, 415]], [[240, 265], [620, 280], [820, 160]], [[370, 160, 60, 270], [675, 330, 60, 170]], [[445, 120, 180, 330, 0, 30]], [875, 460], 26)),
      chapter('03 · Inward Current', 'The current pulls toward the engine. A burst can escape it, but spends precious oxygen.', 'Recover three regulator rings and cross the opposing currents.', 'You restore the first governor. Water levels along the shore begin to fall.', dive([[265, 405], [520, 430], [795, 180]], [[260, 190], [525, 255], [795, 370]], [[360, 280, 55, 225], [625, 60, 55, 240]], [[130, 330, 460, 150, -38, 0], [700, 100, 185, 250, 0, 40]], [875, 430], 24)),
      chapter('04 · The Lantern Vault', 'Four lantern cores power the second governor. Every bubble vent here matters; plan a route between them.', 'Recover the four lantern cores and open the vault seal.', 'The lanterns ignite around you. Beyond the vault, the engine heart waits.', dive([[245, 445], [475, 125], [670, 450], [835, 195]], [[245, 270], [480, 315], [690, 200], [835, 380]], [[335, 70, 55, 285], [580, 300, 55, 210], [765, 265, 45, 235]], [[400, 100, 340, 120, 35, 0], [425, 350, 270, 130, -35, 0]], [880, 460], 23)),
      chapter('05 · Heart of the Tide', 'The coast is counting on you. Fit the five heart pieces and release the final seal before your air runs out.', 'Recover all five heart pieces and activate the engine exit.', 'The engine turns once, twice, then finds its rhythm. The dangerous tide recedes.', dive([[235, 430], [450, 150], [545, 440], [750, 160], [855, 435]], [[240, 240], [450, 330], [600, 210], [770, 345]], [[325, 160, 55, 340], [625, 300, 55, 200], [780, 220, 40, 90]], [[400, 360, 335, 130, -40, 0], [695, 70, 180, 130, 0, 36]], [880, 480], 22)),
    ], ending: 'You surface to find the harbor safe. The tide engine keeps a quiet rhythm below, and the drowned city’s lanterns become a new constellation beneath the sea.',
  },
  {
    slug: 'gla', title: 'Gridlock Arena', family: 'action', mechanic: 'Arena combat',
    description: 'Fight through five security arenas to free a district from an automated lockdown.',
    controls: 'Arrows: move · Hold Action: fire (auto-aim / right stick / mouse) · Alt: dash through danger · Action at open east door: next room', actionLabel: 'Fire', altLabel: 'Dash', palette: ['#161b24', '#455236', '#b6ff5c'],
    chapters: [
      chapter('01 · The Lock', 'The district’s old defense grid has mistaken everyone for intruders. Disable its sentries to reach the control room.', 'Clear both sentry waves. Hold fire and move to avoid the red drones.', 'The first gate opens. Security routes shift deeper into the grid.', arena([[[150, 100, 0], [810, 440, 0]], [[160, 430, 0], [820, 100, 0], [480, 80, 1]]], [])),
      chapter('02 · Crossfire', 'Ranged sentries guard the crossing. Their bolts are visible; use the pillar for cover.', 'Clear three waves, avoiding bolts and contact damage.', 'The crossing is clear. You rescue an engineer who identifies the grid’s armored nodes.', arena([[[120, 100, 1], [840, 440, 0]], [[110, 425, 0], [835, 105, 1], [475, 80, 0]], [[150, 270, 2], [805, 270, 1]]], [[390, 195, 65, 150]])),
      chapter('03 · Iron Circuit', 'Armored nodes withstand several hits. Keep moving and open a line of sight around the relay blocks.', 'Destroy all three armored waves.', 'The armor falls apart. The grid’s master signal traces to the central plaza.', arena([[[130, 100, 2], [835, 435, 0], [830, 100, 1]], [[130, 435, 2], [840, 100, 2], [475, 80, 1]], [[130, 270, 1], [830, 270, 2], [480, 465, 0]]], [[290, 160, 65, 160], [615, 220, 65, 160]])),
      chapter('04 · Plaza Siege', 'The plaza is the last junction before the command core. Sentries enter from every side.', 'Survive four waves and disable the plaza lock.', 'The last junction shuts down. You can hear the district cheering through open windows.', arena([[[125, 95, 0], [835, 95, 1], [835, 445, 0]], [[125, 445, 2], [835, 270, 1], [480, 80, 0]], [[125, 270, 1], [835, 440, 2], [480, 465, 1]], [[120, 100, 2], [835, 100, 2], [480, 460, 0]]], [[385, 140, 75, 75], [500, 320, 75, 75]])),
      chapter('05 · Command Heart', 'The core deploys everything it has. Win the final five waves and sever the lockdown signal.', 'Clear all five command waves to free the district.', 'The master signal goes silent. Every locked gate lifts at once.', arena([[[125, 100, 0], [835, 100, 1], [830, 440, 0]], [[125, 440, 2], [835, 440, 1], [480, 80, 1]], [[120, 270, 2], [835, 270, 2], [480, 460, 0]], [[120, 100, 1], [835, 100, 2], [120, 440, 0], [835, 440, 1]], [[125, 100, 2], [835, 440, 2], [835, 100, 1], [125, 440, 1]]], [[330, 205, 65, 130], [565, 205, 65, 130]])),
    ], ending: 'The engineer replaces the defense grid with a public switch. The district’s first decision is unanimous: its gates will stay open.',
  },
  {
    slug: 'rrn', title: 'Rift Runners', family: 'action', mechanic: 'Platform adventure',
    description: 'Leap through five fractured towers and reunite the runes that hold a floating island together.',
    controls: 'Left/Right: run · Action or Up: jump (two jumps before landing) · Alt: air dash · Stomp enemies / dash attack · Checkpoints save your route · Collect runes and reach the portal', actionLabel: 'Jump', altLabel: 'Dash', palette: ['#16132b', '#42385d', '#a3a4ff'],
    chapters: [
      chapter('01 · Broken Steps', 'The island’s anchor rune has shattered. Follow its fragments up the old watchtower, using a second jump in the air when needed.', 'Collect all seven runes and reach the portal at the top.', 'The first anchor lights. A bridge of starlight leads to the eastern tower.', rift(0)),
      chapter('02 · Windward Tower', 'The eastern tower has lost whole stretches of stair. Air dashes can bridge the longest gaps.', 'Gather seven wind runes, then step through the eastern portal.', 'The winds settle into a steady current. The next anchor waits above the gardens.', rift(1)),
      chapter('03 · Fractured Garden', 'The garden’s floating beds have become isolated ledges. Thorn patches mark unsafe ground below.', 'Recover the seven garden runes and reach the high portal.', 'The garden’s roots knit themselves across the cracks, and flowers open in the void.', rift(2)),
      chapter('04 · Mirror Spire', 'The mirror spire rises in a staggered spiral. Double jumps let you correct a missed landing.', 'Gather all seven mirror runes and reach the spire portal.', 'The mirror anchor reflects the island whole for a moment. Only the crown remains broken.', rift(3)),
      chapter('05 · Crown of the Rift', 'The final fragments hover above a field of thorns. Bring every anchor rune to the crown portal.', 'Recover seven crown runes and defeat the guardian and activate the final portal.', 'The final rune meets its socket. The five towers pull together, holding the island in the sky.', rift(4)),
    ], ending: 'The island’s roads reconnect. People cross the new bridges carrying lanterns, and the crown portal becomes a lookout over a world that no longer falls apart.',
  },
];

// Worlds are deliberately larger than the viewport; camera movement reveals authored routes and hazards.
for(const game of ACTION_CAMPAIGNS) game.chapters.forEach((chapter,index)=>{
 const c=chapter.config;
 if(game.slug==='rrn')return;
 if(game.slug==='gla'){
  const waves=c.waves as number[][][];
  waves.forEach((wave,n)=>{if(index>0&&n%2===0)wave.push([830,270,3]);if(index>1&&n===1)wave.push([140,100,4]);if(index>2&&n===2)wave.push([800,440,5]);});
  waves.push([[480,120,6],...(index>1?[[130,430,1],[830,430,0]]:[])]);
  c.biome=['loading-dock','crossroads','reactor','plaza','command'][index];c.bossName=['Gate Sentinel','Crossing Warden','Iron Tribunal','Plaza Siege Engine','Gridlock Prime'][index];
  chapter.objective='Clear each security room, use its east door, and defeat the sector boss. Collect dropped shield cells and dash through bolts.';return;
 }
 const scale=game.slug==='slc'?2:game.slug==='dpt'?1.65:1.8;
 c.world=[960*scale,540*scale];
 for(const key of ['points','mines','pods','stops','relics','air']) if(c[key])c[key]=(c[key] as number[][]).map(p=>p.map(v=>v*scale));
 for(const key of ['base','hub','start','exit'])if(c[key])c[key]=(c[key] as number[]).map(v=>v*scale);
 for(const key of ['buildings','walls'])if(c[key])c[key]=(c[key] as number[][]).map(r=>r.map(v=>v*scale));
 if(c.rocks)c.rocks=(c.rocks as number[][]).map(([x,y,r])=>[x*scale,y*scale,r*1.4]);
 if(c.traffic)c.traffic=(c.traffic as number[][]).map(([x,y,vx,vy])=>[x*scale,y*scale,vx,vy]);
 if(c.currents)c.currents=(c.currents as number[][]).map(([x,y,w,h,dx,dy])=>[x*scale,y*scale,w*scale,h*scale,dx,dy]);
 if(game.slug==='ndp'){
  c.width=Number(c.width)*1.45;c.laps=index===0?1:index===4?3:2;c.rivals=index===0?1:3;c.rivalSpeed=105+index*5;c.par=[50,130,115,145,190][index];c.biome=['rain-district','industrial','canal','rooftops','central'][index];
  chapter.objective=`Finish ${c.laps} lap${c.laps===1?'':'s'} through every checkpoint. Race the rivals, earn boost by drifting, and protect your hull.`;
 }else if(game.slug==='osv'){
  c.biome=['home-berth','graveyard','dockyard','satellite','rescue'][index];c.patrols=index===0?[]:[[1120,480,0,130],...(index>1?[[1450,750,1,95]]:[])];
  if(index>1){c.valves=[[510,100],[1150,850]];c.doors=[[660,80,35,160],[1210,750,35,170]];}
  chapter.objective='Recover the cargo, release marked wreck airlocks, and tow each crate safely into the station berth. Hold Tractor near hostile drones to repel them.';
 }else if(game.slug==='slc'){
  const stops=c.stops as number[][];c.pickups=stops.map((_,n)=>n===0?c.hub:n%2?[940,150]:[170,930]);c.jobTypes=stops.map((_,n)=>['standard','fragile','urgent'][(n+index)%3]);c.biome=['letters','canal','market','hilltop','festival'][index];c.signals=[[940,540],[1670,160],[200,900]];
  chapter.objective='Load each job at its blue business marker, deliver to its amber address, and protect fragile parcels. Traffic stops at red signals; the depot repairs and charges your van.';
 }else if(game.slug==='dpt'){
  c.biome=['harbor','whisper-hall','current-caves','lantern-vault','engine-heart'][index];c.oxygen=Number(c.oxygen)+14;c.patrols=[[740,560,0,85],...(index>0?[[1180,330,1,150]]:[]),...(index===4?[[1330,695,2,100]]:[])];
  c.valves=[(c.air as number[][])[0],...(index>1?[(c.air as number[][])[1]]:[])];c.doors=[[850,440,35,170],...(index>1?[[1225,100,35,190]]:[])];
  chapter.objective='Release the pressure valves, recover every relic, and use the exit seal. Refill oxygen at bubble vents, watch wildlife patrols, and burst through strong currents.';
 }
});
