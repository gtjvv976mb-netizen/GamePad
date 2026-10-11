import { traceRoom, type Room, type Prism } from "../../src/games/engines/strategy/light";

/** Discover real mirror/shutter/crystal actions; never mutates an engine or save. */
export function findLumenPlan(room:Room):{rotations:boolean[];shutters:boolean[];prisms:Prism[]} {
  const mutable=room.mirrors.map((m,i)=>({m,i})).filter(v=>!v.m.fixed),shutters=room.shutters.map(()=>true), movable=room.prisms.findIndex(p=>p.movable);
  for(let bits=0;bits<1<<mutable.length;bits++){
    const rotations=room.mirrors.map(m=>m.slash);mutable.forEach(({i},n)=>rotations[i]=!!(bits&(1<<n)));
    if(movable<0){if(traceRoom(room,rotations,room.prisms,shutters).lit.every(Boolean))return{rotations,shutters,prisms:room.prisms};}
    else for(let y=0;y<room.height;y++)for(let x=0;x<room.width;x++){
      if([...room.mirrors,...room.receivers,...room.emitters,...room.shutters].some(p=>p.x===x&&p.y===y)||room.walls.some(([xx,yy])=>x===xx&&y===yy))continue;
      const prisms=room.prisms.map(p=>({...p}));prisms[movable].x=x;prisms[movable].y=y;
      if(traceRoom(room,rotations,prisms,shutters).lit.every(Boolean))return{rotations,shutters,prisms};
    }
  }
  throw new Error("No genuine optical solution: "+room.name);
}
