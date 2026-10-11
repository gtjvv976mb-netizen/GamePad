import { drawSprite } from '../../art';
import { paintWorld, paintOverlay, vehicleAngle } from './scenery';
import type { Campaign, EngineFactory, EngineOptions, EngineView, GameButton, GameEngine, GameInput, GameStatus, GameEvent } from '../../types';

export type Point = [number, number];
export type Rect = [number, number, number, number];
export type Rock = [number, number, number];
export type Entity = { x: number; y: number; vx: number; vy: number; hp: number; kind: number; phase: number };
type Projectile = { x: number; y: number; vx: number; vy: number; ttl: number; enemy: boolean };
export type State = {
  v: number; slug: string; chapter: number; status: GameStatus;
  x: number; y: number; vx: number; vy: number; angle: number; health: number; energy: number;
  time: number; progress: number; cargo: number; items: boolean[]; entities: Entity[]; projectiles: Projectile[];
  profile: Profile; cargoX: number; cargoY: number; cargoVx: number; cargoVy: number; cargoHealth: number;
  flags: boolean[]; secrets: boolean[]; checkpoint: number; coyote: number; buffer: number; groundId: number; crumbles: number[]; doorOpen: boolean; note: string; score: number; combo: number;
  drops: {x: number; y: number; type: number; active: boolean}[];
  cooldown: number; hurt: number; dash: number; jumps: number; grounded: boolean; direction: number;
};
export type Config = {
  world?: Point; biome?: string; laps?: number; rivals?: number; rivalSpeed?: number; par?: number;
  doors?: Rect[]; valves?: Point[]; patrols?: number[][]; pickups?: Point[]; jobTypes?: string[]; roads?: Rect[]; signals?: Point[];
  route?: Point[]; checkpoints?: Point[]; secrets?: Point[]; motions?: number[][]; fragile?: number[]; bossName?: string;
  points?: Point[]; mines?: Point[]; width?: number; pods?: Point[]; rocks?: Rock[]; base?: Point;
  stops?: Point[]; buildings?: Rect[]; traffic?: Rect[]; hub?: Point;
  relics?: Point[]; air?: Point[]; walls?: Rect[]; currents?: number[][]; exit?: Point; oxygen?: number;
  waves?: number[][][]; start?: Point; platforms?: Rect[]; runes?: Point[]; spikes?: Rect[];
};
const W = 960, H = 540;
type Profile = {v: 2; slug: string; completed: number[]; tokens: number; upgrades: string[]};
const EQUIPMENT: Record<string, {id: string; label: string; description: string}[]> = {
 ndp: [{id:'grip',label:'Magnetic tires',description:'More precise cornering and drift control.'},{id:'boost',label:'Afterburner',description:'Stronger boost acceleration.'},{id:'armor',label:'Impact cage',description:'Reduce hull damage.'}],
 osv: [{id:'tractor',label:'Heavy tractor',description:'Cargo weighs less on the tug and takes less damage.'},{id:'thruster',label:'Ion thrusters',description:'More thrust while towing.'},{id:'armor',label:'Reinforced hull',description:'Reduce collision and drone damage.'}],
 slc: [{id:'battery',label:'Long-range battery',description:'Reduce battery consumption.'},{id:'suspension',label:'Soft suspension',description:'Protect fragile parcels from bumps.'},{id:'turbo',label:'Street turbo',description:'A stronger boost for clear roads.'}],
 dpt: [{id:'tank',label:'Deep-air tank',description:'Eight extra seconds of breathing air.'},{id:'fins',label:'Streamlined fins',description:'Swim faster through the ruins.'},{id:'armor',label:'Pressure suit',description:'Reduce wildlife damage.'}],
 gla: [{id:'pulse',label:'Rapid pulse',description:'Fire more rapidly.'},{id:'spread',label:'Tri-shot emitter',description:'Add two spread projectiles to every shot.'},{id:'armor',label:'Ablative shield',description:'Reduce damage from enemy fire.'}],
 rrn: [{id:'shoes',label:'Cloud boots',description:'Higher jumps and a wider grace period at ledges.'},{id:'glide',label:'Rift sash',description:'Extend air dashes.'},{id:'charm',label:'Guardian charm',description:'Add one heart to new stages.'}],
};
const hpFor = (kind: number, chapter: number) => [3,4,7,5,6,4,24 + chapter * 10][kind] ?? 3;
function validateProfile(raw: unknown, game: Campaign): Profile {
 if (raw === undefined) return {v:2,slug:game.slug,completed:[],tokens:0,upgrades:[]};
 const p = raw as Profile, validIds = EQUIPMENT[game.slug].map(e=>e.id);
 if (!p || p.v !== 2 || p.slug !== game.slug || !Array.isArray(p.completed) || new Set(p.completed).size !== p.completed.length || p.completed.some(n=>!Number.isInteger(n)||n<0||n>=game.chapters.length) || !Number.isInteger(p.tokens) || p.tokens<0 || p.tokens>game.chapters.length*2 || !Array.isArray(p.upgrades) || new Set(p.upgrades).size!==p.upgrades.length || p.upgrades.some(id=>!validIds.includes(id)) || p.tokens+p.upgrades.length>p.completed.length*(game.slug==='rrn'?2:1)) throw new Error('Invalid action campaign progression.');
 return copy(p);
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const length = (x: number, y: number) => Math.hypot(x, y);
const distance = (x: number, y: number, p: Point) => length(x - p[0], y - p[1]);
const has = (input: GameInput, button: GameButton) => input.held.has(button);
const pressed = (input: GameInput, button: GameButton) => input.pressed.has(button);
const axes = (i: GameInput) => {
  let x = Number(has(i, 'right')) - Number(has(i, 'left')), y = Number(has(i, 'down')) - Number(has(i, 'up'));
  const l = Math.hypot(x, y); if (l) { x /= l; y /= l; } return [x, y];
};
const circleRect = (x: number, y: number, radius: number, r: Rect) => length(x - clamp(x, r[0], r[0] + r[2]), y - clamp(y, r[1], r[1] + r[3])) < radius;
function segmentDistance(x: number, y: number, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return length(x - a[0] - dx * t, y - a[1] - dy * t);
}
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const numeric = (v: unknown, low: number, high: number) => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;

/** Each title has its own movement, resource and objective rules; shared code is drawing/save plumbing. */
class ActionEngine implements GameEngine {
  private s: State;
  private readonly c: Config;
  private readonly game: Campaign;
  private readonly chapter: number;
  private feedback: GameEvent[] = [];
  private get ww() { return this.c.world?.[0] ?? W; }
  private get wh() { return this.c.world?.[1] ?? H; }
  private perk(id: string) { return this.s.profile.upgrades.includes(id); }
  private get maxHealth() { return this.game.slug === 'gla' ? 12 : this.game.slug === 'rrn' ? (this.perk('charm') ? 6 : 5) : 100; }
  private get maxEnergy() { return (this.c.oxygen ?? 100) + (this.game.slug==='dpt' && this.perk('tank') ? 8 : 0); }
  private event(type: GameEvent['type'], strength = 1) { if(this.feedback.length<40)this.feedback.push({type,strength}); }
  events() { const e = this.feedback; this.feedback = []; return e; }
  progression() { return copy(this.s.profile) as unknown as Record<string, unknown>; }
  choose(id: string) {
    if(this.s.status !== 'won' || this.s.profile.tokens<1 || this.perk(id) || !EQUIPMENT[this.game.slug].some(e=>e.id===id))return;
    this.s.profile.tokens--; this.s.profile.upgrades.push(id); this.event('craft');
  }
  constructor(options: EngineOptions) {
    this.game = options.campaign; this.chapter = options.chapterIndex;
    if (!Number.isInteger(this.chapter) || !this.game.chapters[this.chapter]) throw new Error('Unknown action chapter.');
    this.c = this.game.chapters[this.chapter].config as Config;
    const initial = this.c.start ?? this.c.base ?? this.c.hub ?? this.c.points?.[0] ?? [65, 105];
    const items = this.c.pods ?? this.c.stops ?? this.c.relics ?? this.c.runes ?? [];
    this.s = {
      v: 2, slug: this.game.slug, chapter: this.chapter, status: 'playing', x: initial[0], y: initial[1], vx: 0, vy: 0,
      angle: this.c.points ? Math.atan2(this.c.points[1][1] - initial[1], this.c.points[1][0] - initial[0]) : 0,
      health: this.game.slug === 'gla' ? 12 : this.game.slug === 'rrn' ? 5 : 100,
      profile: validateProfile(options.restored?.profile ?? options.progression, this.game), cargoX:initial[0],cargoY:initial[1],cargoVx:0,cargoVy:0,cargoHealth:100,flags:(this.c.valves??[]).map(()=>false),secrets:(this.c.secrets??[]).map(()=>false),checkpoint:0,coyote:0,buffer:0,groundId:-1,crumbles:(this.c.platforms??[]).map(()=>0),doorOpen:false,note:'',score:0,combo:0,drops:[],
      energy: this.c.oxygen ?? 100, time: 0, progress: this.c.points ? 1 : 0, cargo: -1,
      items: items.map(() => false), entities: [], projectiles: [], cooldown: 0, hurt: 0, dash: 0, jumps: 0, grounded: false, direction: 1,
    };
    this.s.health=this.maxHealth; this.s.energy=this.maxEnergy;
    if (this.c.waves) this.spawnWave();
    else if(this.c.patrols) this.s.entities=this.c.patrols.map(([x,y,kind],n)=>({x,y,vx:0,vy:0,hp:kind===1?2:3,kind,phase:n*0.6}));
    else if(this.game.slug==='ndp') this.s.entities=Array.from({length:this.c.rivals??0},(_,n)=>({x:initial[0]+n*15,y:initial[1]+(n+1)*24,vx:1,vy:0,hp:3,kind:n,phase:0}));
    if (options.restored) this.restore(options.restored);
  }
  private restore(value: Record<string, unknown>) {
    const v = value as unknown as State;
    const invalid = () => { throw new Error('This action save is invalid or belongs to a different chapter. Start the chapter again.'); };
    if (Object.keys(v).length !== Object.keys(this.s).length || Object.keys(this.s).some(key => !(key in v))) invalid();
    if (v.v !== 2 || v.slug !== this.game.slug || v.chapter !== this.chapter || !['playing', 'won', 'lost'].includes(v.status)) invalid();
    const fields: (keyof State)[] = ['x', 'y', 'vx', 'vy', 'angle', 'health', 'energy', 'time', 'progress', 'cargo', 'cooldown', 'hurt', 'dash', 'jumps', 'direction'];
    for (const f of fields) if (!numeric(v[f], -10000, 1000000)) invalid();
    if (!numeric(v.time, 0, 1000000) || !numeric(v.x, 0, this.ww + 50) || !numeric(v.y, 0, this.wh + 150) || !numeric(v.vx, -1000, 1000) || !numeric(v.vy, -1000, 1000) || !numeric(v.health, 0, this.maxHealth) || !numeric(v.energy, 0, this.maxEnergy) || !numeric(v.cooldown, 0, 3) || !numeric(v.hurt, 0, 2) || !numeric(v.dash, 0, 1) || !Number.isInteger(v.progress) || !Number.isInteger(v.cargo) || !Number.isInteger(v.jumps) || v.jumps < 0 || v.jumps > 2 || typeof v.grounded !== 'boolean' || ![-1, 1].includes(v.direction)) invalid();
    if (!Array.isArray(v.items) || v.items.length !== this.s.items.length || v.items.some(item => typeof item !== 'boolean') || v.cargo < -1 || v.cargo >= Math.max(1, v.items.length)) invalid();
    const maximum = this.c.points ? this.c.points.length * (this.c.laps??1) + 1 : this.c.waves?.length ?? v.items.length;
    if (v.progress < (this.c.points ? 1 : 0) || v.progress > maximum) invalid();
    if (!Array.isArray(v.entities) || v.entities.length > 40 || !Array.isArray(v.projectiles) || v.projectiles.length > 200) invalid();
    for (const e of v.entities) if (!e || !numeric(e.x, 0, this.ww) || !numeric(e.y, 0, this.wh) || !numeric(e.vx, -1000, 1000) || !numeric(e.vy, -1000, 1000) || !Number.isInteger(e.kind) || !numeric(e.kind, 0, 6) || !Number.isInteger(e.hp) || !numeric(e.hp, 0, Math.max(3,hpFor(e.kind,this.chapter))) || !numeric(e.phase, this.game.slug==='ndp'?-1000000:0, 1000000)) invalid();
    for (const p of v.projectiles) if (!p || !numeric(p.x, -100, this.ww + 100) || !numeric(p.y, -100, this.wh + 100) || !numeric(p.vx, -1000, 1000) || !numeric(p.vy, -1000, 1000) || !numeric(p.ttl, 0, 3) || typeof p.enemy !== 'boolean') invalid();
    if (!this.c.waves && !this.c.patrols && this.game.slug!=='ndp' && v.entities.length) invalid();
    if (!this.c.waves && v.projectiles.length) invalid();
    validateProfile(v.profile,this.game);
    if(!numeric(v.cargoX,0,this.ww)||!numeric(v.cargoY,0,this.wh)||!numeric(v.cargoVx,-1200,1200)||!numeric(v.cargoVy,-1200,1200)||!numeric(v.cargoHealth,0,100)||!numeric(v.coyote,0,.2)||!numeric(v.buffer,0,.15)||!numeric(v.score,0,1000000)||!numeric(v.combo,0,1000000))invalid();
    if(!Array.isArray(v.flags)||v.flags.length!==this.s.flags.length||v.flags.some(b=>typeof b!=='boolean')||!Array.isArray(v.secrets)||v.secrets.length!==this.s.secrets.length||v.secrets.some(b=>typeof b!=='boolean')||!Array.isArray(v.crumbles)||v.crumbles.length!==this.s.crumbles.length||v.crumbles.some(n=>n!==-1&&!numeric(n,0,1.5))||typeof v.doorOpen!=='boolean'||typeof v.note!=='string'||v.note.length>500||!Number.isInteger(v.checkpoint)||!numeric(v.checkpoint,0,Math.max(0,(this.c.checkpoints?.length??1)-1))||!Number.isInteger(v.groundId)||!numeric(v.groundId,-1,(this.c.platforms?.length??0)-1))invalid();
    if(!Array.isArray(v.drops)||v.drops.length>50||v.drops.some(p=>!numeric(p.x,0,this.ww)||!numeric(p.y,0,this.wh)||![0,1].includes(p.type)||typeof p.active!=='boolean'))invalid();
    if (this.c.pods && v.cargo >= 0 && v.items[v.cargo]) invalid();
    if (!(this.c.pods || this.c.stops) && v.cargo !== -1) invalid();
    if (this.c.stops && v.cargo >= 0 && v.cargo !== v.progress) invalid();
    if (!this.c.points && !this.c.waves && v.items.filter(Boolean).length !== v.progress) invalid();
    if (v.status === 'won' && (this.c.points || this.c.waves ? v.progress !== maximum : v.items.some(item => !item) || v.flags.some(b=>!b))) invalid();
    if (v.status === 'playing' && (v.health <= 0 || (this.c.oxygen && v.energy <= 0))) invalid();
    if (v.status === 'lost' && v.health > 0 && !(this.c.oxygen && v.energy === 0)) invalid();
    this.s = copy(v);
  }
  private spawnWave() {
    this.s.entities = (this.c.waves?.[this.s.progress] ?? []).map(([x, y, kind], n) => ({ x, y, vx: 0, vy: 0, hp: hpFor(kind,this.chapter), kind, phase: n * 0.3 }));
  }
  private damage(amount: number, invulnerability = 0.85) {
    if (this.s.hurt > 0 || (['gla','dpt'].includes(this.game.slug) && this.s.dash > 0)) return;
    this.s.health = Math.max(0, this.s.health - amount * (this.perk('armor') ? 0.65 : 1)); this.s.hurt = invulnerability; this.event('hit',amount/10);
  }
  private move(dx: number, dy: number, walls: Rect[], radius = 14, hurtOnImpact = false) {
    const s = this.s;
    const nx = clamp(s.x + dx, radius + 12, this.ww - radius - 12), ny = clamp(s.y + dy, radius + 12, this.wh - radius - 12);
    if (!walls.some(r => circleRect(nx, s.y, radius, r))) s.x = nx;
    else { s.vx = 0; if (hurtOnImpact) this.damage(12); }
    if (!walls.some(r => circleRect(s.x, ny, radius, r))) s.y = ny;
    else { s.vy = 0; if (hurtOnImpact) this.damage(12); }
  }
  update(dt: number, input: GameInput) {
    if (this.s.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 0.25), first = true;
    while (remaining > 0.000001 && this.s.status === 'playing') {
      const step = Math.min(remaining, 1 / 60);
      const i = first ? input : { ...input, pressed: new Set<GameButton>() };
      this.s.time += step; this.s.cooldown = Math.max(0, this.s.cooldown - step); this.s.hurt = Math.max(0, this.s.hurt - step); this.s.dash = Math.max(0, this.s.dash - step);
      switch (this.game.slug) {
        case 'ndp': this.race(step, i); break;
        case 'osv': this.salvage(step, i); break;
        case 'slc': this.delivery(step, i); break;
        case 'dpt': this.dive(step, i); break;
        case 'gla': this.arena(step, i); break;
        case 'rrn': this.platform(step, i); break;
        default: throw new Error('Unknown action campaign.');
      }
      if (this.s.health <= 0 || (this.game.slug === 'dpt' && this.s.energy <= 0)) this.s.status = 'lost';
      if((this.s.status as GameStatus)==='won'&&!this.s.profile.completed.includes(this.chapter)){this.s.profile.completed.push(this.chapter);this.s.profile.tokens+=1+(this.s.secrets.length>0&&this.s.secrets.every(Boolean)?1:0);this.event('success');}
      if(this.s.status==='lost')this.event('fail');
      remaining -= step; first = false;
    }
  }
  private race(dt: number, i: GameInput) {
    const s=this.s, points=this.c.points!, steering=Number(has(i,'right'))-Number(has(i,'left'));
    s.angle+=steering*(has(i,'alt')?3.25:2.65)*dt;
    let forward=s.vx*Math.cos(s.angle)+s.vy*Math.sin(s.angle), side=-s.vx*Math.sin(s.angle)+s.vy*Math.cos(s.angle);
    if(has(i,'up'))forward+=240*dt;
    if(has(i,'down'))forward-=330*dt;
    const boosting=has(i,'action')&&s.energy>2&&has(i,'up');
    if(boosting){forward+=(this.perk('boost')?440:330)*dt;s.energy=Math.max(0,s.energy-27*dt);}
    else s.energy=Math.min(100,s.energy+(Math.abs(side)>20?23:7)*dt);
    forward*=Math.exp(-(has(i,'alt')?1.4:.8)*dt); side*=Math.exp(-(has(i,'alt')?1.5:this.perk('grip')?14:10)*dt);
    forward=clamp(forward,-90,boosting?465:300);
    s.vx=Math.cos(s.angle)*forward-Math.sin(s.angle)*side;s.vy=Math.sin(s.angle)*forward+Math.cos(s.angle)*side;
    s.x=clamp(s.x+s.vx*dt,20,this.ww-20);s.y=clamp(s.y+s.vy*dt,20,this.wh-20);
    const road=Math.min(...points.map((p,n)=>segmentDistance(s.x,s.y,p,points[(n+1)%points.length])))<=this.c.width!/2;
    if(!road){s.health=Math.max(0,s.health-16*dt*(this.perk('armor')?.6:1));s.vx*=Math.exp(-1.3*dt);s.vy*=Math.exp(-1.3*dt);s.combo=0;}
    else if(Math.abs(side)>18&&forward>90){s.combo+=dt;s.score+=Math.abs(side)*dt*.8;}
    for(const mine of this.c.mines!)if(distance(s.x,s.y,mine)<31)this.damage(18);
    for(const e of s.entities){const target=points[Math.floor(e.vx)%points.length],d=distance(e.x,e.y,target),speed=(this.c.rivalSpeed??115)+e.kind*7;e.phase=Math.atan2(target[1]-e.y,target[0]-e.x);e.x+=Math.cos(e.phase)*speed*dt;e.y+=Math.sin(e.phase)*speed*dt;if(d<45){e.vx++;e.vy++;}}
    if(distance(s.x,s.y,points[s.progress%points.length])<58){s.progress++;s.score+=100;this.event('collect');if(s.progress>points.length*(this.c.laps??1)){s.status='won';s.note=`Finished in ${s.time.toFixed(1)}s · ${s.entities.filter(e=>e.vy>s.progress-1).length+1}/${s.entities.length+1} place · ${Math.floor(s.score)} style`;}}
    if(Math.floor(s.time*2)>Math.floor((s.time-dt)*2)&&Math.abs(forward)>40)this.event('engine',Math.abs(forward)/400);
  }
  private salvage(dt: number, i: GameInput) {
    const s=this.s,[ax,ay]=axes(i),loaded=s.cargo>=0,thrust=(loaded?(this.perk('tractor')?240:190):290)*(this.perk('thruster')?1.2:1)*(s.energy<1?.35:1);
    s.vx+=ax*thrust*dt;s.vy+=ay*thrust*dt;const damp=Math.exp(-(has(i,'alt')?6:.25)*dt);s.vx*=damp;s.vy*=damp;
    const speed=length(s.vx,s.vy);if(speed>260){s.vx*=260/speed;s.vy*=260/speed;}
    const nx=clamp(s.x+s.vx*dt,30,this.ww-30),ny=clamp(s.y+s.vy*dt,30,this.wh-30);
    const walls=[...(this.c.walls??[]),...(this.c.doors??[]).filter((_,n)=>!s.flags[n])];
    if(this.c.rocks!.some(r=>distance(nx,ny,[r[0],r[1]])<r[2]+18)||walls.some(r=>circleRect(nx,ny,18,r))){this.damage(12);s.vx*=-.5;s.vy*=-.5;}else{s.x=nx;s.y=ny;}
    if(speed>6)s.angle=Math.atan2(s.vy,s.vx);
    s.energy=clamp(s.energy-((ax||ay)?(loaded?1.2:.65)*dt:0),0,100);
    if(distance(s.x,s.y,this.c.base!)<76){s.energy=Math.min(100,s.energy+22*dt);if(!s.hurt)s.health=Math.min(100,s.health+5*dt);}
    if(loaded){
      const tx=s.x-Math.cos(s.angle)*52,ty=s.y-Math.sin(s.angle)*52;s.cargoVx+=(tx-s.cargoX)*28*dt;s.cargoVy+=(ty-s.cargoY)*28*dt;s.cargoVx*=Math.exp(-7*dt);s.cargoVy*=Math.exp(-7*dt);s.cargoX=clamp(s.cargoX+s.cargoVx*dt,18,this.ww-18);s.cargoY=clamp(s.cargoY+s.cargoVy*dt,18,this.wh-18);
      if(this.c.rocks!.some(r=>distance(s.cargoX,s.cargoY,[r[0],r[1]])<r[2]+14))s.cargoHealth=Math.max(0,s.cargoHealth-20*dt*(this.perk('tractor')?.5:1));
      if(s.cargoHealth<=0){s.cargo=-1;s.note='Cargo tether broke. The crate is back at its recovery beacon.';this.event('hit');}
    }
    this.patrol(dt,12);
    if(has(i,'action')&&s.cooldown<=0){const e=s.entities.find(e=>e.hp>0&&distance(s.x,s.y,[e.x,e.y])<190);if(e){e.hp--;s.cooldown=.5;this.event('shoot');}}
    if(pressed(i,'action')){
      this.c.valves?.forEach((p,n)=>{if(!s.flags[n]&&distance(s.x,s.y,p)<55){s.flags[n]=true;s.note='Airlock released. The wreck bay is open.';this.event('craft');}});
      if(s.cargo>=0&&distance(s.x,s.y,this.c.base!)<74){s.items[s.cargo]=true;s.cargo=-1;s.progress++;this.event('collect');if(s.items.every(Boolean)&&s.flags.every(Boolean))s.status='won';}
      else if(s.cargo<0){const n=this.c.pods!.findIndex((p,n)=>!s.items[n]&&distance(s.x,s.y,p)<55);if(n>=0){s.cargo=n;s.cargoX=this.c.pods![n][0];s.cargoY=this.c.pods![n][1];s.cargoVx=0;s.cargoVy=0;s.cargoHealth=100;s.note='Tractor locked. Brake before docking; the trailing crate can strike rocks.';this.event('craft');}}
    }
    if(Math.floor(s.time*2)>Math.floor((s.time-dt)*2)&&speed>50)this.event('engine',.4);
  }
  private patrol(dt: number, impact: number) {
    const s=this.s;
    s.entities.forEach((e,n)=>{if(e.hp<=0)return;const p=this.c.patrols![n];e.phase+=dt;const range=p[3]??90;e.x=clamp(p[0]+Math.sin(e.phase*(e.kind===1?1.15:.55))*range,30,this.ww-30);e.y=clamp(p[1]+Math.cos(e.phase*.8)*range*.35,30,this.wh-30);e.vx=Math.cos(e.phase*.55)*range*.55;e.vy=-Math.sin(e.phase*.8)*range*.28;if(distance(s.x,s.y,[e.x,e.y])<(e.kind===2?60:36))this.damage(impact);});
  }
  private delivery(dt: number, i: GameInput) {
    const s=this.s,[ax,ay]=axes(i),turbo=has(i,'alt')&&s.energy>2,speed=(turbo?(this.perk('turbo')?310:255):175)*(s.energy<=0?.35:1),blend=1-Math.exp(-10*dt);
    s.vx+=(ax*speed-s.vx)*blend;s.vy+=(ay*speed-s.vy)*blend;const previousHealth=s.health;
    this.move(s.vx*dt,s.vy*dt,this.c.buildings!,18,true);
    if(ax||ay){s.angle=Math.atan2(s.vy,s.vx);s.energy=Math.max(0,s.energy-(turbo?10:1)*(this.perk('battery')?.55:1)*dt);}
    if(distance(s.x,s.y,this.c.hub!)<70){s.energy=Math.min(100,s.energy+32*dt);if(!s.hurt)s.health=Math.min(100,s.health+4*dt);}
    for(const vehicle of this.c.traffic!){const [tx,ty]=this.trafficPosition(vehicle);if(distance(s.x,s.y,[tx,ty])<35)this.damage(12,1.1);}
    if(s.cargo>=0&&s.health<previousHealth){s.cargoHealth=Math.max(0,s.cargoHealth-(this.c.jobTypes?.[s.progress]==='fragile'?35:15)*(this.perk('suspension')?.4:1));if(s.cargoHealth<=0){s.cargo=-1;s.note='Parcel damaged. Return to the pickup marker for a replacement.';this.event('fail',.3);}}
    if(pressed(i,'action')){const pickup=this.c.pickups?.[s.progress]??this.c.hub!;
      if(s.cargo<0&&distance(s.x,s.y,pickup)<60){s.cargo=s.progress;s.cargoHealth=100;s.combo=s.time;s.note=`Parcel loaded: ${this.c.jobTypes?.[s.progress]??'standard'} delivery. Follow the amber address.`;this.event('dialogue');}
      else if(s.cargo>=0&&distance(s.x,s.y,this.c.stops![s.progress])<54){s.items[s.progress]=true;s.progress++;s.cargo=-1;s.score+=100+(s.time-s.combo<30?50:0)+Math.floor(s.cargoHealth);s.note='Delivered. The next pickup is marked in blue; the depot always offers a free recharge.';this.event('collect');if(s.progress===s.items.length)s.status='won';}
    }
    if(Math.floor(s.time*3)>Math.floor((s.time-dt)*3)&&length(s.vx,s.vy)>70)this.event('engine',.35);
  }
  private trafficPosition(vehicle: Rect): Point {
    const [x,y,vx,vy]=vehicle,t=this.s.time,red=Math.floor(t/12)*3+Math.min(t%12,3),moving=t-red;
    return [45+((x-45+vx*moving)%(this.ww-90)+(this.ww-90))%(this.ww-90),45+((y-45+vy*moving)%(this.wh-90)+(this.wh-90))%(this.wh-90)];
  }
  private dive(dt: number, i: GameInput) {
    const s=this.s,[ax,ay]=axes(i),burst=has(i,'alt')&&s.energy>3,speed=(burst?250:150)*(this.perk('fins')?1.18:1);
    if(pressed(i,'alt')&&s.cooldown<=0){s.dash=.28;s.cooldown=1.2;this.event('splash');}
    let vx=ax*speed,vy=ay*speed;for(const [x,y,w,h,cx,cy] of this.c.currents!)if(s.x>x&&s.x<x+w&&s.y>y&&s.y<y+h){vx+=cx;vy+=cy;}
    s.vx=vx;s.vy=vy;this.move(vx*dt,vy*dt,[...this.c.walls!,...(this.c.doors??[]).filter((_,n)=>!s.flags[n])],15);if(ax||ay)s.angle=Math.atan2(ay,ax);
    const air=s.y<65||this.c.air!.some(p=>distance(s.x,s.y,p)<55);s.energy=clamp(s.energy+(air?12:-(burst?2:1))*dt,0,this.maxEnergy);if(air&&!s.hurt)s.health=Math.min(100,s.health+4*dt);
    this.patrol(dt,10);
    if(pressed(i,'action')){
      this.c.valves?.forEach((p,n)=>{if(!s.flags[n]&&distance(s.x,s.y,p)<55){s.flags[n]=true;s.note='Pressure valve released. The connected seal has opened.';this.event('craft');}});
      this.c.relics!.forEach((p,n)=>{if(!s.items[n]&&distance(s.x,s.y,p)<50){s.items[n]=true;s.progress++;this.event('collect');}});
      if(s.items.every(Boolean)&&s.flags.every(Boolean)&&distance(s.x,s.y,this.c.exit!)<65)s.status='won';
    }
    if(Math.floor(s.time)>Math.floor(s.time-dt)&&(ax||ay))this.event('splash',.25);
  }
  private arena(dt: number, i: GameInput) {
    const s=this.s,walls=this.c.walls!,[ax,ay]=axes(i);
    if(pressed(i,'alt')&&s.cooldown<=0&&(ax||ay)){s.dash=.21;s.cooldown=1.1;this.event('dash');}
    const speed=s.dash>0?570:230;s.vx=ax*speed;s.vy=ay*speed;this.move(s.vx*dt,s.vy*dt,walls,16);
    s.energy=Math.max(0,s.energy-dt*100);
    const visible=(e:Entity)=>!walls.some(r=>{for(let n=1;n<24;n++)if(circleRect(s.x+(e.x-s.x)*n/24,s.y+(e.y-s.y)*n/24,2,r))return true;return false;});
    const target=s.entities.filter(e=>e.hp>0&&visible(e)).sort((a,b)=>distance(s.x,s.y,[a.x,a.y])-distance(s.x,s.y,[b.x,b.y]))[0];
    if(has(i,'action')&&s.energy<=0&&(target||i.aim||i.pointer?.down)){
      let angle=target?Math.atan2(target.y-s.y,target.x-s.x):s.angle;
      if(i.aim&&length(i.aim.x,i.aim.y)>.3)angle=Math.atan2(i.aim.y,i.aim.x);
      else if(i.pointer?.down)angle=Math.atan2(i.pointer.y-s.y,i.pointer.x-s.x);
      s.angle=angle;s.energy=this.perk('pulse')?11:17;
      for(const offset of this.perk('spread')?[-.17,0,.17]:[0])s.projectiles.push({x:s.x,y:s.y,vx:Math.cos(angle+offset)*590,vy:Math.sin(angle+offset)*590,ttl:1.65,enemy:false});this.event('shoot',.55);
    }
    for(const e of s.entities){
      if(e.hp<=0)continue;const old=e.phase;e.phase+=dt;const dx=s.x-e.x,dy=s.y-e.y,d=length(dx,dy)||1,a=Math.atan2(dy,dx);
      let speed=e.kind===2?43:e.kind===1?(d<230?-24:52):e.kind===4?0:e.kind===6?24:85;
      if(e.kind===3){const cycle=e.phase%3.2;if(cycle>.9&&cycle<1.45)speed=0;else if(cycle>=1.45&&cycle<1.9){if(old%3.2<1.45){e.vx=Math.cos(a)*380;e.vy=Math.sin(a)*380;}speed=-1;}}
      if(speed>=0){e.vx=dx/d*speed;e.vy=dy/d*speed;}
      const nx=clamp(e.x+e.vx*dt,28,W-28),ny=clamp(e.y+e.vy*dt,28,H-28);
      if(!walls.some(r=>circleRect(nx,e.y,e.kind===6?36:18,r)))e.x=nx;else e.y=clamp(e.y+(s.y>e.y?65:-65)*dt,28,H-28);
      if(!walls.some(r=>circleRect(e.x,ny,e.kind===6?36:18,r)))e.y=ny;
      if(distance(s.x,s.y,[e.x,e.y])<(e.kind===6?49:33))this.damage(1);
      const period=e.kind===6?3.1:e.kind===4?2.4:e.kind===2?4:e.kind===1?1.8:100000;
      if(Math.floor(e.phase/period)>Math.floor(old/period)){
        const rage=e.kind===6&&e.hp<hpFor(6,this.chapter)*.5,count=e.kind===6?(rage?12:8):e.kind===2?6:e.kind===4?3:1;
        for(let n=0;n<count;n++){const angle=e.kind===6||e.kind===2?n/count*Math.PI*2+e.phase*.2:a+(n-(count-1)/2)*.22;s.projectiles.push({x:e.x,y:e.y,vx:Math.cos(angle)*(rage?190:160),vy:Math.sin(angle)*(rage?190:160),ttl:3,enemy:true});}
      }
    }
    s.projectiles=s.projectiles.filter(p=>{
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.ttl-=dt;if(p.ttl<=0||p.x<5||p.x>W-5||p.y<5||p.y>H-5||walls.some(r=>circleRect(p.x,p.y,4,r)))return false;
      if(p.enemy){if(distance(s.x,s.y,[p.x,p.y])<18){this.damage(1);return false;}}
      else{const e=s.entities.find(e=>e.hp>0&&distance(e.x,e.y,[p.x,p.y])<(e.kind===6?40:e.kind===2?24:20));if(e){e.hp--;this.event('strike',.5);if(e.hp===0){s.score+=e.kind===6?1000:100;s.drops.push({x:e.x,y:e.y,type:e.kind%2,active:true});if(e.kind===5){s.entities.push({x:clamp(e.x-25,25,W-25),y:e.y,vx:0,vy:0,hp:2,kind:0,phase:0},{x:clamp(e.x+25,25,W-25),y:e.y,vx:0,vy:0,hp:2,kind:0,phase:0});}}return false;}}
      return true;
    });
    for(const p of s.drops)if(p.active&&distance(s.x,s.y,[p.x,p.y])<35){p.active=false;if(p.type===0)s.health=Math.min(this.maxHealth,s.health+2);else{s.cooldown=0;s.energy=0;}this.event('collect',.4);}
    if(s.entities.every(e=>e.hp<=0)){
      s.doorOpen=true;
      if(s.progress===this.c.waves!.length-1){s.progress++;s.status='won';}
      else if(distance(s.x,s.y,[865,270])<58&&pressed(i,'action')){s.progress++;s.doorOpen=false;s.projectiles=[];s.drops=[];s.health=Math.min(this.maxHealth,s.health+2);s.x=115;s.y=270;this.spawnWave();this.event('dialogue');}
    }
  }
  private platforms(): Rect[] {
    return this.c.platforms!.map((r,n)=>{const m=this.c.motions?.find(m=>m[0]===n);if(!m)return r;return [r[0]+Math.sin(this.s.time/m[3]*Math.PI*2)*m[1],r[1]+Math.sin(this.s.time/m[3]*Math.PI*2)*m[2],r[2],r[3]];});
  }
  private platform(dt: number, i: GameInput) {
    const s=this.s,horizontal=Number(has(i,'right'))-Number(has(i,'left')),platforms=this.platforms(),previousBottom=s.y+18;
    if(horizontal)s.direction=horizontal;
    s.buffer=Math.max(0,s.buffer-dt);s.coyote=Math.max(0,s.coyote-dt);
    if(pressed(i,'action')||pressed(i,'up'))s.buffer=.15;
    if(s.grounded)s.coyote=this.perk('shoes')?.2:.13;
    if(s.buffer>0&&(s.coyote>0||s.jumps<2)){s.vy=this.perk('shoes')?-500:-465;s.jumps++;s.grounded=false;s.coyote=0;s.buffer=0;this.event('dash',.4);}
    if(pressed(i,'alt')&&s.cooldown<=0){s.dash=this.perk('glide')?.24:.17;s.cooldown=.85;this.event('dash');}
    // Brief jump taps cut the arc; holding jump keeps the full jump height.
    if(s.vy<-180&&!has(i,'action')&&!has(i,'up')&&s.jumps===1&&s.buffer===0)s.vy+=260*dt;
    s.vx=s.dash>0?s.direction*490:horizontal*235;s.vy=Math.min(650,s.vy+(s.dash>0?100:980)*dt);
    s.x=clamp(s.x+s.vx*dt,18,this.ww-18);s.y+=s.vy*dt;s.grounded=false;if(s.y<18){s.y=18;s.vy=Math.max(0,s.vy);}
    s.crumbles.forEach((v,n)=>{if(v>0){s.crumbles[n]=v-dt;if(s.crumbles[n]<=0)s.crumbles[n]=-1;}});
    if(s.vy>=0){const id=platforms.map((r,n)=>({r,n})).filter(({r:[x,y,w],n})=>s.crumbles[n]!==-1&&s.x+13>x&&s.x-13<x+w&&previousBottom<=y+5&&s.y+18>=y).sort((a,b)=>a.r[1]-b.r[1])[0];if(id){s.y=id.r[1]-18;s.vy=0;s.grounded=true;s.jumps=0;s.groundId=id.n;if(this.c.fragile?.includes(id.n)&&s.crumbles[id.n]===0)s.crumbles[id.n]=1.5;}}
    for(const [x,y,w,h] of this.c.spikes!)if(circleRect(s.x,s.y,14,[x,y,w,h])){this.damage(1,1.2);s.vy=-330;}
    s.entities.forEach((e,n)=>{if(e.hp<=0)return;const p=this.c.patrols![n];e.phase+=dt;e.x=p[0]+Math.sin(e.phase*.8)*(p[3]??45);e.y=p[1];if(distance(s.x,s.y,[e.x,e.y])<(e.kind===2?45:29)){if(s.dash>0){e.hp=e.kind===2?Math.max(0,e.hp-1):0;s.dash=0;s.vy=-210;this.event('strike');}else if(s.vy>20&&previousBottom<e.y+8){e.hp--;s.vy=-340;s.jumps=1;this.event('strike');}else this.damage(1,1.2);}});
    this.c.checkpoints?.forEach((p,n)=>{if(n>s.checkpoint&&distance(s.x,s.y,p)<55){s.checkpoint=n;s.health=Math.min(this.maxHealth,s.health+1);this.event('craft');}});
    if(s.y>this.wh+30){s.health=Math.max(0,s.health-1);const p=this.c.checkpoints?.[s.checkpoint]??this.c.start!;s.x=p[0];s.y=p[1];s.vx=0;s.vy=0;s.jumps=0;s.hurt=1.2;s.crumbles=s.crumbles.map(()=>0);this.event('hit');}
    this.c.runes!.forEach((p,n)=>{if(!s.items[n]&&distance(s.x,s.y,p)<36){s.items[n]=true;s.progress++;this.event('collect');}});
    this.c.secrets?.forEach((p,n)=>{if(!s.secrets[n]&&distance(s.x,s.y,p)<34){s.secrets[n]=true;s.score+=250;this.event('collect');}});
    if(s.items.every(Boolean)&&(!this.c.bossName||s.entities.every(e=>e.kind!==2||e.hp<=0))&&distance(s.x,s.y,this.c.exit!)<50)s.status='won';
    if(s.grounded&&horizontal&&Math.floor(s.time*5)>Math.floor((s.time-dt)*5))this.event('step',.25);
  }
  view(): EngineView {
    const s = this.s, title = this.game.slug;
    const stats: EngineView['stats'] = title === 'ndp' ? [{ label: 'Gate', value: `${Math.min(Math.floor((s.progress-1)/this.c.points!.length)+1,this.c.laps??1)}/${this.c.laps??1} laps` }, { label: 'Hull', value: `${Math.ceil(s.health)}%` }, { label: 'Boost', value: `${Math.floor(s.energy)}%` }]
      : title === 'osv' ? [{ label: 'Recovered', value: `${s.progress}/${s.items.length}` }, { label: 'Hull', value: `${Math.ceil(s.health)}%` }, { label: 'Cargo', value: s.cargo>=0?`${Math.ceil(s.cargoHealth)}%`:'Empty' },{label:'Fuel',value:`${Math.floor(s.energy)}%`}]
      : title === 'slc' ? [{ label: 'Delivered', value: `${s.progress}/${s.items.length}` }, { label: 'Van', value: `${Math.ceil(s.health)}%` }, { label: 'Battery', value: `${Math.floor(s.energy)}%` }]
      : title === 'dpt' ? [{ label: 'Relics', value: `${s.progress}/${s.items.length}` }, { label: 'Air', value: `${s.energy.toFixed(1)}s` }]
      : title === 'gla' ? [{ label: 'Room', value: `${Math.min(s.progress + 1, this.c.waves!.length)}/${this.c.waves!.length}` }, { label: 'Shield', value: s.health }, { label: 'Sentries', value: s.entities.filter(e => e.hp > 0).length }]
      : [{ label: 'Runes', value: `${s.progress}/${s.items.length}` }, { label: 'Hearts', value: s.health }, { label: 'Jump', value: s.jumps < 2 ? `${2 - s.jumps} available` : 'Land to refill' }];
    let message = '';
    if (s.status === 'lost') message = title === 'dpt' ? 'Your air ran out. Retry and plan stops at the bubble vents.' : title === 'rrn' ? 'The rift caught you. Retry the tower; all its runes are still within reach.' : 'Your craft is disabled. Retry the chapter and use braking, cover or evasive movement.';
    if (s.status === 'won') message = this.game.chapters[this.chapter].after;
    if (s.status === 'playing' && title === 'osv') message = s.cargo >= 0 ? 'Tow the cargo to the blue ring. Press Tractor inside the berth.' : 'Approach a gold crate and press Tractor. Hold Stabilize to stop.';
    if (s.status === 'playing' && title === 'slc') message = s.cargo >= 0 ? `Take parcel ${s.progress + 1} to its amber marker and press Deliver.` : 'Return to the blue depot and press Deliver to load the next parcel.';
    if (s.status === 'playing' && title === 'dpt') message = s.items.every(Boolean) ? 'All relics recovered. Reach the green seal and press Recover.' : 'Press Recover near a gold relic. Silver bubbles refill your air.';
    if(s.status==='playing'&&s.note)message=s.note;
    if(s.status==='playing'&&title==='gla'&&s.doorOpen)message='Room secured. Walk to the illuminated east door and press Fire to continue.';
    if(s.status==='playing'&&title==='dpt'&&s.items.every(Boolean)&&s.flags.some(b=>!b))message='Relics secured. Release every pressure valve before using the exit.';
    const boss=s.entities.find(e=>e.kind===(title==='rrn'?2:6)&&e.hp>0);
    return { selection:s.status==='won'&&s.note?s.note:undefined, choices:s.status==='won'?EQUIPMENT[title].map(e=>({...e,disabled:this.perk(e.id)||s.profile.tokens<1})):undefined,choicePrompt:s.status==='won'?`Workshop · ${s.profile.tokens} earned module${s.profile.tokens===1?'':'s'} available`:undefined,boss:boss&&this.c.bossName?{name:this.c.bossName,health:boss.hp,max:title==='rrn'?3:hpFor(6,this.chapter)}:undefined, status: s.status, objective: this.game.chapters[this.chapter].objective, message, stats };
  }
  save(): Record<string, unknown> { return copy(this.s) as unknown as Record<string, unknown>; }
  render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const s=this.s,c=this.c,slug=this.game.slug;
    ctx.save();ctx.scale(width/W,height/H);
    const camX=clamp(s.x-W*.44,0,Math.max(0,this.ww-W)),camY=slug==='rrn'?clamp(s.y-H*.58,0,Math.max(0,this.wh-H)):clamp(s.y-H*.5,0,Math.max(0,this.wh-H));
    paintWorld(ctx,slug,c,s,camX,camY,this.game.palette);
    ctx.save();ctx.translate(-camX,-camY);
    if(slug==='ndp'||slug==='osv'||slug==='slc'){
      const speed=length(s.vx,s.vy),a=slug==='ndp'?s.angle:Math.atan2(s.vy,s.vx);
      for(let n=5;n>0;n--){ctx.globalAlpha=.1*(1-n/6);drawSprite(ctx,slug==='ndp'?'racer':slug==='osv'?'tug':'courier',s.x-Math.cos(a)*n*speed*.018,s.y-Math.sin(a)*n*speed*.018,slug==='slc'?63:70,{angle:vehicleAngle(slug,s.angle)});}ctx.globalAlpha=1;
    }
    const sprite=slug==='ndp'?'racer':slug==='osv'?'tug':slug==='slc'?'courier':slug==='dpt'||slug==='gla'?'diver':'knight';
    const bodySize=slug==='gla'?55:slug==='rrn'?65:slug==='dpt'?65:72;
    drawSprite(ctx,sprite,s.x,s.y+(slug==='rrn'&&s.grounded?Math.sin(s.time*12)*1.4:slug==='dpt'?Math.sin(s.time*3)*2:0),bodySize,{angle:['ndp','osv','slc'].includes(slug)?vehicleAngle(slug,s.angle):0,flip:slug==='rrn'?s.direction<0:slug==='dpt'||slug==='gla'?Math.cos(s.angle)<0:false,alpha:s.hurt>0&&Math.floor(s.time*14)%2===0?.5:1});
    if(slug==='gla'){
      ctx.save();ctx.translate(s.x,s.y+6);ctx.rotate(s.angle);
      ctx.fillStyle='#122330';ctx.fillRect(10,-7,29,14);ctx.strokeStyle='#8cbcc8';ctx.lineWidth=2;ctx.strokeRect(10,-7,29,14);
      ctx.fillStyle='#d0f59b';ctx.fillRect(24,-3,19,6);
      if(s.energy>10){ctx.fillStyle='#e9ffb8';ctx.beginPath();ctx.moveTo(44,0);ctx.lineTo(57,-5);ctx.lineTo(53,0);ctx.lineTo(57,5);ctx.fill();}
      ctx.restore();
    }
    if(s.dash>0){ctx.strokeStyle=this.game.palette[2];ctx.lineWidth=3;ctx.beginPath();ctx.arc(s.x,s.y,33,0,Math.PI*2);ctx.stroke();}
    ctx.restore();paintOverlay(ctx,slug,c,s,camX,camY,this.game.palette);
    if(s.status==='lost'){ctx.fillStyle='#a81c3e33';ctx.fillRect(0,0,W,H);}
    ctx.restore();
  }

}

export const createActionEngine: EngineFactory = options => new ActionEngine(options);
