'use strict';
const T=require('../game/track.cjs'),{connect}=require('./cdp.cjs');
async function autopilot(app,held){
  // Real key presses only, over one persistent CDP session: read our kart, steer like a player.
  app.cdpS??=await connect(app.game);
  const s=await app.cdpS.evaluate('(()=>{const s=window.__kart.state,r=s.view?.race;if(!r)return null;const me=s.pred||r.karts.find(x=>x.seat===s.view.you);return {phase:r.phase,trackId:r.trackId,x:me.x,z:me.z,yaw:me.yaw,dist:me.dist,speed:me.speed,item:me.item,rolling:me.rolling,air:me.air,glide:me.glide,y:me.y,landings:me.landings,lat:me.lat,nitro:me.nitro,nitroTime:me.nitroTime,nitroCasts:me.nitroCasts,authority:r.karts.find(x=>x.seat===s.view.you),rendered:window.__kart.world().drivers};})()');
  if(!s||s.phase!=='racing')return s;
  if(held.nitroMode){
    const want=require('./nitro-scenario.cjs').driving(s,T.build(s.trackId));
    for(const code of ['ArrowLeft','ArrowRight','Space']){const down=want.includes(code);if(!!held[code]!==down){await app.cdpS.key(code,down?'keyDown':'keyUp');held[code]=down;}}
    if(s.nitro===100&&!s.nitroTime)await app.cdpS.press('KeyN');
    return s;
  }
  const t=T.build(s.trackId),p=T.at(t,s.dist+9+Math.max(0,s.speed)*.35,0);
  let diff=Math.atan2(p.x-s.x,p.z-s.z)-s.yaw;diff=Math.atan2(Math.sin(diff),Math.cos(diff));
  const want=diff>.1?'ArrowLeft':diff<-.1?'ArrowRight':null;
  for(const key of ['ArrowLeft','ArrowRight'])if(held[key]&&key!==want){await app.cdpS.key(key,'keyUp');held[key]=false;}
  if(want&&!held[want]){await app.cdpS.key(want);held[want]=true;}
  return s;
}
module.exports={autopilot};
