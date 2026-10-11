import { expect, test } from "@playwright/test";
import { STRATEGY_CAMPAIGNS } from "../src/games/campaigns/strategy";
import { createStrategyEngine } from "../src/games/engines/strategy";
import { RECIPES } from "../src/games/engines/strategy/tavern";
import { DISHES } from "../src/games/engines/strategy/kitchen";
import { SPELLS, spellCost } from "../src/games/engines/strategy/deck";
import type { Room } from "../src/games/engines/strategy/light";
import { findLumenPlan } from "./helpers/lumen-plans";
import { hash } from "../src/games/engines/strategy/common";
import type { Campaign, GameButton, GameEngine } from "../src/games/types";
test.skip(({ isMobile }) => isMobile, "deterministic model tests run once in Node");
const c = (slug: string) => STRATEGY_CAMPAIGNS.find(c => c.slug === slug)!;
const data = <T>(e: GameEngine) => e.save().data as T;
const press = (e: GameEngine, b: GameButton) => e.update(0, { held: new Set(), pressed: new Set([b]) });
const tick = (e: GameEngine, duration = .2) => e.update(duration, { held: new Set(), pressed: new Set() });
const tap = (e: GameEngine, x: number, y: number) => e.update(0, { held: new Set(), pressed: new Set(), pointer: { x, y, pressed: true, down: true } });
const choose = (e: GameEngine, id: string) => { const choice = e.view().choices?.find(c => c.id === id); expect(choice, `available real choice ${id}: ${e.view().message}`).toBeTruthy(); expect(choice!.disabled, `enabled real choice ${id}`).not.toBe(true); e.choose!(id); };
function solveTavern(e: GameEngine) {
  if (data<{ phase: string }>(e).phase === "plan") choose(e, "open");
  for (let frame = 0; frame < 4000 && e.view().status === "playing"; frame++) {
    const s = data<{ phase: string; clock: number; job: unknown; tickets: {recipe:number;state:string;arrival:number;patience:number}[]; ovens:{recipe:number;count:number;left:number}[] }>(e);
    if (!s.job) {
      const active = s.tickets.map((t, i) => ({ t, i })).filter(({t}) => t.state === "waiting" && t.arrival <= s.clock).sort((a,b)=>a.t.patience-b.t.patience);
      const ready = active.find(({t}) => s.ovens.some(v => v.recipe === t.recipe && v.count > 0 && v.left === 0));
      if (ready) { choose(e, `guest:${ready.i}`); choose(e, `serve:${ready.i}`); }
      else if (s.ovens.some(v => !v.count)) {
        const need = active.find(({t}) => !s.ovens.some(v => v.recipe === t.recipe && v.count));
        if (need) { choose(e, `guest:${need.i}`); choose(e, `prepare:${need.t.recipe}:1`); }
      }
    }
    tick(e);
  }
}
function solveKitchen(e: GameEngine, campaign: Campaign, chapter: number) {
  if (data<{phase:string}>(e).phase === "plan") choose(e,"start");
  const cfg = campaign.chapters[chapter].config as unknown as { guests:{appetite:number[]}[];heatLimit:number };
  for (let frame=0;frame<6000 && e.view().status === "playing";frame++) {
    const s=data<{guest:number;craving:number;stage:string;stageTime:number;selected:number;flipped:boolean;warning:unknown;dodge:number;heat:number;vent:number}>(e), required=cfg.guests[s.guest].appetite[s.craving%cfg.guests[s.guest].appetite.length];
    if (s.warning && !s.dodge) choose(e,"dodge");
    if (s.heat>cfg.heatLimit-3 && !s.vent) choose(e,"vent");
    else if (!s.vent) {
      if (s.stage === "idle") choose(e,`dish:${required}`);
      else if (s.stage === "chop" && s.stageTime >= .75) press(e,"action");
      else if (s.stage === "grill" && !s.flipped && s.stageTime>=DISHES[s.selected].grill+.1) press(e,"action");
      else if (s.stage === "season") choose(e,`season:${required}`);
      else if (s.stage === "plate") press(e,"action");
    }
    tick(e);
  }
}
type P={x:number;y:number};
const dist=(a:P,b:P)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const dirs=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
function solveTactics(e:GameEngine,campaign:Campaign,chapter:number) {
  if(data<{phase:string}>(e).phase==="plan") choose(e,"deploy");
  const cfg=campaign.chapters[chapter].config as unknown as {width:number;height:number;walls:number[][];hazards:number[][];objectives:number[][];exit:number[];mission:string;turns:number};
  type U=P&{hp:number;ap:number}; type S={units:U[];enemies:(P&{hp:number})[];objectives:boolean[];cart:P;turn:number};
  const command=(p:P)=>tap(e,32+p.x*56+28,82+p.y*48+24);
  const wall=(p:P)=>cfg.walls.some(([x,y])=>x===p.x&&y===p.y);
  const visible=(a:P,b:P)=>{const n=Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))*4;for(let i=1;i<n;i++)if(wall({x:Math.round(a.x+(b.x-a.x)*i/n),y:Math.round(a.y+(b.y-a.y)*i/n)}))return false;return true;};
  const path=(a:P,b:P,s:S,u:U)=>{const q:P[][]=[[a]],seen=new Set([`${a.x},${a.y}`]);while(q.length){const p=q.shift()!,v=p[p.length-1];if(dist(v,b)===0)return p.slice(1);for(const d of dirs){const n={x:v.x+d.x,y:v.y+d.y},id=`${n.x},${n.y}`;if(n.x<0||n.y<0||n.x>=cfg.width||n.y>=cfg.height||seen.has(id)||wall(n)||[...s.units.filter(v=>v.hp&&v!==u),...s.enemies.filter(v=>v.hp)].some(v=>dist(v,n)===0)&&dist(n,b)!==0)continue;seen.add(id);q.push([...p,n]);}}return [];};
  for(let turn=0;turn<cfg.turns+2&&e.view().status==="playing";turn++){
    for(let ui=0;ui<3&&e.view().status==="playing";ui++)for(let a=0;a<2&&e.view().status==="playing";a++){
      let s=data<S>(e),u=s.units[ui];if(!u.hp||!u.ap)break;choose(e,`unit:${ui}`);const alive=s.enemies.filter(v=>v.hp),range=ui===1?4:1;
      const target=alive.filter(v=>dist(u,v)<=range&&visible(u,v)).sort((a,b)=>a.hp-b.hp)[0];
      if(target){choose(e,"skill:attack");command(target);continue;}
      const objective=cfg.objectives.map(([x,y],i)=>({x,y,i})).filter(p=>!s.objectives[p.i]).sort((a,b)=>dist(a,u)-dist(b,u))[0];
      if(!alive.length&&objective&&dist(u,objective)<=1){choose(e,"skill:interact");command(objective);continue;}
      const goal=alive.sort((a,b)=>dist(u,a)-dist(u,b))[0]??objective??(cfg.mission==="escort"?s.cart:{x:cfg.exit[0],y:cfg.exit[1]});
      const options:P[]=[];for(let y=0;y<cfg.height;y++)for(let x=0;x<cfg.width;x++){const p={x,y};if(wall(p)||s.units.some(v=>v.hp&&v!==u&&dist(v,p)===0)||alive.some(v=>dist(v,p)===0)||cfg.hazards.some(([xx,yy])=>x===xx&&y===yy))continue;const route=path(u,p,s,u);if(route.length&&route.length<=3)options.push(p);}
      options.sort((a,b)=>{const score=(p:P)=>{const r=path(p,goal,s,u);return (r.length|| (dist(p,goal)===0?0:100))+(alive.length&&dist(p,goal)<=range&&visible(p,goal)?-10:0);};return score(a)-score(b);});
      if(options[0]){choose(e,"skill:move");command(options[0]);}
    }
    if(e.view().status==="playing")press(e,"alt");
  }
}
function solveDeck(e:GameEngine) {
  if(data<{phase:string}>(e).phase==="plan")choose(e,"begin");
  for(let actions=0;actions<4000&&e.view().status==="playing";actions++){
    const s=data<{phase:string;hand:number[];energy:number;hp:number;max:number;block:number;enemyHp:number;enemyPoison:number;node:number;deck:number[]}>(e);
    if(s.phase==="route") choose(e,e.view().choices!.find(c=>c.id==="path:combat"||c.id==="path:boss")!.id);
    else if(s.phase==="reward"){const healing=e.view().choices!.find(c=>c.id.startsWith("draft:")&&/Dawn bloom|Bark mantle|Spring rain/.test(c.label));choose(e,healing?.id??"draft:skip");}
    else if(s.phase==="waypoint")choose(e,"stop:camp");
    else if(s.phase==="camp")choose(e,"rest");
    else if(s.phase==="battle"){
      const options=s.hand.map((id,i)=>({id,i,c:SPELLS[id%24]})).filter(v=>spellCost(v.id)<=s.energy);
      const intent=/Intent \w+ (\d+)/.exec(e.view().selection??"");const danger=Number(intent?.[1]??10);
      const score=(v:typeof options[number])=>(v.c.energy??0)*13+(v.c.poison??0)*2+(v.c.damage??0)*1.6+(v.c.draw??0)*5+(v.c.growth??0)*4+(v.c.heal??0)*(s.hp<s.max-5?3:.2)+(v.c.block??0)*(s.block<danger?1.5:.2)-(v.c.cost??0)*2;
      options.sort((a,b)=>score(b)-score(a));if(options[0]){for(let i=0;i<options[0].i;i++)press(e,"right"); const selected=data<{selected:number}>(e).selected;for(let i=0;i<(options[0].i-selected+s.hand.length)%s.hand.length;i++)press(e,"right");choose(e,`play:${options[0].i}`);}else press(e,"alt");
    } else throw new Error("Unexpected expedition phase "+s.phase);
  }
}
function solveBazaar(e:GameEngine,campaign:Campaign,chapter:number){
  if(data<{phase:string}>(e).phase==="plan")choose(e,"depart");
  const cfg=campaign.chapters[chapter].config as unknown as {target:number;days:number;contracts:{type:number;count:number;age:number;source:number;destination:number}[]};
  type S={town:number;day:number;cash:number;inventory:{type:number;age:number;serial:number}[];contracts:boolean[]};
  for(let i=0;i<cfg.contracts.length&&e.view().status==="playing";i++){
    const contract=cfg.contracts[i]; let s=data<S>(e);if(s.contracts[i])continue;
    if(s.town!==contract.source)choose(e,`travel:${contract.source}`);
    for(let n=0;n<contract.count;n++)choose(e,`buy:${contract.type}`);
    s=data<S>(e);if(s.town!==contract.destination)choose(e,`travel:${contract.destination}`);
    while(data<S>(e).inventory.filter(g=>g.type===contract.type&&g.age>=contract.age).length<contract.count&&e.view().status==="playing")press(e,"alt");
    choose(e,`contract:${i}`);
  }
  if(e.view().status==="playing"&&data<S>(e).town!==0)choose(e,"travel:0");
  for(let loops=0;loops<15&&e.view().status==="playing";loops++){
    let s=data<S>(e); const count=Math.min(3,Math.floor((s.cash-4)/Number(e.view().choices!.find(c=>c.id==="buy:0")!.label.match(/· (\d+)/)![1])));
    for(let n=0;n<count;n++)choose(e,"buy:0");press(e,"alt");press(e,"alt");s=data<S>(e);for(const item of s.inventory){if(e.view().status!=="playing")break;choose(e,`sell:${item.serial}`);}
  }
}
function solveLight(e:GameEngine,campaign:Campaign,chapter:number){
  if(data<{phase:string}>(e).phase==="plan")choose(e,"mode:explore");const cfg=campaign.chapters[chapter].config as unknown as {rooms:Room[]};
  for(const room of cfg.rooms){const plan=findLumenPlan(room);plan.rotations.forEach((v,i)=>{if(v!==data<{rotations:boolean[]}>(e).rotations[i])tap(e,93+room.mirrors[i].x*70,118+room.mirrors[i].y*60);});room.shutters.forEach((_,i)=>choose(e,`shutter:${i}`));plan.prisms.forEach((p,i)=>{if(!p.movable)return;choose(e,`pick:${i}`);tap(e,93+p.x*70,118+p.y*60);choose(e,"drop");});press(e,"alt");if(data<{phase:string}>(e).phase==="door")choose(e,"continue");}
}
const solvers:Record<string,(e:GameEngine,c:Campaign,ch:number)=>void>={ptv:solveTavern,kkn:solveKitchen,sft:solveTactics,mmr:solveDeck,cbz:solveBazaar,lmc:solveLight};
for(const campaign of STRATEGY_CAMPAIGNS)for(let chapter=0;chapter<6;chapter++)test(`${campaign.title} chapter ${chapter+1} earns victory with real mechanics`,()=>{
  const e=createStrategyEngine({campaign,chapterIndex:chapter});solvers[campaign.slug](e,campaign,chapter);expect(e.view().status,e.view().message+" "+e.view().selection).toBe("won");expect(e.progression!().rewarded).toEqual([chapter]);const saved=e.save();expect(saved.v).toBe(2);const restored=createStrategyEngine({campaign,chapterIndex:chapter,restored:saved});expect(restored.save()).toEqual(saved);expect(restored.view()).toEqual(e.view());expect(e.events!().some(v=>v.type==="success")).toBe(true);
});
for(const campaign of STRATEGY_CAMPAIGNS)test(`${campaign.title} validates exact save and persistent equipment`,()=>{
  const e=createStrategyEngine({campaign,chapterIndex:0});choose(e,"upgrade:0");const before=e.progression!();expect((before.upgrades as number[])[0]).toBe(1);const saved=e.save(),r=createStrategyEngine({campaign,chapterIndex:0,restored:saved});expect(r.save()).toEqual(saved);tick(r);expect(r.save()).toEqual(saved);expect(()=>createStrategyEngine({campaign,chapterIndex:1,restored:saved})).toThrow(/Invalid/);const invalid={...saved,data:{...(saved.data as object),clock:NaN}};expect(()=>createStrategyEngine({campaign,chapterIndex:0,restored:invalid})).toThrow(/Invalid/);expect(()=>createStrategyEngine({campaign,chapterIndex:0,progression:{...before,credits:-1}})).toThrow(/Invalid/);
});
test("Tavern independent stoves, batch economy and freshness",()=>{const e=createStrategyEngine({campaign:c("ptv"),chapterIndex:0});choose(e,"open");choose(e,"prepare:0:3");for(let i=0;i<30;i++)tick(e);choose(e,"guest:1");choose(e,"prepare:1:1");expect(data<{ovens:{count:number}[]}>(e).ovens[0].count).toBe(3);for(let i=0;i<300;i++)tick(e);expect(data<{wastes:number}>(e).wastes).toBeGreaterThan(0);expect(e.view().status).toBe("playing");expect(RECIPES[0].time).toBeGreaterThan(0);});
test("Kitchen misses burn a real course and precision rewards chains",()=>{const e=createStrategyEngine({campaign:c("kkn"),chapterIndex:0});choose(e,"start");choose(e,"dish:0");for(let i=0;i<3;i++)press(e,"action");for(let i=0;i<60;i++)tick(e);expect(data<{stage:string;hull:number}>(e).stage).toBe("idle");expect(data<{hull:number}>(e).hull).toBeLessThan(24);expect(e.events!().some(e=>e.type==="fail")).toBe(true);});
test("Tactics locks enemy intentions before player repositioning",()=>{const e=createStrategyEngine({campaign:c("sft"),chapterIndex:0});choose(e,"deploy");const before=data<{enemies:{intent:P[]}[]}>(e).enemies.map(v=>v.intent);choose(e,"unit:0");choose(e,"skill:move");tap(e,32+3*56+28,82+3*48+24);expect(data<{enemies:{intent:P[]}[]}>(e).enemies.map(v=>v.intent)).toEqual(before);expect(data<{units:{ap:number}[]}>(e).units[0].ap).toBe(1);});
test("Deck branches, shop removal and improved spells preserve actual cards",()=>{const e=createStrategyEngine({campaign:c("mmr"),chapterIndex:0});choose(e,"begin");choose(e,"path:event");choose(e,"bargain:leave");choose(e,"stop:shop");const size=data<{deck:number[]}>(e).deck.length;choose(e,"remove:0");expect(data<{deck:number[]}>(e).deck.length).toBe(size-1);choose(e,"leave");choose(e,"path:combat");const s=data<{deck:number[];draw:number[];hand:number[];discard:number[];exile:number[]}>(e);expect([...s.hand,...s.draw,...s.discard,...s.exile].sort()).toEqual([...s.deck].sort());});
test("Bazaar aging, routes and contracts use working capital",()=>{const e=createStrategyEngine({campaign:c("cbz"),chapterIndex:0});choose(e,"depart");choose(e,"buy:0");choose(e,"buy:0");const cash=data<{cash:number}>(e).cash;choose(e,"travel:1");expect(data<{inventory:{age:number}[]}>(e).inventory.every(v=>v.age===1)).toBe(true);expect(data<{cash:number}>(e).cash).toBe(cash-3);choose(e,"contract:0");expect(data<{contracts:boolean[]}>(e).contracts[0]).toBe(true);expect(data<{inventory:unknown[]}>(e).inventory).toHaveLength(0);});
test("Lumen exploration and precision have distinct failure rules",()=>{const campaign=c("lmc"),e=createStrategyEngine({campaign,chapterIndex:0});choose(e,"mode:explore");for(let i=0;i<15;i++)press(e,"alt");expect(e.view().status).toBe("playing");const p=createStrategyEngine({campaign,chapterIndex:0});choose(p,"mode:precision");for(let i=0;i<15;i++)press(p,"alt");expect(p.view().status).toBe("lost");});
test("Earned guild rewards cannot be farmed by replay or resume",()=>{const campaign=c("mmr"),e=createStrategyEngine({campaign,chapterIndex:0});solveDeck(e);expect(e.view().status).toBe("won");const progression=e.progression!(),replay=createStrategyEngine({campaign,chapterIndex:0,progression});solveDeck(replay);expect(replay.view().status).toBe("won");expect(replay.progression!()).toEqual(progression);const next=createStrategyEngine({campaign,chapterIndex:1,progression});expect(next.progression!()).toEqual(progression);});

for(const campaign of STRATEGY_CAMPAIGNS)test(`${campaign.title} carries earned equipment through its whole campaign`,()=>{
  let progression:Record<string,unknown>|undefined;
  for(let chapter=0;chapter<6;chapter++){
    const e=createStrategyEngine({campaign,chapterIndex:chapter,progression});const upgrade=e.view().choices!.find(c=>c.id===`upgrade:${chapter%4}`&&!c.disabled);if(upgrade)choose(e,upgrade.id);
    solvers[campaign.slug](e,campaign,chapter);expect(e.view().status,e.view().message).toBe("won");progression=e.progression!();expect((progression.rewarded as number[]).length).toBe(chapter+1);
  }
  expect((progression!.upgrades as number[]).reduce((a,b)=>a+b,0)).toBeGreaterThan(3);
});
function beginPlayable(e:GameEngine,campaign:Campaign){
  const start:Record<string,string>={ptv:"open",kkn:"start",sft:"deploy",mmr:"begin",cbz:"depart",lmc:"mode:explore"};choose(e,start[campaign.slug]);
  if(campaign.slug==="ptv")choose(e,"prepare:0:1");
  if(campaign.slug==="kkn")choose(e,"dish:0");
  if(campaign.slug==="sft"){choose(e,"skill:move");tap(e,32+3*56+28,82+3*48+24);}
  if(campaign.slug==="mmr"){choose(e,"path:combat");const card=e.view().choices!.find(c=>c.id.startsWith("play:")&&!c.disabled)!;choose(e,card.id);}
  if(campaign.slug==="cbz"){choose(e,"buy:0");choose(e,"travel:1");}
  if(campaign.slug==="lmc")choose(e,"mirror:0");
}
for(const campaign of STRATEGY_CAMPAIGNS)test(`${campaign.title} resumes a live simulation exactly`,()=>{
  const e=createStrategyEngine({campaign,chapterIndex:0});beginPlayable(e,campaign);for(let i=0;i<10;i++)tick(e);
  const saved=e.save(),r=createStrategyEngine({campaign,chapterIndex:0,restored:saved});expect(r.save()).toEqual(saved);
  for(let i=0;i<35;i++){tick(e);tick(r);expect(r.save()).toEqual(e.save());expect(r.view()).toEqual(e.view());}
});
for(const campaign of STRATEGY_CAMPAIGNS)test(`${campaign.title} has an earned and restorable failure`,()=>{
  const e=createStrategyEngine({campaign,chapterIndex:0});const start:Record<string,string>={ptv:"open",kkn:"start",sft:"deploy",mmr:"begin",cbz:"depart",lmc:"mode:precision"};choose(e,start[campaign.slug]);if(campaign.slug==="mmr")choose(e,"path:combat");
  for(let i=0;i<2500&&e.view().status==="playing";i++){if(["sft","mmr","cbz","lmc"].includes(campaign.slug))press(e,"alt");else tick(e);}
  expect(e.view().status,e.view().message).toBe("lost");expect(e.progression!().rewarded).toEqual([]);const saved=e.save();expect(createStrategyEngine({campaign,chapterIndex:0,restored:saved}).save()).toEqual(saved);
});
test("Long kitchen preparation and missed caravan deadline remain valid exact saves",()=>{
  const k=createStrategyEngine({campaign:c("kkn"),chapterIndex:0});choose(k,"start");choose(k,"dish:0");for(let i=0;i<170;i++)tick(k);expect(data<{stageTime:number}>(k).stageTime).toBeGreaterThan(30);expect(createStrategyEngine({campaign:c("kkn"),chapterIndex:0,restored:k.save()}).save()).toEqual(k.save());
  const b=createStrategyEngine({campaign:c("cbz"),chapterIndex:0});choose(b,"depart");for(let i=0;i<15;i++)press(b,"alt");expect(b.view().status).toBe("lost");expect(createStrategyEngine({campaign:c("cbz"),chapterIndex:0,restored:b.save()}).view()).toEqual(b.view());
});
test("Lumen's open gate freezes its exact checkpoint until a decision",()=>{
  const campaign=c("lmc"),e=createStrategyEngine({campaign,chapterIndex:0});choose(e,"mode:explore");const room=(campaign.chapters[0].config as unknown as {rooms:Room[]}).rooms[0],plan=findLumenPlan(room);plan.rotations.forEach((v,i)=>{if(v!==data<{rotations:boolean[]}>(e).rotations[i])choose(e,`mirror:${i}`);});press(e,"alt");expect(data<{phase:string}>(e).phase).toBe("door");const saved=e.save();for(let i=0;i<15;i++)tick(e);expect(e.save()).toEqual(saved);
});
test("Lumen requires a moved color crystal and an opened shutter in deeper rooms",()=>{
  const campaign=c("lmc"),rooms=(campaign.chapters[5].config as unknown as {rooms:Room[]}).rooms;
  for(const room of rooms.slice(1)){const plan=findLumenPlan(room);expect(plan.prisms.some((p,i)=>p.x!==room.prisms[i].x||p.y!==room.prisms[i].y)).toBe(true);expect(plan.shutters.every(Boolean)).toBe(true);expect(room.mirrors.some(m=>m.splitter)).toBe(true);}
});

for(const campaign of STRATEGY_CAMPAIGNS)test(`${campaign.title} rejects structurally forged state even with a matching checksum`,()=>{
  const e=createStrategyEngine({campaign,chapterIndex:0});beginPlayable(e,campaign);const saved=e.save(),s=saved.data as Record<string,unknown>;
  if(campaign.slug==="ptv")s.stock=[500,500,500,500];
  if(campaign.slug==="kkn")s.hp=0;
  if(campaign.slug==="sft")s.kills=20;
  if(campaign.slug==="mmr")s.enemyHp=0;
  if(campaign.slug==="cbz")s.serial=50;
  if(campaign.slug==="lmc")s.completed=3;
  saved.checksum=hash(JSON.stringify([saved.data,saved.progress]));expect(()=>createStrategyEngine({campaign,chapterIndex:0,restored:saved})).toThrow(/Invalid/);
});
test("Crystal gloves preview a carried crystal without granting a ghost victory",()=>{
  const campaign=c("lmc"),e=createStrategyEngine({campaign,chapterIndex:0});choose(e,"upgrade:2");choose(e,"mode:explore");const rooms=(campaign.chapters[0].config as unknown as {rooms:Room[]}).rooms;
  const outer=findLumenPlan(rooms[0]);outer.rotations.forEach((v,i)=>{if(v!==data<{rotations:boolean[]}>(e).rotations[i])choose(e,`mirror:${i}`);});press(e,"alt");choose(e,"continue");
  const room=rooms[1],plan=findLumenPlan(room);plan.rotations.forEach((v,i)=>{if(v!==data<{rotations:boolean[]}>(e).rotations[i])choose(e,`mirror:${i}`);});choose(e,"shutter:0");choose(e,"pick:0");tap(e,93+plan.prisms[0].x*70,118+plan.prisms[0].y*60);expect(e.view().stats.find(v=>v.label==="Preview")!.value).toBe("3/3");press(e,"alt");expect(data<{phase:string}>(e).phase).toBe("puzzle");choose(e,"drop");press(e,"alt");expect(data<{phase:string}>(e).phase).toBe("door");
});
test("Temple lore rewards efficient real routing and survey lens adds concrete clues",()=>{
  const campaign=c("lmc"),e=createStrategyEngine({campaign,chapterIndex:0});choose(e,"upgrade:3");choose(e,"mode:explore");const room=(campaign.chapters[0].config as unknown as {rooms:Room[]}).rooms[0],plan=findLumenPlan(room);plan.rotations.forEach((v,i)=>{if(v!==data<{rotations:boolean[]}>(e).rotations[i])choose(e,`mirror:${i}`);});press(e,"alt");expect(data<{medals:number[]}>(e).medals[0]).toBe(2);
  const lens=createStrategyEngine({campaign,chapterIndex:0});choose(lens,"upgrade:1");choose(lens,"mode:explore");choose(lens,"hint");expect(lens.view().message).toContain("Closed shutters:");
});
