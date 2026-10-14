'use strict';
// Remote presentation only. Host simulation time is independent of arrival
// jitter; local prediction, collision decisions and authoritative snapshots stay untouched.
function create({delayMs=150,maxProjectionMs=100}={}){
 let frames=[],identity=null,offset=null,lastTime=-Infinity,lastReceived=-Infinity;
 const angle=(a,b,f)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*f;
 function reset(){frames=[];identity=null;offset=null;lastTime=-Infinity;lastReceived=-Infinity;}
 function push(view,receivedAt){
  const race=view?.race;if(!race){reset();return;}
  const key=[view.raceNo,race.trackId,race.phase,view.you].join(':');
  if(key!==identity){reset();identity=key;}
  if(frames.length&&race.t<=frames.at(-1).t)return;
  // Resume after suspension with a fresh clock, never project a stale race.
  if(receivedAt-lastReceived>1000){frames=[];offset=null;lastTime=-Infinity;}
  lastReceived=receivedAt;
  const frame={t:race.t,phase:race.phase,karts:race.karts.filter(k=>k.seat!==view.you).map(k=>({...k}))};
  offset=Math.min(offset??Infinity,receivedAt-race.t);
  frames.push(frame);if(frames.length>32)frames.shift();
 }
 function sample(now){
  if(!frames.length)return [];
  const first=frames[0],last=frames.at(-1);
  if(last.phase!=='racing')return last.karts.map(k=>({...k}));
  const t=Math.max(lastTime,now-offset-delayMs);lastTime=t;
  if(t<=first.t||frames.length===1)return first.karts.map(k=>({...k}));
  let a=frames.at(-2),b=last;
  for(let i=1;i<frames.length;i++)if(frames[i].t>=t){a=frames[i-1];b=frames[i];break;}
  const span=b.t-a.t,f=(Math.min(t,b.t+maxProjectionMs)-a.t)/span;
  return b.karts.map(kb=>{
   const ka=a.karts.find(k=>k.seat===kb.seat);if(!ka)return {...kb};
   // A respawn/teleport is not a drive across the intervening track.
   if(Math.hypot(kb.x-ka.x,kb.z-ka.z)>Math.max(6,Math.abs(kb.speed)*span/1000*3))return {...kb};
   const k={...kb};for(const n of ['x','y','z'])k[n]=ka[n]+(kb[n]-ka[n])*f;
   for(const n of ['speed','steer'])k[n]=ka[n]+(kb[n]-ka[n])*Math.min(1,f);
   k.yaw=angle(ka.yaw,kb.yaw,Math.min(1,f));return k;
  });
 }
 return {push,sample,reset};
}
module.exports={create};
