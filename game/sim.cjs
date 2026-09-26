// Authoritative race simulation. Pure data in, pure data out: no DOM, no Three.js.
// The host (or the solo driver) owns one race; guests only send intents and
// predict their own kart with `stepKart`, then converge to host snapshots.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./track.cjs'));else root.KartSim=factory(root.KartTrack);})(globalThis,function(T){
  'use strict';
  const K={max:30,accel:22,brake:40,reverse:9,coast:5,offMax:15,turn:2.05,driftTurn:1.25,driftExtra:.85,
    boostMax:40,boostAccel:48,spin:1.15,radius:1.25,itemRadius:2.3,hazardRadius:1.6,yarnSpeed:46,yarnLife:4.5,
    mini:[.9,1.9],miniBoost:[.7,1.25],mushroom:1.35,pad:.9,rocket:.9};
  const LAPS=3,COUNTDOWN=3200,FINISH_GRACE=20000,BOX_RESPAWN=3000,ROLL_MS=1100;
  const ITEMS=['mushroom','banana','yarn'];
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  function rng(state){let t=(state.seed=(state.seed+0x6D2B79F5)|0);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}
  function hashSeed(text){let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return h|0;}
  const NEUTRAL=Object.freeze({steer:0,throttle:0,brake:0,drift:0,item:0});
  function normalizeInput(v,prev){
    // Intents only. Counters are monotonic so a replayed or reordered packet cannot
    // fire an item twice; everything else is clamped to the legal range.
    if(!v||typeof v!=='object')return prev||{...NEUTRAL};
    const n=x=>Number.isFinite(x)?x:0;
    return {steer:clamp(Math.round(n(v.steer)*100)/100,-1,1),throttle:n(v.throttle)>0?1:0,brake:n(v.brake)>0?1:0,drift:n(v.drift)>0?1:0,
      item:Number.isSafeInteger(v.item)&&v.item>=0?Math.max(v.item,prev?.item||0):(prev?.item||0)};
  }
  function makeKart(track,seat,slot){
    // Grid: up to three karts side by side just behind the start line (s = 0),
    // so nobody starts directly behind (and rear-ends) another kart.
    const lane=[-5,5,0][slot],back=8+(slot>2?7:0)+(slot===2?1.5:0);
    const p=T.at(track,track.N-back,lane);
    return {seat,x:p.x,y:p.y,z:p.z,yaw:p.yaw,speed:0,slide:0,steer:0,idx:T.wrap(Math.round(track.N-back),track.N),lat:lane,
      dist:-back,lap:0,item:null,rollUntil:0,itemUsed:0,boost:0,boostKind:'',spin:0,drift:0,driftDir:0,charge:0,
      wall:0,off:0,finishedAt:0,place:0,rocket:0,throttleAt:-1};
  }
  function create({trackId='cheese',laps=LAPS,seed=1,seats=[0,1]}={}){
    const track=T.build(trackId);
    const state={v:1,trackId,laps,seed:hashSeed(seed),phase:'grid',t:0,countdown:COUNTDOWN,finishAt:0,
      karts:seats.map((seat,i)=>makeKart(track,seat,i)),inputs:{},boxes:[],hazards:[],projectiles:[],events:[],eventSeq:0,nextId:1};
    for(const s of track.boxes)for(const lat of [-5,0,5])state.boxes.push({s,lat,until:0});
    for(const k of state.karts)state.inputs[k.seat]={...NEUTRAL};
    return state;
  }
  function event(state,type,seat,extra){state.events.push({seq:++state.eventSeq,type,seat,t:state.t,...extra});if(state.events.length>24)state.events.shift();}
  function start(state){if(state.phase==='grid'){state.phase='countdown';state.countdown=COUNTDOWN;event(state,'countdown',-1);}}
  function setInput(state,seat,input){if(state.inputs[seat])state.inputs[seat]=normalizeInput(input,state.inputs[seat]);}
  // Single-kart physics used identically by host and guest prediction.
  function stepKart(k,input,dt,track,racing=true){
    const inp=racing&&!k.finishedAt?input:NEUTRAL;
    if(k.spin>0){k.spin=Math.max(0,k.spin-dt);k.speed*=Math.pow(.2,dt);k.drift=0;k.charge=0;}
    const control=k.spin<=0;
    k.boost=Math.max(0,k.boost-dt);
    let max=k.boost>0?K.boostMax:K.max;if(k.off&&!k.boost)max=K.offMax;
    // Steering responds quickly but not instantly, which also smooths network input.
    k.steer+=(clamp(inp.steer,-1,1)-k.steer)*Math.min(1,dt*12);
    if(control){
      if(inp.throttle&&!inp.brake)k.speed+=(k.boost>0?K.boostAccel:K.accel)*dt*(k.speed<max?1:0);
      else if(inp.brake){k.speed-=(k.speed>0?K.brake:K.accel*.6)*dt;k.speed=Math.max(k.speed,-K.reverse);}
      else k.speed-=Math.sign(k.speed)*Math.min(Math.abs(k.speed),K.coast*dt);
      if(k.boost>0&&k.speed<max)k.speed=Math.min(max,k.speed+K.boostAccel*dt);
    }
    if(k.speed>max)k.speed=Math.max(max,k.speed-(k.off?40:18)*dt);
    // Drift: hold drift while steering at speed. Charge grows; release fires a mini-turbo.
    if(control&&inp.drift&&k.speed>11&&(k.drift||Math.abs(inp.steer)>.3)){
      if(!k.drift){k.drift=1;k.driftDir=Math.sign(inp.steer);k.charge=0;}
      k.charge+=dt*(1+.6*Math.max(0,inp.steer*k.driftDir));
    }else if(k.drift){
      const lvl=k.charge>=K.mini[1]?2:k.charge>=K.mini[0]?1:0;
      if(lvl&&control){k.boost=Math.max(k.boost,K.miniBoost[lvl-1]);k.boostKind=lvl===2?'orange':'blue';k.miniFired=(k.miniFired||0)+1;}
      k.drift=0;k.charge=0;k.driftDir=0;
    }
    const speedFactor=clamp(Math.abs(k.speed)/9,0,1)*(1-.3*clamp(Math.abs(k.speed)/K.boostMax,0,1));
    let yawRate;
    if(k.drift)yawRate=k.driftDir*(K.driftTurn+K.driftExtra*k.steer*k.driftDir)*clamp(k.speed/14,0,1);
    else yawRate=k.steer*K.turn*speedFactor*Math.sign(k.speed||1);
    if(control)k.yaw-=yawRate*dt;
    // Lateral slide: outward during drift, gripped otherwise.
    const slideTarget=k.drift?-k.driftDir*k.speed*.16:0;
    k.slide+=(slideTarget-k.slide)*Math.min(1,dt*(k.drift?3:8));
    const fx=Math.sin(k.yaw),fz=Math.cos(k.yaw),[rx,rz]=T.rightOf(fx,fz);
    k.x+=(fx*k.speed+rx*k.slide)*dt;k.z+=(fz*k.speed+rz*k.slide)*dt;
    const loc=T.locate(track,k.x,k.z,k.idx);
    let delta=loc.s-(T.wrap(k.dist,track.N));
    if(delta>track.N/2)delta-=track.N;if(delta<-track.N/2)delta+=track.N;
    k.dist+=delta;k.idx=loc.i;k.lat=loc.lat;k.y=loc.y;
    k.off=Math.abs(loc.lat)>track.half?1:0;k.wall=0;
    if(Math.abs(loc.lat)>track.wall){
      // Barrier: put the kart back on the fence line and bleed speed.
      const p=T.at(track,loc.s,Math.sign(loc.lat)*track.wall);k.x=p.x;k.z=p.z;k.lat=Math.sign(loc.lat)*track.wall;
      // Scrape along the fence: nudge the nose back toward the road direction.
      let diff=p.yaw-k.yaw;diff=Math.atan2(Math.sin(diff),Math.cos(diff));if(Math.abs(diff)<Math.PI/2&&k.speed>0)k.yaw+=diff*Math.min(1,dt*4);k.speed*=Math.pow(.25,dt);k.slide*=.5;k.wall=1;
    }
    return k;
  }
  function place(state){
    const order=[...state.karts].sort((a,b)=>(a.finishedAt&&b.finishedAt)?a.finishedAt-b.finishedAt:a.finishedAt?-1:b.finishedAt?1:b.dist-a.dist);
    order.forEach((k,i)=>{k.place=i+1;});return order;
  }
  function rollItem(state,k){
    const order=place(state),last=k.place===order.length,lead=k.place===1&&order.length>1;
    const gap=lead?k.dist-order[1].dist:0,r=rng(state);
    if(last)return r<.5?'mushroom':r<.85?'yarn':'banana';
    if(lead&&gap>40)return r<.55?'banana':r<.85?'yarn':'mushroom';
    return ITEMS[Math.floor(r*3)];
  }
  function hit(state,k,cause){if(k.spin>0||k.finishedAt)return;k.spin=K.spin;k.speed*=.35;k.boost=0;k.drift=0;k.charge=0;event(state,'hit',k.seat,{cause});}
  function useItem(state,k){
    const track=T.build(state.trackId),item=k.item;if(!item)return;k.item=null;
    if(item==='mushroom'){k.boost=Math.max(k.boost,K.mushroom);k.boostKind='mushroom';event(state,'boost',k.seat,{kind:'mushroom'});}
    if(item==='banana'){const p=T.at(track,k.dist-3.2,clamp(k.lat,-track.wall,track.wall));state.hazards.push({id:state.nextId++,kind:'banana',x:p.x,y:p.y,z:p.z,s:T.wrap(k.dist-3.2,track.N),owner:k.seat,armedAt:state.t+350});event(state,'drop',k.seat,{kind:'banana'});}
    if(item==='yarn'){state.projectiles.push({id:state.nextId++,kind:'yarn',dist:k.dist+2.5,lat:clamp(k.lat,-track.half,track.half),owner:k.seat,born:state.t,x:k.x,y:k.y,z:k.z});event(state,'fire',k.seat,{kind:'yarn'});}
  }
  function step(state,dtMs){
    const track=T.build(state.trackId),dt=Math.min(.05,dtMs/1000);
    if(state.phase==='grid'||state.phase==='results')return state;
    if(state.phase==='countdown'){
      state.countdown-=dtMs;
      for(const k of state.karts){const inp=state.inputs[k.seat];if(inp.throttle&&k.throttleAt<0)k.throttleAt=state.countdown;if(!inp.throttle)k.throttleAt=-1;}
      if(state.countdown<=0){
        state.phase='racing';state.t=0;event(state,'go',-1);
        // Rocket start: throttle pressed during the last ~0.6 s of "1".
        for(const k of state.karts)if(k.throttleAt>=0&&k.throttleAt<=600){k.boost=K.rocket;k.boostKind='rocket';event(state,'boost',k.seat,{kind:'rocket'});}
      }
      return state;
    }
    state.t+=dtMs;
    for(const k of state.karts){
      const inp=state.inputs[k.seat],mini=k.miniFired||0;
      stepKart(k,inp,dt,track,state.phase==='racing');
      if((k.miniFired||0)!==mini)event(state,'boost',k.seat,{kind:k.boostKind});
      if(!k.finishedAt){
        const lap=Math.max(0,Math.floor(k.dist/track.N)+1);
        if(lap>k.lap&&k.lap>0)event(state,'lap',k.seat,{lap});
        k.lap=Math.max(k.lap,lap);
        if(k.dist>=state.laps*track.N){k.finishedAt=state.t;k.lap=state.laps;event(state,'finish',k.seat,{time:state.t});if(!state.finishAt)state.finishAt=state.t;}
      }
      // Items: an intent counter increment spends the held item once.
      if(inp.item>k.itemUsed){k.itemUsed=inp.item;if(k.item&&state.t>=k.rollUntil&&k.spin<=0)useItem(state,k);}
      // Boost pads.
      for(const p of track.pads){let d=T.wrap(k.dist,track.N)-p.s;if(d<0)d+=track.N;if(d<p.len&&Math.abs(k.lat-p.lat)<p.w/2&&k.boost<.3){k.boost=K.pad;k.boostKind='pad';event(state,'boost',k.seat,{kind:'pad'});}}
    }
    // Item boxes.
    for(const b of state.boxes){
      if(b.until>state.t)continue;const p=T.at(track,b.s,b.lat);
      for(const k of state.karts){if(Math.hypot(k.x-p.x,k.z-p.z)<K.itemRadius&&Math.abs(k.y-p.y)<2){b.until=state.t+BOX_RESPAWN;event(state,'box',k.seat,{});if(!k.finishedAt){k.item=rollItem(state,k);k.rollUntil=state.t+ROLL_MS;}break;}}
    }
    // Hazards.
    state.hazards=state.hazards.filter(h=>{for(const k of state.karts){if(state.t<h.armedAt&&k.seat===h.owner)continue;if(Math.hypot(k.x-h.x,k.z-h.z)<K.hazardRadius&&Math.abs(k.y-h.y)<2){hit(state,k,h.kind);return false;}}return true;});
    if(state.hazards.length>12)state.hazards.splice(0,state.hazards.length-12);
    // Yarn balls roll along the road and home in on the lane of the nearest kart ahead.
    state.projectiles=state.projectiles.filter(p=>{
      if(state.t-p.born>K.yarnLife*1000)return false;
      p.dist+=K.yarnSpeed*dt;
      const target=state.karts.filter(k=>k.seat!==p.owner||state.t-p.born>900).map(k=>({k,d:k.dist-p.dist})).filter(o=>o.d>-3&&o.d<45).sort((a,b)=>a.d-b.d)[0];
      if(target)p.lat+=clamp(target.k.lat-p.lat,-14*dt,14*dt);
      const pos=T.at(track,p.dist,p.lat);p.x=pos.x;p.y=pos.y;p.z=pos.z;
      for(const k of state.karts){if(k.seat===p.owner&&state.t-p.born<900)continue;if(Math.hypot(k.x-p.x,k.z-p.z)<K.hazardRadius+.4&&Math.abs(k.y-p.y)<2){hit(state,k,'yarn');return false;}}
      return true;
    });
    // Kart-to-kart bumps (skip when one is on the bridge above the other).
    for(let i=0;i<state.karts.length;i++)for(let j=i+1;j<state.karts.length;j++){
      const a=state.karts[i],b=state.karts[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
      if(d>0&&d<K.radius*2&&Math.abs(a.y-b.y)<2){
        const push=(K.radius*2-d)/2,nx=dx/d,nz=dz/d;a.x-=nx*push;a.z-=nz*push;b.x+=nx*push;b.z+=nz*push;
        const avg=(a.speed+b.speed)/2;a.speed=a.speed*.8+avg*.2;b.speed=b.speed*.8+avg*.2;
        if(!state.lastBump||state.t-state.lastBump>400){state.lastBump=state.t;event(state,'bump',-1,{});}
      }
    }
    place(state);
    if(state.phase==='racing'&&(state.karts.every(k=>k.finishedAt)||(state.finishAt&&state.t-state.finishAt>FINISH_GRACE))){state.phase='results';event(state,'results',-1);}
    return state;
  }
  const r2=v=>Math.round(v*100)/100,r3=v=>Math.round(v*1000)/1000;
  // Compact, JSON-safe view for the network and the renderer.
  function snapshot(state){
    return {v:1,trackId:state.trackId,laps:state.laps,phase:state.phase,t:Math.round(state.t),countdown:Math.round(state.countdown),finishAt:state.finishAt,
      karts:state.karts.map(k=>({seat:k.seat,x:r2(k.x),y:r2(k.y),z:r2(k.z),yaw:r3(k.yaw),speed:r2(k.speed),slide:r2(k.slide),steer:r2(k.steer),idx:k.idx,lat:r2(k.lat),dist:r2(k.dist),lap:k.lap,
        item:k.item,rolling:k.item&&state.t<k.rollUntil?1:0,boost:r2(k.boost),boostKind:k.boostKind,spin:r2(k.spin),drift:k.drift,driftDir:k.driftDir,charge:r2(k.charge),off:k.off,finishedAt:k.finishedAt,place:k.place,itemUsed:k.itemUsed})),
      boxes:state.boxes.map(b=>b.until>state.t?0:1),hazards:state.hazards.map(h=>({id:h.id,kind:h.kind,x:r2(h.x),y:r2(h.y),z:r2(h.z)})),
      projectiles:state.projectiles.map(p=>({id:p.id,kind:p.kind,x:r2(p.x),y:r2(p.y),z:r2(p.z)})),events:state.events.slice(-12)};
  }
  const PHASES=['grid','countdown','racing','results'];
  // Guests treat snapshots as untrusted data: validate shape before rendering.
  function validSnapshot(s){
    const num=Number.isFinite;
    return !!s&&s.v===1&&T.ids.includes(s.trackId)&&PHASES.includes(s.phase)&&num(s.t)&&num(s.countdown)&&Array.isArray(s.karts)&&s.karts.length<=3&&
      s.karts.every(k=>[0,1,2].includes(k.seat)&&['x','y','z','yaw','speed','dist'].every(f=>num(k[f]))&&(k.item===null||ITEMS.includes(k.item)))&&
      Array.isArray(s.boxes)&&s.boxes.length<=64&&Array.isArray(s.hazards)&&s.hazards.length<=16&&Array.isArray(s.projectiles)&&s.projectiles.length<=16&&Array.isArray(s.events)&&s.events.length<=24;
  }
  return {K,LAPS,ITEMS,COUNTDOWN,create,start,step,stepKart,setInput,normalizeInput,snapshot,validSnapshot,place,NEUTRAL};
});
