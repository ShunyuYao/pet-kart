'use strict';
// Real hidden Chromium, real built HTML, real CDP keyboard + file-chooser input.
// Character packs with realtime rag-doll data are local fixtures (not in this repo); set
// KART_DOLL_ZIP to override). Nothing is simulated through internal flags.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),REPO=path.resolve(ROOT,'../..');
const {connect}=require('./cdp.cjs');
const DOLL=process.env.KART_DOLL_ZIP||path.resolve(ROOT,'../rat-doll-lab/dist/rat-doll-female.zip');
const IMAGE=process.env.KART_IMAGE||path.resolve(ROOT,'../rat-doll-lab/dist/rat-doll-male/frames/idle/frame_00.png');
const out=path.join(ROOT,'artifacts/browser-e2e');fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[],screenshots:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const check=(ok,label,detail)=>{assert.ok(ok,label+(detail!==undefined?' '+JSON.stringify(detail):''));report.checks.push({label,detail});console.log('PASS',label);};
async function wait(p,expr,label,ms=20000){const until=Date.now()+ms;let last;while(Date.now()<until){last=await p.evaluate(expr).catch(e=>e.message);if(last)return last;await sleep(150);}throw Error('timeout: '+label+' last='+JSON.stringify(last));}
(async()=>{
  assert(fs.existsSync(DOLL),'3D doll pack missing: '+DOLL);assert(fs.existsSync(IMAGE),'image missing: '+IMAGE);
  const port=19000+Math.floor(Math.random()*900),profile=fs.mkdtempSync(path.join(os.tmpdir(),'pet-kart-e2e-'));
  const child=spawn(require(path.join(REPO,'demo/node_modules/electron')),[path.join(__dirname,'browser-shell.cjs'),'--remote-debugging-port='+port,'--use-mock-keychain','--mute-audio'],{detached:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'',KART_E2E_PROFILE:profile,KART_HTML:path.join(ROOT,'dist/桌宠赛车.html')}});
  let p;const shot=async n=>{report.screenshots.push(await p.screenshot(path.join(out,n+'.png')));};
  try{
    let t;for(let i=0;i<60&&!t;i++){try{t=(await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x=>x.type==='page'&&x.url.includes('.html'));}catch{}await sleep(250);}
    p=await connect(t);await p.send('Runtime.enable');
    p.on(m=>{if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
    await wait(p,'window.__kart?.state.driver?.kind','boot');
    const st=()=>p.evaluate('window.__kart.state'),w=()=>p.evaluate('window.__kart.world()');
    check(await p.evaluate('typeof window.pet==="undefined"'),'plain browser: no pet SDK injected');
    check((await st()).driver.kind==='toy','default driver is a built-in toy (no fake desktop pet)');
    // --- 2D import through the real file chooser ---
    await p.setFiles('#import-file',[IMAGE]);
    await wait(p,'window.__kart.state.driver.kind==="sprite"&&document.querySelector("#import-status").dataset.state==="ok"','2D import');
    await wait(p,'window.__kart.world().drivers.find(d=>d.seat===0)?.kind==="sprite"','2D avatar built');
    check(true,'2D image becomes a sprite driver in the 3D kart',(await w()).drivers);
    // --- 3D rag doll pack ---
    const t0=Date.now();await p.setFiles('#import-file',[DOLL]);
    await wait(p,'window.__kart.state.driver.kind==="doll3d"','3D import',60000);
    await wait(p,'window.__kart.world().drivers.find(d=>d.seat===0)?.kind==="doll3d"','3D avatar built (not the toy fallback)',30000);
    const packName=await (async()=>{const {execFileSync}=require('node:child_process');return JSON.parse(execFileSync('unzip',['-p',DOLL,'character.json'])).name;})();
    const d3=await st();check(d3.driver.name===[...packName].slice(0,16).join(''),'3D pack name read from character.json',{name:d3.driver.name,ms:Date.now()-t0});
    check(await p.evaluate('document.querySelector("#driver-kind").textContent.includes("3D")'),'card labels driver as 3D rag doll');
    const size=await p.evaluate('(async()=>{const r=indexedDB.open("pet-kart");await new Promise(x=>r.onsuccess=x);const g=r.result.transaction("drivers").objectStore("drivers").get("last");await new Promise(x=>g.onsuccess=x);return JSON.stringify(g.result.asset).length;})()');
    check(size<Math.ceil(1024*1024/3)*4*0.95,'3D asset fits one LAN transfer (≤1 MB base64)',{chars:size});
    await shot('01-title-3d-driver');
    // --- solo race with keyboard only ---
    await p.activate('#solo');await wait(p,'window.__kart.state.mode==="lobby"','lobby');
    await p.activate('[data-track="cheese"]');await p.activate('#ready');
    await wait(p,'window.__kart.state.view.race?.phase==="countdown"','countdown');await shot('02-countdown');
    check((await w()).drivers.find(d=>d.seat===0).kind==='doll3d','3D doll is our kart driver during race');
    await wait(p,'window.__kart.state.view.race.countdown<500','last moment of countdown',6000);
    await p.key('ArrowUp');
    await wait(p,'window.__kart.state.view.race.phase==="racing"','go');
    await sleep(2500);
    let me=(await st()).view.race.karts[0];check(me.dist>40&&me.speed>25,'holding ↑ drives forward along the road',{dist:me.dist,speed:me.speed});
    check((await st()).view.race.events.some(e=>e.type==='boost'&&e.kind==='rocket'&&e.seat===0),'throttle at "1" gives rocket start');
    await shot('03-racing-3d');
    // Baseline for the long tracks: draw calls and frame rate on the first track.
    const fps=async()=>{const a=await p.evaluate('window.__rafCount');await sleep(2000);return ((await p.evaluate('window.__rafCount'))-a)/2;};
    const base={calls:(await w()).calls,fps:await fps()};
    // steer left: yaw increases (right is −yaw).
    const y0=(await st()).view.race.karts[0].yaw;await p.key('ArrowLeft');await sleep(350);await p.key('ArrowLeft','keyUp');
    const y1=(await st()).view.race.karts[0].yaw;check(y1>y0+.1,'← steers left',{y0,y1});
    await p.key('ArrowRight');await sleep(350);await p.key('ArrowRight','keyUp');
    // item box: first row at 19% of the lap, drive the center line.
    await wait(p,'!!window.__kart.state.view.race.karts[0].item||window.__kart.state.view.race.karts[0].dist>220','reach item row',15000);
    me=(await st()).view.race.karts[0];
    if(me.item){await wait(p,'!window.__kart.state.view.race.karts[0].rolling','item roulette',3000);
      const item=(await st()).view.race.karts[0].item;await p.press('KeyE');await wait(p,'!window.__kart.state.view.race.karts[0].item','item used');
      check(true,'item picked from box and used with E',{item});}
    else report.checks.push({label:'item box missed on this line (not asserted)',detail:me});
    // drift: hold Space + → then release for a mini-turbo.
    await p.key('Space');await p.key('ArrowRight');await sleep(2300);await shot('04-drift');
    const drifting=(await st()).view.race.karts[0];await p.key('Space','keyUp');await p.key('ArrowRight','keyUp');await sleep(120);
    check(drifting.drift===1&&drifting.charge>.9,'Space+→ drifts and charges',{charge:drifting.charge});
    check((await st()).view.race.events.some(e=>e.type==='boost'&&['blue','orange'].includes(e.kind)&&e.seat===0),'releasing drift fires a mini-turbo');
    await p.key('ArrowUp','keyUp');
    await shot('05-hud');
    // Race ends (the two computer drivers finish, then the finish grace runs out).
    await wait(p,'window.__kart.state.view.race.phase==="results"','race over',160000);
    // 1) The podium ceremony plays first; the results panel stays hidden meanwhile.
    const c0=await wait(p,'(()=>{const c=window.__kart.world().ceremony;return c.active&&c.ready?c:null;})()','ceremony started',15000);
    check(await p.evaluate('window.__kart.state.mode==="ceremony"&&document.querySelector("#results-panel").hidden&&!document.querySelector("#ceremony-bar").hidden&&document.querySelector("#hud").hidden'),'race end starts the ceremony before any results panel');
    // 2) Three drivers, by final place; our 3D doll stands on its step, computers are toys.
    const places=(await st()).view.race.karts.map(k=>({seat:k.seat,place:k.place}));
    check(c0.actors.length===3&&[1,2,3].every(n=>c0.actors.some(a=>a.place===n)),'three drivers on the podium',c0.actors);
    for(const a of c0.actors)assert.equal(a.place,places.find(x=>x.seat===a.seat).place,'podium order matches race result');
    check(c0.actors.find(a=>a.seat===0).kind==='doll3d'&&c0.actors.filter(a=>a.seat!==0).every(a=>a.kind==='toy'),'own 3D doll and computer toys stand on the podium');
    await wait(p,'window.__kart.world().ceremony.t>1300','third place landed',6000);await shot('06a-ceremony-third');
    const mid=await wait(p,'(()=>{const c=window.__kart.world().ceremony;return c.t>4600?c:null;})()','champion landed',9000);await shot('06b-ceremony-champion');
    const y=n=>mid.actors.find(a=>a.place===n).y;
    check(mid.actors.every(a=>a.visible)&&y(1)>y(2)&&y(2)>y(3),'landed: champion highest, then 2nd, then 3rd',mid.actors);
    check(mid.trophy&&mid.confetti>0&&mid.fireworks>0,'trophy over the champion, live confetti and fireworks',{confetti:mid.confetti,fireworks:mid.fireworks});
    check(await p.evaluate('document.querySelector("#results-panel").hidden'),'results still hidden mid-ceremony');
    await wait(p,'window.__kart.world().ceremony.t>6300','orbit',6000);await shot('06c-ceremony-orbit');
    // 3) Results appear on their own after the show, with no input.
    await wait(p,'window.__kart.state.mode==="results"&&!document.querySelector("#results-panel").hidden','results after ceremony',8000);
    check((await w()).ceremony.t>=8200,'results panel appears automatically when the ceremony ends',(await w()).ceremony.t);await sleep(400);
    const res=await p.evaluate('[...document.querySelectorAll("#results-players .result-row")].map(r=>r.textContent)');
    check(res.length===3&&res.filter(r=>r.includes('电脑')).length===2&&res[2].includes('🥉'),'results list all three drivers with medals',res);await shot('06-results');
    await p.activate('[data-next-track="yarn"]');await p.activate('#again');
    await wait(p,'window.__kart.state.view.race?.phase==="countdown"&&window.__kart.state.view.race.trackId==="yarn"','rematch on figure-eight',8000);
    check(!(await w()).ceremony.active,'rematch clears the previous ceremony');
    check((await st()).view.race.karts.length===3,'every race has three karts');
    await sleep(3600);await p.key('ArrowUp');await sleep(4000);await shot('07-yarn');await p.key('ArrowUp','keyUp');
    check((await st()).view.race.karts[0].dist>50,'rematch drives on the second track');
    // 4) Skip: the ceremony can be skipped straight to the results with the keyboard.
    await wait(p,'window.__kart.state.view.race.phase==="results"','second race over',160000);
    await wait(p,'(()=>{const c=window.__kart.world().ceremony;return c.active&&c.ready&&c.t>500;})()','second ceremony running',15000);
    const tSkip=(await w()).ceremony.t,skipAt=Date.now();assert(tSkip<6000,'skip pressed early in the show: '+tSkip);
    await p.activate('#skip-ceremony');
    await wait(p,'window.__kart.state.mode==="results"&&!document.querySelector("#results-panel").hidden','skip goes to results',3000);
    check(Date.now()-skipAt<1500,"skip button jumps straight to the results",{pressedAtMs:tSkip,resultsAfterMs:Date.now()-skipAt});
    // back to title keeps the driver
    await p.activate('#leave');await wait(p,'window.__kart.state.mode==="title"','title again');
    check((await st()).driver.kind==='doll3d','leaving keeps chosen 3D driver');
    // --- the three long tracks: difficulty on the cards, and each one races and renders ---
    await p.activate('#solo');await wait(p,'window.__kart.state.mode==="lobby"','lobby for the long tracks');
    const cards=await p.evaluate('[...document.querySelectorAll("#track-list .track-card")].map(b=>({id:b.dataset.track,text:b.textContent}))');
    check(cards.map(c=>c.id).join()==='cheese,yarn,city,snow,volcano','five tracks, easiest first',cards.map(c=>c.id));
    check(cards.every((c,i)=>c.text.includes('★'.repeat(i+1)+'☆'.repeat(4-i))),'every card shows its difficulty in stars',cards.map(c=>c.text));
    check(['入门','简单','进阶','困难','极难'].every((l,i)=>cards[i].text.includes(l)),'difficulty labels 入门 → 极难');
    const km=cards.map(c=>Number(/(\d+\.\d) km/.exec(c.text)?.[1]));
    check(km.every(Number.isFinite)&&Math.min(...km.slice(2))>=1.6*Math.max(...km.slice(0,2)),'cards show the length; new tracks are much longer',km);
    for(const [n,id] of ['city','snow','volcano'].entries()){
      if(n){await p.activate('#solo');await wait(p,'window.__kart.state.mode==="lobby"','lobby again');}
      await p.activate(`[data-track="${id}"]`);await wait(p,`window.__kart.state.view.trackId==="${id}"`,'pick '+id);
      check(await p.evaluate(`document.querySelector('[data-track="${id}"]').getAttribute('aria-pressed')==='true'`),id+' card selected');
      await p.activate('#ready');await wait(p,'window.__kart.state.view.race?.phase==="countdown"',id+' countdown');
      check((await w()).track===id,id+' is the track on screen');
      await wait(p,'window.__kart.state.view.race.countdown<500',id+' last moment',6000);await p.key('ArrowUp');
      await wait(p,'window.__kart.state.view.race.phase==="racing"',id+' go');await sleep(3000);
      const me=(await st()).view.race.karts[0];check(me.dist>40,'holding ↑ drives forward on '+id,{dist:me.dist,speed:me.speed});
      const now={calls:(await w()).calls,fps:await fps()};await shot('08-'+id);await p.key('ArrowUp','keyUp');
      check(now.calls<=base.calls*1.6+120,id+' draw calls stay close to the first track',{base,now});
      check(now.fps>=Math.min(30,base.fps*.6),id+' frame rate holds up',{base,now});
      await p.activate('#leave');await wait(p,'window.__kart.state.mode==="title"','back to title from '+id);
    }
    check(report.errors.length===0,'no uncaught page exceptions',report.errors);
    report.ok=true;
  }catch(e){report.ok=false;report.failure=e.stack;console.error(e.stack);if(p)await shot('failure').catch(()=>{});process.exitCode=1;}
  finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));try{process.kill(-child.pid,'SIGKILL');}catch{}fs.rmSync(profile,{recursive:true,force:true});p?.close();}
})().then(()=>process.exit(process.exitCode||0));
