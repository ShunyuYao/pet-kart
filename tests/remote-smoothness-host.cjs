'use strict';
// Observe real Three scene roots while BOTH humans drive through real CDP keys.
// Normal traffic, then 180 ms batches on the receiver's real production SDK polls.
const assert=require('node:assert/strict'),path=require('node:path'),CDP=require('./cdp.cjs');
function stats(rows,run){
 const ratios=[],dtimes=[];let holds=0,back=0;
 const f=rows.filter(r=>r.run===run&&r.seat===0);
 for(let i=1;i<f.length;i++){
  const a=f[i-1],b=f[i],dt=(b.t-a.t)/1000,k=b.state;
  if(dt<.005||dt>.05||b.since<500||Math.abs(k.speed)<8||k.spin>0||a.state.spin>0||Math.abs(k.speed-a.state.speed)>3)continue;
  const dx=b.position.x-a.position.x,dz=b.position.z-a.position.z,d=Math.hypot(dx,dz),speed=Math.abs(k.speed);
  ratios.push(d/(speed*dt));dtimes.push(dt);holds+=d<.0001?1:0;back+=(dx*Math.sin(k.yaw)+dz*Math.cos(k.yaw))*Math.sign(k.speed)<-.02?1:0;
 }
 assert(ratios.length>80,'enough steady rendered remote frames '+run+' '+ratios.length);
 ratios.sort((a,b)=>a-b);return {run,frames:ratios.length,holdRatio:holds/ratios.length,reverseRatio:back/ratios.length,p95SpeedRatio:ratios[Math.floor(ratios.length*.95)],maxSpeedRatio:ratios.at(-1),meanFrameMs:1000*dtimes.reduce((a,b)=>a+b,0)/dtimes.length};
}
exports.stats=stats;
exports.run=async({a,b,H,wait,state,activateButton,check,screenshot,json,evidence,report,autopilot,closeWork})=>{
 const casts=[],held={a:{},b:{}};
 try{
  for(const app of [a,b]){
   app.cdpS=await CDP.connect(app.game);casts.push(app.cdpS);
   app.cdpS.on(m=>{if(m.method==='Page.screencastFrame')void app.cdpS.send('Page.screencastFrameAck',{sessionId:m.params.sessionId});});
   await app.cdpS.send('Page.startScreencast',{format:'jpeg',quality:1,maxWidth:160,maxHeight:100,everyNthFrame:1});
  }
  await activateButton(a.game,'[data-track="yarn"]');await activateButton(a.game,'#ready');await activateButton(b.game,'#ready');
  await wait(async()=>(await state(a)).view?.race?.phase==='racing','real race begins');
  for(const app of [a,b]){
   await app.cdpS.evaluate(`(()=>{document.activeElement?.blur();window.__motion=[];window.__motionRun='normal';window.__motionStart=performance.now();window.__kartRenderProbe=p=>{if(window.__motion.length<20000)window.__motion.push({...p,run:window.__motionRun,since:performance.now()-window.__motionStart});};return true;})()`);
   await app.cdpS.key('ArrowUp');
  }
  for(const run of ['normal','batched']){
   for(const app of [a,b])await app.cdpS.evaluate(`window.__motionRun=${JSON.stringify(run)};window.__motionStart=performance.now();true`);
   if(run==='batched')await b.cdpS.evaluate('window.__delayedPolls=0;window.__kartPollDelay=()=>{window.__delayedPolls++;return new Promise(r=>setTimeout(r,180));};true');
   const until=Date.now()+6500;while(Date.now()<until){await autopilot(a,held.a);await autopilot(b,held.b);await H.sleep(80);}
   await screenshot(b.game,'receiver-driving-'+run);
  }
  report.delayedPolls=await b.cdpS.evaluate('window.__delayedPolls');assert(report.delayedPolls>10,'real SDK polling fault exercised');
  const rows=await b.cdpS.evaluate('window.__motion');json(path.join(evidence,'receiver-root-motion.json'),rows);
  report.smoothness=['normal','batched'].map(run=>stats(rows,run));console.log('MOTION',JSON.stringify(report.smoothness));
  const s=await state(a);assert(s.view.race.karts.find(k=>k.seat===1).dist>70,'receiver really drove its own car');
  for(const m of report.smoothness){assert(m.holdRatio<.15,'other cars continuous '+JSON.stringify(m));assert(m.p95SpeedRatio<1.7,'other cars stable speed '+JSON.stringify(m));assert(m.reverseRatio<.03,'other cars do not reverse '+JSON.stringify(m));}
  check('receiver sees other human car move continuously while driving, including 180ms batching',report.smoothness);
  await b.cdpS.evaluate('window.__kartPollDelay=null;window.__kartRenderProbe=null;true');
  for(const app of [a,b])for(const key of ['ArrowUp','ArrowLeft','ArrowRight'])await app.cdpS.key(key,'keyUp');
  await closeWork(a);await wait(async()=>(await state(b)).connection==='closed','receiver sees room close');
  check('room exit propagates after smoothing');
 }finally{for(const app of [a,b])if(app.cdpS){await app.cdpS.send('Page.stopScreencast').catch(()=>{});app.cdpS.close();}}
};
