import { drawSprite } from '../../art';
import type { Config, Point, Rect, State } from './runtime';
const TAU=Math.PI*2;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const dist=(x:number,y:number,p:Point)=>Math.hypot(x-p[0],y-p[1]);
// The illustrated cars face southwest; the tug's cockpit faces northwest.
// Correct their authored pose so a simulation heading of zero visibly faces east.
export const vehicleAngle=(slug:string,heading:number)=>heading+(slug==='osv'?Math.PI*5/6:-Math.PI*3/4);
function text(ctx:CanvasRenderingContext2D,label:string,x:number,y:number,color='#e8eefb',size=12){ctx.font=`600 ${size}px system-ui`;ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(label,x,y);}
function glow(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string){color=color.slice(0,7);const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color+'66');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
function ring(ctx:CanvasRenderingContext2D,p:Point,r:number,color:string,label='',time=0){glow(ctx,p[0],p[1],r*1.8,color);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p[0],p[1],r,0,TAU);ctx.stroke();ctx.beginPath();ctx.arc(p[0],p[1],r+5,time, time+Math.PI*.7);ctx.stroke();if(label)text(ctx,label,p[0],p[1]-r-13,color);}
function bevel(ctx:CanvasRenderingContext2D,r:Rect,fill:string,edge:string){ctx.fillStyle='#0006';ctx.fillRect(r[0]+7,r[1]+10,r[2],r[3]);ctx.fillStyle=fill;ctx.fillRect(...r);ctx.fillStyle=edge;ctx.fillRect(r[0],r[1],r[2],5);ctx.fillStyle='#0004';ctx.fillRect(r[0],r[1]+r[3]-5,r[2],5);}
function starfield(ctx:CanvasRenderingContext2D,cx:number,cy:number,t:number){for(let n=0;n<110;n++){const x=((n*173-cx*.18)%960+960)%960,y=((n*97-cy*.18)%540+540)%540;ctx.fillStyle=n%9===0?'#fff3dbaa':`rgba(174,204,255,${.2+Math.sin(t*.8+n)*.15})`;ctx.fillRect(x,y,n%9===0?2:1,n%9===0?2:1);}}
function stone(ctx:CanvasRenderingContext2D,r:Rect,color='#223f4e'){bevel(ctx,r,color,'#56756d');for(let y=r[1]+7;y<r[1]+r[3];y+=28){ctx.strokeStyle='#09182580';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(r[0],y);ctx.lineTo(r[0]+r[2],y);ctx.stroke();for(let x=r[0]+(Math.floor(y/28)%2?12:35);x<r[0]+r[2];x+=52){ctx.beginPath();ctx.moveTo(x,y-27);ctx.lineTo(x,y);ctx.stroke();}}}
function building(ctx:CanvasRenderingContext2D,r:Rect,n:number,night=true){
 const colors=['#27344d','#2b3147','#35334b','#203b49'],color=colors[n%4];
 ctx.fillStyle='#0008';ctx.beginPath();ctx.moveTo(r[0]+r[2],r[1]);ctx.lineTo(r[0]+r[2]+22,r[1]+30);ctx.lineTo(r[0]+r[2]+22,r[1]+r[3]+30);ctx.lineTo(r[0]+r[2],r[1]+r[3]);ctx.fill();
 bevel(ctx,r,color,'#607486');ctx.strokeStyle='#90a1b033';ctx.strokeRect(r[0]+9,r[1]+9,r[2]-18,r[3]-18);
 for(let x=r[0]+23;x<r[0]+r[2]-18;x+=39)for(let y=r[1]+29;y<r[1]+r[3]-20;y+=42){ctx.fillStyle=(Math.floor(x+y)+n)%4?'#ebbd7580':'#141e30';ctx.fillRect(x,y,14,17);if(night&&((Math.floor(x+y)+n)%4))glow(ctx,x+7,y+8,17,'#f0b66b');}
 ctx.fillStyle='#132033';ctx.fillRect(r[0]+r[2]*.37,r[1]+r[3]-22,r[2]*.26,22);ctx.fillStyle='#7392a3';ctx.fillRect(r[0]+r[2]*.38,r[1]+r[3]-24,r[2]*.24,4);
 ctx.fillStyle='#151f2e';ctx.fillRect(r[0]+18,r[1]+14,38,18);ctx.strokeStyle='#627482';for(let n=0;n<5;n++){ctx.beginPath();ctx.moveTo(r[0]+22+n*6,r[1]+17);ctx.lineTo(r[0]+22+n*6,r[1]+29);ctx.stroke();}
}
function circuit(ctx:CanvasRenderingContext2D,c:Config,s:State){
 const p=c.points!, path=()=>{ctx.beginPath();p.forEach(([x,y],n)=>n?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();};
 ctx.lineCap='round';ctx.lineJoin='round';path();ctx.strokeStyle='#10182a';ctx.lineWidth=c.width!+28;ctx.stroke();path();ctx.strokeStyle='#397474';ctx.lineWidth=c.width!+12;ctx.stroke();path();ctx.strokeStyle='#232d3b';ctx.lineWidth=c.width!;ctx.stroke();
 path();ctx.strokeStyle='#7896a666';ctx.lineWidth=2;ctx.setLineDash([22,35]);ctx.stroke();ctx.setLineDash([]);
 p.forEach((q,n)=>{const active=n===s.progress%p.length;ring(ctx,q,active?55:37,active?'#efffff':'#43bab877',n===0?'FINISH':`${n}`,s.time);if(active)drawSprite(ctx,'gate',q[0],q[1],65,{alpha:.5});});
 c.mines!.forEach(q=>{ring(ctx,q,26+Math.sin(s.time*4)*3,'#ff597d','',s.time);ctx.fillStyle='#ff597d';ctx.beginPath();ctx.moveTo(q[0],q[1]-12);ctx.lineTo(q[0]+12,q[1]+11);ctx.lineTo(q[0]-12,q[1]+11);ctx.fill();});
 s.entities.forEach(e=>{glow(ctx,e.x,e.y,48,e.kind%2?'#ffd26b':'#f07cdd');drawSprite(ctx,'racer',e.x,e.y,62,{angle:vehicleAngle('ndp',e.phase),alpha:.7});});
}
function city(ctx:CanvasRenderingContext2D,c:Config,s:State){
 const ww=c.world![0],wh=c.world![1];ctx.fillStyle='#1b2633';ctx.fillRect(0,0,ww,wh);
 for(let x=35;x<ww;x+=58){ctx.strokeStyle='#2d3c4c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,wh);ctx.stroke();}
 c.buildings!.forEach((r,n)=>{ctx.fillStyle='#445160';ctx.fillRect(r[0]-22,r[1]-22,r[2]+44,r[3]+44);building(ctx,r,n);});
 // Painted lane strips and crossing markings make the navigable streets legible.
 for(const x of [180,940,1670]){ctx.strokeStyle='#c2be8455';ctx.lineWidth=3;ctx.setLineDash([23,29]);ctx.beginPath();ctx.moveTo(x,25);ctx.lineTo(x,wh-25);ctx.stroke();ctx.setLineDash([]);}
 for(const y of [150,540,930]){ctx.strokeStyle='#c2be8455';ctx.lineWidth=3;ctx.setLineDash([23,29]);ctx.beginPath();ctx.moveTo(25,y);ctx.lineTo(ww-25,y);ctx.stroke();ctx.setLineDash([]);}
 for(const [x,y] of c.signals??[]){for(let k=0;k<6;k++){ctx.fillStyle='#abb8be55';ctx.fillRect(x-40+k*13,y-37,7,74);}ctx.fillStyle='#141b24';ctx.fillRect(x+47,y-50,13,31);glow(ctx,x+53,y-35,18,s.time%12<3?'#ff5c6b':'#93f18b');ctx.fillStyle=s.time%12<3?'#ff5c6b':'#93f18b';ctx.beginPath();ctx.arc(x+53,y-35,4,0,TAU);ctx.fill();}
 ring(ctx,c.hub!,65,'#76ddfa','DEPOT · REPAIR',s.time);drawSprite(ctx,'terminal',...c.hub!,52);
 const current=s.cargo>=0?c.stops![s.progress]:c.pickups?.[s.progress]??c.hub!;
 if(current){ring(ctx,current,47,s.cargo>=0?'#ffcf80':'#74dafa',s.cargo>=0?`DELIVERY ${s.progress+1}`:`PICKUP ${s.progress+1}`,s.time);drawSprite(ctx,s.cargo>=0?'parcel':'terminal',current[0],current[1]-8,54);text(ctx,(c.jobTypes?.[s.progress]??'standard').toUpperCase(),current[0],current[1]+66,'#f0e4c8',11);}
 for(const [x,y,vx,vy] of c.traffic!){const t=s.time-Math.floor(s.time/12)*3-Math.min(s.time%12,3),tx=45+((x-45+vx*t)%(ww-90)+(ww-90))%(ww-90),ty=45+((y-45+vy*t)%(wh-90)+(wh-90))%(wh-90);drawSprite(ctx,'courier',tx,ty,60,{angle:vehicleAngle('slc',Math.atan2(vy,vx)),alpha:.75});ctx.fillStyle='#ff8675';ctx.fillRect(tx-7,ty-4,14,4);}
}
function space(ctx:CanvasRenderingContext2D,c:Config,s:State){
 c.rocks!.forEach(([x,y,r],n)=>{ctx.fillStyle='#0006';ctx.beginPath();ctx.ellipse(x+8,y+15,r,r*.8,0,0,TAU);ctx.fill();drawSprite(ctx,'asteroid',x,y,r*2.6,{angle:n*.7});});
 const base=c.base!;glow(ctx,...base,170,'#6099f4');ctx.fillStyle='#162a43';ctx.strokeStyle='#467996';ctx.lineWidth=4;ctx.beginPath();ctx.arc(base[0]-85,base[1],110,0,TAU);ctx.fill();ctx.stroke();for(let n=0;n<8;n++){const a=n/8*TAU;ctx.fillStyle=n<s.progress?'#e4ce84':'#253e58';ctx.fillRect(base[0]-85+Math.cos(a)*87-8,base[1]+Math.sin(a)*87-5,16,10);}
 ring(ctx,base,70,'#91baf6','STATION · DOCK',s.time);drawSprite(ctx,'terminal',base[0]-85,base[1],100);
 c.pods!.forEach((p,n)=>{if(!s.items[n]&&s.cargo!==n){glow(ctx,...p,50,'#ffd491');drawSprite(ctx,'cargo',...p,54,{angle:Math.sin(s.time*.5+n)*.1});text(ctx,`CARGO ${n+1}`,p[0],p[1]-42,'#ffdc95');}});
 if(s.cargo>=0){ctx.strokeStyle='#8feaff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.cargoX,s.cargoY);ctx.stroke();drawSprite(ctx,'cargo',s.cargoX,s.cargoY,47,{angle:Math.atan2(s.cargoY-s.y,s.cargoX-s.x)});ctx.fillStyle='#ffcc79';ctx.fillRect(s.cargoX-21,s.cargoY-32,42*s.cargoHealth/100,3);}
 (c.walls??[]).forEach(r=>bevel(ctx,r,'#26374d','#5c778c'));
 (c.doors??[]).forEach((r,n)=>{if(!s.flags[n]){bevel(ctx,r,'#5e303b','#ff8490');text(ctx,'LOCK',r[0]+r[2]/2,r[1]+r[3]/2,'#ffd0d3',10);}});
 (c.valves??[]).forEach((p,n)=>{ring(ctx,p,33,s.flags[n]?'#8de8ad':'#ffcb77',s.flags[n]?'OPEN':'AIRLOCK',s.time);drawSprite(ctx,'terminal',...p,43);});
 s.entities.forEach(e=>{if(e.hp>0){drawSprite(ctx,e.kind===1?'turret':'drone',e.x,e.y,55);if(dist(s.x,s.y,[e.x,e.y])<190){ctx.strokeStyle='#f19e7455';ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(e.x,e.y);ctx.stroke();}}});
}
function underwater(ctx:CanvasRenderingContext2D,c:Config,s:State){
 const ww=c.world![0],wh=c.world![1];
 for(let n=0;n<32;n++){const x=n*61;ctx.fillStyle='#172f4388';ctx.fillRect(x,200+n%5*32,23,wh);ctx.fillStyle='#28445c66';ctx.fillRect(x-10,190+n%5*32,44,12);}
 c.walls!.forEach((r,n)=>{stone(ctx,r);ctx.strokeStyle='#4b97776e';ctx.lineWidth=3;for(let x=r[0]+6;x<r[0]+r[2];x+=19){ctx.beginPath();ctx.moveTo(x,r[1]);ctx.bezierCurveTo(x+8,r[1]+30,x-9,r[1]+55,x+Math.sin(s.time+n)*5,r[1]+80);ctx.stroke();}});
 (c.doors??[]).forEach((r,n)=>{if(!s.flags[n]){bevel(ctx,r,'#265564','#73cdd7');for(let y=r[1]+15;y<r[1]+r[3];y+=20){ctx.strokeStyle='#86cad7';ctx.beginPath();ctx.moveTo(r[0],y);ctx.lineTo(r[0]+r[2],y);ctx.stroke();}}});
 for(const [x,y,w,h,dx,dy] of c.currents!){ctx.fillStyle='#88e4e710';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#8cd3d63a';for(let n=0;n<7;n++){const yy=y+h*n/7;ctx.beginPath();ctx.moveTo(x,yy);ctx.bezierCurveTo(x+w*.3,yy+Math.sin(s.time+n)*16,x+w*.6,yy-12,x+w,yy);ctx.stroke();}text(ctx,dx<0?'← CURRENT':dy>0?'↓ CURRENT':'CURRENT →',x+w/2,y+25,'#8ddae3',12);}
 c.air!.forEach(p=>{glow(ctx,...p,80,'#96d4ec');drawSprite(ctx,'oxygen',...p,56);ring(ctx,p,52,'#b6eefaaa','AIR',s.time);for(let n=0;n<6;n++){ctx.strokeStyle='#cbecf2aa';ctx.beginPath();ctx.arc(p[0]+Math.sin(n*7+s.time)*20,p[1]+30-(s.time*22+n*11)%60,3+n%3,0,TAU);ctx.stroke();}});
 c.relics!.forEach((p,n)=>{if(!s.items[n]){glow(ctx,...p,52,'#fddc87');drawSprite(ctx,'relic',p[0],p[1]+Math.sin(s.time*2+n)*4,45);}});
 (c.valves??[]).forEach((p,n)=>{drawSprite(ctx,'terminal',p[0]+45,p[1]-20,46);text(ctx,s.flags[n]?'VALVE OPEN':'RELEASE VALVE',p[0],p[1]+72,s.flags[n]?'#91e7a4':'#e9c684',11);});
 s.entities.forEach(e=>{if(e.hp>0){drawSprite(ctx,e.kind===0?'jelly':'shark',e.x,e.y,e.kind===2?135:e.kind===1?92:66,{flip:e.vx<0});if(dist(s.x,s.y,[e.x,e.y])<165)ring(ctx,[e.x,e.y],e.kind===2?65:43,'#f28f7755');}});
 ring(ctx,c.exit!,45,s.items.every(Boolean)&&s.flags.every(Boolean)?'#adeaa1':'#497b7c','EXIT SEAL',s.time);drawSprite(ctx,'gate',...c.exit!,70);
 // Swaying foreground plants and suspended particles create depth without obscuring the route.
 for(let n=0;n<80;n++){const x=(n*137)%ww,y=(n*83+s.time*9)%wh;ctx.fillStyle='#c5f1ed44';ctx.fillRect(x,y,n%5===0?3:1,n%5===0?3:1);}
}
function combat(ctx:CanvasRenderingContext2D,c:Config,s:State){
 ctx.fillStyle='#192323';ctx.fillRect(0,0,960,540);for(let x=0;x<960;x+=80)for(let y=0;y<540;y+=80){ctx.strokeStyle='#43554e33';ctx.strokeRect(x+3,y+3,74,74);ctx.fillStyle='#273a3133';ctx.fillRect(x+7,y+7,9,9);}
 ctx.strokeStyle='#93b76766';ctx.lineWidth=8;ctx.strokeRect(22,54,916,463);for(let n=0;n<12;n++){ctx.fillStyle=n%2?'#404b39':'#97ac63';ctx.fillRect(25+n*78,505,39,7);}
 c.walls!.forEach(r=>{bevel(ctx,r,'#344139','#87a36d');for(let y=r[1]+13;y<r[1]+r[3];y+=18){ctx.fillStyle='#52684e';ctx.fillRect(r[0]+8,y,r[2]-16,4);}});
 drawSprite(ctx,'terminal',65,90,50);ring(ctx,[865,270],42,s.doorOpen?'#b8f584':'#42563e',s.doorOpen?'NEXT ROOM':'LOCKED',s.time);
 s.entities.forEach(e=>{if(e.hp<=0)return;const boss=e.kind===6,size=boss?113:e.kind===2?74:57;const tele=e.kind===3&&e.phase%3.2>.9&&e.phase%3.2<1.45||boss&&e.phase%3.1>2.4;
 if(tele){ctx.strokeStyle='#ff8b6666';ctx.lineWidth=25;ctx.beginPath();ctx.moveTo(e.x,e.y);const a=Math.atan2(s.y-e.y,s.x-e.x);ctx.lineTo(e.x+Math.cos(a)*400,e.y+Math.sin(a)*400);ctx.stroke();ring(ctx,[e.x,e.y],size*.6,'#ffd093');}
 if(boss){ring(ctx,[e.x,e.y],54,'#f0ae78','',e.phase);ctx.strokeStyle='#f4936b';ctx.lineWidth=6;for(let n=0;n<4;n++){const a=n*Math.PI/2+e.phase*.22;ctx.beginPath();ctx.moveTo(e.x+Math.cos(a)*34,e.y+Math.sin(a)*34);ctx.lineTo(e.x+Math.cos(a)*63,e.y+Math.sin(a)*63);ctx.stroke();}}
 drawSprite(ctx,boss||e.kind===4?'turret':'drone',e.x,e.y,size,{flip:e.x>s.x});if(e.kind===1||e.kind===4)glow(ctx,e.x,e.y,23,'#f49169');
 if(e.kind===2){ctx.strokeStyle='#cabf88';ctx.lineWidth=4;ctx.strokeRect(e.x-35,e.y-30,70,60);}else if(e.kind===3){ctx.fillStyle='#ffbe70';ctx.beginPath();ctx.moveTo(e.x-7,e.y-38);ctx.lineTo(e.x,e.y-46);ctx.lineTo(e.x+7,e.y-38);ctx.fill();}else if(e.kind===5){ring(ctx,[e.x,e.y],32,'#b59be6','',e.phase);}
 ctx.fillStyle='#182020';ctx.fillRect(e.x-25,e.y-size*.47-12,50,5);ctx.fillStyle=boss?'#ffb377':'#f48b88';const max=boss?24+s.chapter*10:[3,4,7,5,6,4][e.kind];ctx.fillRect(e.x-25,e.y-size*.47-12,50*e.hp/max,5);
 });
 s.projectiles.forEach(p=>{ctx.strokeStyle=p.enemy?'#ffb091':'#bbf58f';ctx.lineWidth=p.enemy?6:4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x-p.vx*.025,p.y-p.vy*.025);ctx.lineTo(p.x,p.y);ctx.stroke();glow(ctx,p.x,p.y,p.enemy?13:10,p.enemy?'#ff7c57':'#c3ff84');});
 s.drops.forEach(p=>{if(p.active){drawSprite(ctx,p.type===0?'oxygen':'relic',p.x,p.y+Math.sin(s.time*3)*2,34);glow(ctx,p.x,p.y,33,p.type===0?'#8ff5c1':'#a5ccff');}});
 text(ctx,`SECURITY SECTOR ${s.progress+1} · ${c.biome?.toUpperCase()??''}`,480,40,'#a6bba6',13);
}
function platforms(ctx:CanvasRenderingContext2D,c:Config,s:State){
 c.platforms!.forEach((base,n)=>{if(s.crumbles[n]===-1)return;const m=c.motions?.find(m=>m[0]===n),r:Rect=m?[base[0]+Math.sin(s.time/m[3]*TAU)*m[1],base[1]+Math.sin(s.time/m[3]*TAU)*m[2],base[2],base[3]]:base;
 ctx.fillStyle='#171d2c';ctx.beginPath();ctx.moveTo(r[0]+10,r[1]+r[3]);ctx.lineTo(r[0]+r[2]-15,r[1]+r[3]);ctx.lineTo(r[0]+r[2]*.68,r[1]+r[3]+42);ctx.lineTo(r[0]+r[2]*.2,r[1]+r[3]+33);ctx.fill();stone(ctx,r,c.biome==='garden'?'#354549':'#333b56');ctx.fillStyle=c.fragile?.includes(n)?'#b3a181':'#9dacbc';ctx.fillRect(r[0],r[1],r[2],5);
 for(let x=r[0]+8;x<r[0]+r[2];x+=22){ctx.fillStyle=c.biome==='garden'?'#5c996e':'#868caf';ctx.fillRect(x,r[1]-5,8,5);}
 if(s.crumbles[n]>0){ctx.strokeStyle='#f1c185';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(r[0]+r[2]*.3,r[1]);ctx.lineTo(r[0]+r[2]*.5,r[1]+r[3]);ctx.stroke();}
 });
 c.spikes!.forEach(([x,y,w,h])=>{ctx.fillStyle='#bc526a';for(let a=x;a<x+w;a+=19){ctx.beginPath();ctx.moveTo(a,y+h);ctx.lineTo(a+9,y);ctx.lineTo(a+18,y+h);ctx.fill();}});
 c.runes!.forEach((p,n)=>{if(!s.items[n]){glow(ctx,...p,38,'#ffdb84');drawSprite(ctx,'relic',p[0],p[1]+Math.sin(s.time*2+n)*4,42);}});
 c.secrets?.forEach((p,n)=>{if(!s.secrets[n]){drawSprite(ctx,'chest',...p,48);glow(ctx,...p,43,'#c7c0fb');}});
 c.checkpoints?.forEach((p,n)=>{drawSprite(ctx,'beacon',p[0],p[1]-16,66);if(n<=s.checkpoint)glow(ctx,p[0],p[1]-28,65,'#aca8ed');});
 s.entities.forEach(e=>{if(e.hp>0){drawSprite(ctx,e.kind===2?'thornbeast':'sentinel',e.x,e.y,e.kind===2?105:62,{flip:Math.cos(e.phase*.8)<0});if(e.kind===2)ring(ctx,[e.x,e.y],49,'#efac8077');}});
 drawSprite(ctx,'portal',...c.exit!,105);glow(ctx,...c.exit!,80,s.items.every(Boolean)?'#b0f1e6':'#8986d8');
}

export function paintWorld(ctx:CanvasRenderingContext2D,slug:string,c:Config,s:State,camX:number,camY:number,palette:[string,string,string]){
 const sky:Record<string,string>={moonlit:'#27394e',windward:'#34505f',garden:'#244943',mirrors:'#483b60',crown:'#382c49'};
 const g=ctx.createLinearGradient(0,0,0,540);g.addColorStop(0,slug==='dpt'?'#183d54':slug==='rrn'?(sky[c.biome??'moonlit']):palette[0]);g.addColorStop(1,slug==='dpt'?'#05182a':slug==='rrn'?'#6d75834a':'#070e1c');ctx.fillStyle=g;ctx.fillRect(0,0,960,540);
 if(slug==='osv'){starfield(ctx,camX,camY,s.time);glow(ctx,740-camX*.1,150-camY*.1,360,'#344d8b');ctx.fillStyle='#556b9655';ctx.beginPath();ctx.arc(890-camX*.12,350-camY*.1,225,0,TAU);ctx.fill();}
 if(slug==='rrn'){
  ctx.fillStyle='#d8d5bd';ctx.beginPath();ctx.arc(720-camX*.07,95,48,0,TAU);ctx.fill();glow(ctx,720-camX*.07,95,115,'#d4d6e9');
  for(let layer=0;layer<3;layer++){ctx.fillStyle=['#1d304a','#253b51','#354957'][layer];ctx.beginPath();ctx.moveTo(0,540);for(let x=-160;x<1150;x+=100)ctx.lineTo(x,280+layer*60+Math.sin((x+camX*(.08+layer*.08))*.007+layer)*70);ctx.lineTo(960,540);ctx.fill();}
  for(let n=0;n<13;n++){const x=((n*277-camX*.22)%1300+1300)%1300-120,h=100+n%4*35;ctx.fillStyle='#1a293ba8';ctx.fillRect(x,450-h,38,h);ctx.fillRect(x-8,450-h-10,54,10);}
  starfield(ctx,camX*.2,0,s.time);
  if(c.biome==='garden'){for(let n=0;n<9;n++){const x=((n*441-camX*.35)%1400+1400)%1400-80;ctx.strokeStyle='#102c2ea8';ctx.lineWidth=26;ctx.beginPath();ctx.moveTo(x,540);ctx.bezierCurveTo(x+30,400,x-20,180,x+90,105);ctx.stroke();for(let k=0;k<5;k++){ctx.fillStyle='#285f4a99';ctx.beginPath();ctx.ellipse(x+50+k*25,140+k*12,73,39,k*.3,0,TAU);ctx.fill();}}}
  if(c.biome==='mirrors'||c.biome==='crown'){for(let n=0;n<7;n++){const x=((n*317-camX*.2)%1300+1300)%1300-90;ctx.fillStyle=c.biome==='mirrors'?'#8982c755':'#a97aad33';ctx.beginPath();ctx.moveTo(x,490);ctx.lineTo(x+40,240+n%3*40);ctx.lineTo(x+95,490);ctx.fill();ctx.strokeStyle='#c4b3e933';ctx.stroke();}}
  if(c.biome==='windward'){ctx.strokeStyle='#deeae655';for(let n=0;n<18;n++){const x=(n*79+s.time*35)%1100-90,y=100+n*23;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+45,y);ctx.stroke();}}
 }
 if(slug==='ndp'&&c.biome==='canal'){ctx.fillStyle='#245b7259';ctx.fillRect(180-camX,260-camY,1120,400);ctx.strokeStyle='#8cc1c63b';for(let n=0;n<20;n++){ctx.beginPath();ctx.moveTo(190-camX,280+n*18-camY);ctx.lineTo(1280-camX,280+n*18+Math.sin(s.time+n)*8-camY);ctx.stroke();}}
 if(slug==='ndp'){ctx.save();ctx.translate(-camX,-camY);for(let n=0;n<45;n++){const x=(n*331+50)%(c.world![0]),y=(n*179+30)%(c.world![1]);const road=c.points!.some((p,i)=>{const b=c.points![(i+1)%c.points!.length],dx=b[0]-p[0],dy=b[1]-p[1],t=clamp(((x-p[0])*dx+(y-p[1])*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(x-p[0]-dx*t,y-p[1]-dy*t)<c.width!*.65+90;});if(!road)building(ctx,[x-36,y-35,72,70],n);}ctx.restore();}
 ctx.save();ctx.translate(-camX,-camY);
 if(slug==='ndp')circuit(ctx,c,s);if(slug==='osv')space(ctx,c,s);if(slug==='slc')city(ctx,c,s);if(slug==='dpt')underwater(ctx,c,s);if(slug==='gla')combat(ctx,c,s);if(slug==='rrn')platforms(ctx,c,s);ctx.restore();
 if(slug==='dpt'){const light=ctx.createRadialGradient(s.x-camX,s.y-camY,55,s.x-camX,s.y-camY,500);light.addColorStop(0,'#00000000');light.addColorStop(1,'#02101b77');ctx.fillStyle=light;ctx.fillRect(0,0,960,540);ctx.globalAlpha=.06;ctx.fillStyle='#b9e8ea';for(let n=0;n<7;n++){ctx.beginPath();ctx.moveTo(n*180-100,0);ctx.lineTo(n*180+30,0);ctx.lineTo(n*180+200+Math.sin(s.time*.4+n)*40,540);ctx.lineTo(n*180+70,540);ctx.fill();}ctx.globalAlpha=1;}
 if(slug==='ndp'&&c.biome==='rain-district'){ctx.strokeStyle='#92cde644';ctx.lineWidth=1;for(let n=0;n<70;n++){const x=(n*79+s.time*70)%1000,y=(n*53+s.time*300)%590;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-5,y+16);ctx.stroke();}}
}
export function paintOverlay(ctx:CanvasRenderingContext2D,slug:string,c:Config,s:State,camX:number,camY:number,palette:[string,string,string]){
 const vignette=ctx.createRadialGradient(480,270,220,480,270,570);vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#00000066');ctx.fillStyle=vignette;ctx.fillRect(0,0,960,540);
 if(slug!=='gla'){
  const ww=c.world![0],wh=c.world![1],mx=776,my=17,mw=165,mh=98;ctx.fillStyle='#0b1527dc';ctx.fillRect(mx-8,my-8,mw+16,mh+25);ctx.strokeStyle='#adc8d433';ctx.strokeRect(mx-8,my-8,mw+16,mh+25);const project=(p:Point):Point=>[mx+p[0]/ww*mw,my+p[1]/wh*mh];
  ctx.strokeStyle='#899ba466';if(c.points){ctx.beginPath();c.points.forEach((p,n)=>{const q=project(p);n?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.closePath();ctx.stroke();}
  for(const r of c.buildings??c.walls??c.platforms??[]){const p=project([r[0],r[1]]);ctx.fillStyle='#6f83914a';ctx.fillRect(p[0],p[1],r[2]/ww*mw,Math.max(2,r[3]/wh*mh));}
  let targets:Point[]=c.pods??c.relics??c.runes??[];if(slug==='slc')targets=[s.cargo>=0?c.stops![s.progress]:c.pickups?.[s.progress]??c.hub!].filter(Boolean);if(slug==='ndp')targets=[c.points![s.progress%c.points!.length]];
  targets.forEach((p,n)=>{if(!s.items[n]||slug==='slc'||slug==='ndp'){const q=project(p);ctx.fillStyle='#eed089';ctx.fillRect(q[0]-2,q[1]-2,4,4);}});const p=project([s.x,s.y]);ctx.fillStyle=palette[2];ctx.beginPath();ctx.arc(...p,3,0,TAU);ctx.fill();text(ctx,'SECTOR MAP',mx+mw/2,my+mh+12,'#c4d3df',9);
 }
 const label=slug==='ndp'?`${Math.round(Math.hypot(s.vx,s.vy))} KM/H · ${Math.floor(s.combo*10)} DRIFT`:slug==='rrn'?`CHECKPOINT ${s.checkpoint+1} · ${s.secrets.filter(Boolean).length}/${s.secrets.length} SECRETS`:slug==='gla'?`DASH ${s.cooldown>0?s.cooldown.toFixed(1)+'s':'READY'} · ${s.score} SCORE`:slug==='dpt'?`DEPTH ${Math.round(s.y/8)}m · ${s.flags.filter(Boolean).length}/${s.flags.length} VALVES`:slug==='osv'?`TRACTOR ${s.cargo>=0?'LOCKED':'READY'} · ${s.flags.filter(Boolean).length}/${s.flags.length} AIRLOCKS`:`${c.jobTypes?.[s.progress]?.toUpperCase()??'ROUTE COMPLETE'} · ${Math.floor(s.score)} SERVICE`;
 ctx.fillStyle='#0b1420d9';ctx.fillRect(16,504,430,25);ctx.textAlign='left';ctx.font='600 12px system-ui';ctx.fillStyle=palette[2];ctx.fillText(label,27,521);
 if(s.health>0&&s.hurt>0){ctx.strokeStyle='#ef806d99';ctx.lineWidth=6;ctx.strokeRect(3,3,954,534);}
 const next=slug==='ndp'?c.points![s.progress%c.points!.length]:slug==='slc'?(s.cargo>=0?c.stops![s.progress]:c.pickups?.[s.progress]??c.hub!):slug==='osv'&&s.cargo>=0?c.base:undefined;
 if(next){const x=next[0]-camX,y=next[1]-camY;if(x<25||x>935||y<25||y>515){const bx=clamp(x,32,930),by=clamp(y,135,480),a=Math.atan2(y-270,x-480);ctx.save();ctx.translate(bx,by);ctx.rotate(a);ctx.fillStyle='#ffe0a0';ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-7,-7);ctx.lineTo(-7,7);ctx.fill();ctx.restore();}}
}
