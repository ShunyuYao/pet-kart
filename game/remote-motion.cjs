'use strict';
// Game adapter: local prediction stays local; pet-kit owns only time/history.
const Motion=require('../vendor/pet-kit/motion.js');
function create({delayMs=150,maxProjectionMs=100}={}){
 const angle=(a,b,f)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*f;
 function blend(a,b,f,span){return b.map(kb=>{
  const ka=a.find(k=>k.seat===kb.seat);if(!ka)return {...kb};
  if(Math.hypot(kb.x-ka.x,kb.z-ka.z)>Math.max(6,Math.abs(kb.speed)*span/1000*3))return {...kb};
  const k={...kb};for(const n of ['x','y','z'])k[n]=ka[n]+(kb[n]-ka[n])*f;
  for(const n of ['speed','steer'])k[n]=ka[n]+(kb[n]-ka[n])*Math.min(1,f);
  k.yaw=angle(ka.yaw,kb.yaw,Math.min(1,f));return k;
 });}
 const buffer=Motion.create({delayMs,maxProjectionMs,interpolate:blend,project:(a,b,ms,span)=>blend(a,b,1+ms/span,span)});
 let phase=null,latest=[];
 function reset(){buffer.reset();phase=null;latest=[];}
 function push(view,receivedAt){const race=view?.race;if(!race){reset();return;}
  phase=race.phase;latest=race.karts.filter(k=>k.seat!==view.you).map(k=>({...k}));
  buffer.push({time:race.t,key:[view.raceNo,race.trackId,race.phase,view.you].join(':'),value:latest},receivedAt);
 }
 return {push,reset,sample:now=>phase==='racing'?(buffer.sample(now)||[]):latest.map(k=>({...k})),stats:buffer.stats};
}
module.exports={create};
