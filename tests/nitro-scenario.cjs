'use strict';
// Reuses the hidden Electron harness; all writes are real CDP keyboard input.
const assert=require('node:assert/strict'),T=require('../game/track.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function driving(k,track){
  const q=T.at(track,k.dist+7+Math.max(0,k.speed)*.3,k.nitro<100&&!k.nitroTime?(Math.floor(k.dist/20)%2?3:-3):0);
  const diff=Math.atan2(Math.sin(Math.atan2(q.x-k.x,q.z-k.z)-k.yaw),Math.cos(Math.atan2(q.x-k.x,q.z-k.z)-k.yaw));
  const keys=['ArrowUp'];if(diff>.065)keys.push('ArrowLeft');if(diff<-.065)keys.push('ArrowRight');
  if(Math.abs(diff)>.065&&Math.abs(diff)<.9&&Math.abs(k.lat)<track.half-1&&k.speed>14&&!k.air)keys.push('Space');
  return keys;
}
async function run({p,keys,wait,shot,check,report}){
  await p.activate('#solo');await wait('window.__kart.state.mode==="lobby"','lobby');await p.activate('[data-track="yarn"]');await p.activate('#ready');
  await wait('window.__kart.state.view.race?.phase==="racing"','go');
  await p.press('KeyN'); // Empty-tank press must never become a queued boost.
  const t=T.build('yarn');let partial=false,retained=false,ready=false,active=false,ended=false,second=false,third=false,buttonObserved=false,secondObserved=false,peak=0,firstAt=0,lastGauge=0,partialShot=false,casts=0;
  const deadline=Date.now()+160000;
  while(Date.now()<deadline){
    const s=await p.evaluate('window.__kart.state'),k=s.view.race.karts.find(x=>x.seat===s.view.you);
    if(s.view.race.phase!=='racing')break;
    if(k.nitro>0&&k.nitro<100)partial=true;
    if(partial&&!k.drift&&k.nitro>=lastGauge&&k.nitro>0&&k.nitro<100)retained=true;
    if(retained&&!partialShot){await shot('nitro-charging');partialShot=true;}
    if(k.nitro===100&&!ready){
      ready=true;check('early empty-tank press never auto-fires',k.nitroCasts===0);
      const ui=await p.evaluate('({state:document.querySelector("#nitro-button").dataset.state,disabled:document.querySelector("#nitro-button").disabled})');
      check('full gauge is visibly ready and actionable',ui.state==='ready'&&!ui.disabled);await shot('nitro-ready');
      await p.key('KeyN');firstAt=Date.now(); // Held for the whole boost: one press, one tank.
    }
    if(k.nitroTime>0){
      peak=Math.max(peak,k.speed);if(!second)casts=k.nitroCasts;
      if(!active&&k.nitroTime<2.7){
        active=true;await shot('nitro-active');
        check('cyan nitro exhaust is actually rendered',(await p.evaluate('window.__kart.world().drivers')).find(d=>d.seat===s.view.you).nitroFlame);
        check('active gauge displays remaining boost time',await p.evaluate('document.querySelector("#nitro-state").textContent.includes("加速中")'));
        check('spending empties tank',k.nitro===0);
      }
    }
    if(active&&!k.nitroTime&&Date.now()-firstAt>3200){ended=true;await p.key('KeyN','keyUp');}
    if(ended&&!second&&k.nitro===100){await p.press('ControlLeft');second=true;}
    if(second&&k.nitroCasts===2&&!secondObserved){check('Ctrl releases a freshly earned second tank');secondObserved=true;}
    if(secondObserved&&k.nitro===100&&!k.nitroTime&&!third){await p.activate('#nitro-button');third=true;}
    if(third&&k.nitroCasts===3){buttonObserved=true;check('focused HUD button releases a third tank with real Enter');break;}
    lastGauge=k.nitro;await keys(driving(k,t));await sleep(40);
  }
  await keys([]);await p.key('KeyN','keyUp');
  check('real drifting accumulates energy across separate drifts',partial&&retained);
  check('manual nitro starts, expires and can be earned again',ready&&active&&ended&&secondObserved&&buttonObserved);
  check('held N consumes exactly one tank',casts===1);check('nitro exceeds normal top speed',peak>33);
  report.nitro={peak,partial,retained,ready,active,ended,secondObserved,buttonObserved};
  await p.activate('#leave');await wait('window.__kart.state.mode==="title"','leave');
  await p.activate('#solo');await p.activate('#ready');
  const reset=await wait('window.__kart.state.view.race','new grid');
  check('fresh race resets energy, duration and activation count',reset.karts.every(k=>k.nitro===0&&k.nitroTime===0&&k.nitroCasts===0));
  await p.activate('#leave');await wait('window.__kart.state.mode==="title"','leave fresh');
}
module.exports={run,driving};
