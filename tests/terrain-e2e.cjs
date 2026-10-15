'use strict';
// Real unmodified HTML in hidden Electron; read-only state observer, CDP keyboard
// driving from the grid. No teleports, injected inputs, shortened clocks or mocks.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {connect}=require('./cdp.cjs'),T=require('../game/track.cjs'),E=require('../game/terrain.cjs');
const ROOT=path.resolve(__dirname,'..'),HOST=process.env.KART_HOST_ROOT||path.resolve(ROOT,'../..');
const out=path.join(ROOT,'artifacts/terrain-e2e',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[],screenshots:[],scope:'Unmodified game HTML, hidden Electron, isolated profile, CDP real keyboard; not native focus or physical networking.'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),check=(label,value=true)=>{assert(value,label);report.checks.push(label);console.log('PASS',label);};
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pet-kart-e2e-')),port=20000+Math.floor(Math.random()*1000);
 const child=spawn(require(path.join(HOST,'demo/node_modules/electron')),[path.join(__dirname,'browser-shell.cjs'),'--remote-debugging-port='+port,'--use-mock-keychain','--mute-audio'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'',KART_E2E_PROFILE:profile,KART_HTML:path.join(ROOT,'dist/桌宠赛车.html')},stdio:'ignore',detached:true});
 let p;const held=new Set();
 async function keys(want){for(const k of [...held])if(!want.includes(k)){await p.key(k,'keyUp');held.delete(k);}for(const k of want)if(!held.has(k)){await p.key(k);held.add(k);}}
 async function wait(expr,label,ms=12000){const end=Date.now()+ms;while(Date.now()<end){const v=await p.evaluate(expr);if(v)return v;await sleep(80);}throw Error('timeout '+label);}
 const shot=async name=>{const f=path.join(out,name+'.png');await p.screenshot(f);report.screenshots.push(f);};
 try{
  let target;for(let i=0;i<100&&!target;i++){try{target=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page');}catch{}await sleep(100);}assert(target,'Electron started');p=await connect(target);await p.send('Runtime.enable');p.on(m=>{if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails);});
  await wait('window.__kart?.state.driver','boot');
  for(const id of T.ids){
   await p.activate('#solo');await wait('window.__kart.state.mode==="lobby"','lobby');await p.activate('[data-track="'+id+'"]');await wait('window.__kart.state.view.trackId==="'+id+'"','track');await p.activate('#ready');
   await wait('window.__kart.state.view.race?.phase==="countdown"','countdown');await shot(id+'-approach');
   await keys(['ArrowUp']);await wait('window.__kart.state.view.race.phase==="racing"','go');
   const t=T.build(id),seen=new Set(),phases=new Set();let air=false,land=false,ice=false,hits=0,frame=null,airSample=null,last=null,brakeDone=false;
   const until=Date.now()+32000;
   while(Date.now()<until){
    const s=await p.evaluate('window.__kart.state'),r=s.view.race,k=r.karts.find(q=>q.seat===s.view.you),world=await p.evaluate('window.__kart.world()');last=k;
    for(const f of world.terrain){seen.add(f.kind);if(f.kind==='lava')phases.add(f.phase);const def=E.features(t).find(x=>x.id===f.id),expected=E.sample(t,def,r.t);assert(Math.hypot(f.x-expected.x,f.z-expected.z)<2,'rendered obstacle follows race time');}
    if(k.air&&k.y-T.sampleY(t,k.dist)>2){air=true;if(!frame&&k.airTime>.45){frame=true;airSample=k;await shot(id+'-flight');check(id+' rendered kart is above road',world.drivers.find(d=>d.seat===s.view.you).y>T.sampleY(t,k.dist)+1);if(id!=='cheese')check(id+' canopy is visibly deployed',world.drivers.find(d=>d.seat===s.view.you).glider);}}
    if(air&&!k.air&&k.landings){if(!land)await shot(id+'-landing');land=true;checkOnce(id+' landing closes canopy',!world.drivers.find(d=>d.seat===s.view.you).glider);}
    if(k.surface==='ice')ice=true;hits=Math.max(hits,k.terrainHits);
    // Steering follows the road using real left/right keys. Volcano holds at the
    // first vent until a complete warning/eruption cycle and actual collision.
    let lane=0,goal=Infinity;
    if(id==='volcano'&&k.dist>130){lane=-2;goal=170;}
    const look=Math.max(6,Math.min(16,7+k.speed*.3)),q=T.at(t,k.dist+look,lane),diff=Math.atan2(Math.sin(Math.atan2(q.x-k.x,q.z-k.z)-k.yaw),Math.cos(Math.atan2(q.x-k.x,q.z-k.z)-k.yaw));
    let want=[];const remain=goal-k.dist;
    if(remain>Math.max(1,k.speed*k.speed/65))want.push('ArrowUp');else if(k.speed>1)want.push('ArrowDown');
    if(diff>.055)want.push('ArrowLeft');if(diff<-.055)want.push('ArrowRight');
    // One glider uses real brake input in air; remaining tracks retain full glide.
    if(k.air&&k.airTime>.7&&((id==='city'&&k.airTime<1.1)||(id==='snow'&&k.speed>10))){want=want.filter(x=>x!=='ArrowUp');want.push('ArrowDown');brakeDone=true;}
    await keys(want);
    if(land&&k.dist>210&&(id!=='snow'||ice))break;
    if(id==='volcano'&&land&&hits&&phases.size===3){await shot(id+'-eruption');break;}
    await sleep(35);
   }
   await keys([]);check(id+' real driving launches and lands',air&&land&&!!frame);check(id+' surface mechanisms are rendered',seen.size>=2);
   if(id==='snow')check('snow real driving enters ice patch',ice);
   if(id==='city')check('city real brake input while gliding',brakeDone);
   if(id==='volcano'){check('volcano warning, eruption and cooldown visible',phases.size===3);check('volcano actual vent contact causes hit',hits>0);}
   report[id]={airSample,last,seen:[...seen],phases:[...phases],hits,ice};
   await p.activate('#leave');await wait('window.__kart.state.mode==="title"','leave');check(id+' leaving clears race',!(await p.evaluate('window.__kart.state')).view);
  }
  check('no runtime exceptions',!report.errors.length);report.ok=true;
 }catch(e){report.ok=false;report.failure=e.stack;console.error(e.stack);if(p)await shot('failure').catch(()=>{});process.exitCode=1;}
 finally{p?.close();try{process.kill(-child.pid,'SIGTERM');}catch{}for(let i=0;i<30&&child.exitCode===null;i++)await sleep(100);if(child.exitCode===null)try{process.kill(-child.pid,'SIGKILL');}catch{}await sleep(200);let alive=true;try{process.kill(child.pid,0);}catch{alive=false;}report.ownedProcessExited=!alive;if(alive){report.ok=false;process.exitCode=1;}else fs.rmSync(profile,{recursive:true,force:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('REPORT',out);}
 function checkOnce(label,value){if(!report.checks.includes(label))check(label,value);}
})().then(()=>process.exit(process.exitCode||0));
