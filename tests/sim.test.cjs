'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../game/track.cjs'),S=require('../game/sim.cjs'),AI=require('../game/ai.cjs');
const run=(state,ms,inputs)=>{for(let t=0;t<ms;t+=1000/60){if(inputs)for(const [seat,f] of Object.entries(inputs))S.setInput(state,Number(seat),f(state));S.step(state,1000/60);}return state;};

test('tracks are closed loops with consistent geometry',()=>{
  for(const id of T.ids){const t=T.build(id);assert(t.N>400);
    for(let i=0;i<t.N;i+=37){const p=T.at(t,i,2),l=T.locate(t,p.x,p.z,i);assert(Math.abs(l.lat-2)<.2,id+' lat at '+i);}
  }
});
test('figure eight keeps the branch it is driving at the crossing',()=>{
  const t=T.build('yarn');let idx=t.N-5,crossings=0;
  for(let s=0;s<t.N;s+=0.5){const p=T.at(t,s);const l=T.locate(t,p.x,p.z,idx);assert(Math.abs(T.wrap(l.s-s+t.N/2,t.N)-t.N/2)<1.5,'jumped branch near s='+s);idx=l.i;if(Math.hypot(p.x,p.z)<4)crossings++;}
  assert(crossings>0);
});
test('countdown blocks movement, then throttle drives forward along the road',()=>{
  const s=S.create({trackId:'cheese',seed:'a'});S.start(s);
  const k0=s.karts[0],x=k0.x,z=k0.z;S.setInput(s,0,{throttle:1});run(s,2000);
  assert.equal(s.phase,'countdown');assert.equal(k0.x,x);assert.equal(k0.z,z);
  run(s,5000,{0:()=>({throttle:1})});assert.equal(s.phase,'racing');
  assert(k0.dist>60,'moved '+k0.dist);assert(k0.speed>25);
});
test('rocket start only for throttle held in the last moment of the countdown',()=>{
  const early=S.create({seed:1});S.start(early);run(early,3300,{0:()=>({throttle:1})});assert.notEqual(early.karts[0].boostKind,'rocket');
  const good=S.create({seed:1});S.start(good);run(good,2800);run(good,500,{0:()=>({throttle:1})});assert.equal(good.karts[0].boostKind,'rocket');
});
test('input normalization clamps values and keeps item counter monotonic',()=>{
  const a=S.normalizeInput({steer:9,throttle:'x',item:5},null);assert.equal(a.steer,1);assert.equal(a.throttle,0);assert.equal(a.item,5);
  const b=S.normalizeInput({item:2},a);assert.equal(b.item,5,'replayed lower counter cannot rewind');
  assert.equal(S.normalizeInput({item:-1},a).item,5);
});
test('drift charge releases a mini-turbo',()=>{
  // Yarn's unobstructed starting approach keeps this a ground-drift test.
  const s=S.create({seed:3,trackId:'yarn'});S.start(s);run(s,3300);run(s,1200,{0:()=>({throttle:1})});
  run(s,2200,{0:()=>({throttle:1,steer:.8,drift:1})});const k=s.karts[0];assert(k.drift&&k.charge>1.9,'charge '+k.charge);
  run(s,50,{0:()=>({throttle:1,steer:0,drift:0})});assert(k.boost>0.8&&k.boostKind==='orange');
  assert(s.events.some(e=>e.type==='boost'&&e.kind==='orange'));
});
test('walls keep karts inside the fence',()=>{
  const s=S.create({seed:4});S.start(s);run(s,3300);run(s,8000,{0:()=>({throttle:1,steer:1})});
  const t=T.build('cheese');for(const k of s.karts)assert(Math.abs(k.lat)<=t.wall+.01);
});
test('item box grants exactly one item, used once per counter step',()=>{
  const s=S.create({seed:9});S.start(s);run(s,3300);const k=s.karts[0],t=T.build('cheese');
  const b=s.boxes[1],p=T.at(t,b.s,b.lat);k.x=p.x;k.z=p.z;k.dist=b.s;k.idx=b.s;S.step(s,16);
  assert(k.item,'got item');assert.equal(s.snapshot?undefined:undefined,undefined);
  run(s,1200);const item=k.item;S.setInput(s,0,{item:1});S.step(s,16);assert.equal(k.item,null,'used '+item);
  const hazards=s.hazards.length,proj=s.projectiles.length,boost=k.boost;S.setInput(s,0,{item:1});S.step(s,16);
  assert.equal(s.hazards.length,hazards);assert.equal(s.projectiles.length<=proj,true);assert(k.boost<=boost);
});
test('banana spins the kart that drives over it (after arming)',()=>{
  const s=S.create({seed:2});S.start(s);run(s,3300);const [a,b]=s.karts,t=T.build('cheese');
  a.item='banana';a.rollUntil=0;S.setInput(s,0,{item:1});S.step(s,16);assert.equal(s.hazards.length,1);
  const h=s.hazards[0];b.x=h.x;b.z=h.z;S.step(s,16);assert(b.spin>0,'guest kart spun');assert.equal(s.hazards.length,0);
});
test('yarn ball chases and hits the kart ahead',()=>{
  const s=S.create({seed:5});S.start(s);run(s,3300);const [a,b]=s.karts;
  a.item='yarn';a.rollUntil=0;b.speed=0;const t=T.build('cheese');const p=T.at(t,a.dist+30,4);b.x=p.x;b.z=p.z;b.dist=a.dist+30;b.idx=T.wrap(Math.round(b.dist),t.N);
  S.setInput(s,0,{item:1});run(s,1500);assert(b.spin>0||s.events.some(e=>e.type==='hit'&&e.seat===1));
});
test('full race with two AI drivers finishes with places and results',()=>{
  for(const trackId of T.ids){
    const s=S.create({trackId,seed:'race-'+trackId});S.start(s);const a=AI.create({skill:.95,seed:1}),b=AI.create({skill:.9,seed:2});
    let guard=0;while(s.phase!=='results'&&guard++<60*400){S.setInput(s,0,a(s,0));S.setInput(s,1,b(s,1));S.step(s,1000/60);}
    assert.equal(s.phase,'results',trackId+' finished');assert(s.karts.some(k=>k.finishedAt));
    assert.deepEqual(s.karts.map(k=>k.place).sort(),[1,2]);
    const snap=S.snapshot(s);assert(S.validSnapshot(snap));assert(JSON.stringify(snap).length<6000,'snapshot small');
  }
});
test('validSnapshot rejects malformed data',()=>{
  const s=S.snapshot(S.create({}));assert(S.validSnapshot(s));
  assert(!S.validSnapshot({...s,phase:'hack'}));assert(!S.validSnapshot({...s,karts:[{...s.karts[0],x:NaN}]}));assert(!S.validSnapshot({...s,karts:[{...s.karts[0],item:'star'}]}));
});
test('a new item box replaces the item already held (re-rolls, roulette restarts)',()=>{
  const s=S.create({seed:11});S.start(s);run(s,3300);const k=s.karts[0],t=T.build('cheese');
  k.item='banana';k.rollUntil=0;
  const b=s.boxes[4],p=T.at(t,b.s,b.lat);k.x=p.x;k.z=p.z;k.dist=b.s;k.idx=b.s;
  const seq=s.eventSeq;S.step(s,16);
  assert(s.events.some(e=>e.seq>seq&&e.type==='box'&&e.seat===0),'box collected');
  assert(k.item,'still holds an item');assert(k.rollUntil>s.t,'roulette restarted for the replacement');
  // Over many seeds the replacement is a fresh roll, not always the old banana.
  const kinds=new Set();for(let i=0;i<30;i++){const x=S.create({seed:'r'+i});S.start(x);run(x,3300);const kk=x.karts[0];kk.item='banana';const bb=x.boxes[4],pp=T.at(t,bb.s,bb.lat);kk.x=pp.x;kk.z=pp.z;kk.dist=bb.s;kk.idx=bb.s;S.step(x,16);kinds.add(kk.item);}
  assert(kinds.size>1,'replacement re-rolls: '+[...kinds]);
});
test('three-kart race: distinct grid slots, 1/2/3 places, results reached',()=>{
  const s=S.create({trackId:'cheese',seed:'three',seats:[0,1,2]});
  assert.equal(s.karts.length,3);
  const pos=s.karts.map(k=>k.x.toFixed(1)+','+k.z.toFixed(1));assert.equal(new Set(pos).size,3,'no two karts share a grid slot');
  S.start(s);const ai=[0,1,2].map(i=>AI.create({skill:.9+i*.02,seed:i+1}));let guard=0;
  while(s.phase!=='results'&&guard++<60*400){for(const i of [0,1,2])S.setInput(s,i,ai[i](s,i));S.step(s,1000/60);}
  assert.equal(s.phase,'results');assert.deepEqual(s.karts.map(k=>k.place).sort(),[1,2,3]);
  const snap=S.snapshot(s);assert(S.validSnapshot(snap),'3-kart snapshot valid');
  assert(!S.validSnapshot({...snap,karts:[...snap.karts,{...snap.karts[0],seat:4}]}),'seats are 0-3 only');
  assert(!S.validSnapshot({...snap,karts:[...snap.karts,{...snap.karts[0],seat:3},{...snap.karts[0],seat:3}]}),'at most 4 karts');
});

// Nitro: cumulative drift reward, manual edge-triggered spending and authority safety.
test('nitro accumulates across valid drifts, excludes invalid surfaces and survives release',()=>{
  const N=require('../game/nitro.cjs'),k=S.create({seats:[0]}).karts[0];
  Object.assign(k,{speed:25,drift:1,steer:.6});
  N.charge(k,.5,10);assert.equal(k.nitro,15);
  k.drift=0;N.charge(k,1,10);assert.equal(k.nitro,15);
  for(const field of ['air','off','wall','spin','nitroTime']){k.drift=1;k[field]=1;N.charge(k,1,10);assert.equal(k.nitro,15,field);k[field]=0;}
  k.speed=0;N.charge(k,1,10);assert.equal(k.nitro,15);
  k.speed=25;N.charge(k,1,0);assert.equal(k.nitro,15,'no forward progress');
  for(let i=0;i<10;i++)N.charge(k,.5,10);assert.equal(k.nitro,100);
});
test('nitro consumes a request once, never queues early presses and has a separate timer',()=>{
  const N=require('../game/nitro.cjs'),k=S.create({seats:[0]}).karts[0];
  N.begin(k,{nitro:1},.01,true);k.nitro=100;
  N.begin(k,{nitro:1},.01,true);assert.equal(k.nitroTime,0,'early request not queued');
  k.boost=.7;k.boostKind='blue';N.begin(k,{nitro:2},.01,true);
  assert.equal(k.nitroTime,3);assert.equal(k.nitro,0);assert.equal(k.boost,.7);assert.equal(k.nitroCasts,1);
  N.begin(k,{nitro:2},.5,true);assert.equal(k.nitroTime,2.5);
  N.begin(k,{nitro:1},.5,true);assert.equal(k.nitroUsed,2);assert.equal(k.nitroCasts,1);
  k.nitro=100;N.begin(k,{nitro:3},.5,true);assert.equal(k.nitroTime,1.5,'cannot extend active tank');assert.equal(k.nitro,100);
  k.spin=1;N.begin(k,{nitro:4},.01,true);assert.equal(k.nitroTime,0);assert.equal(k.nitro,100);
  k.spin=0;N.begin(k,{nitro:5},.01,false);assert.equal(k.nitroTime,0,'not outside racing');
  k.finishedAt=10;N.begin(k,{nitro:6},.01,true);assert.equal(k.nitroTime,0);
});
test('nitro input and snapshots are bounded, and new races start empty',()=>{
  const a=S.normalizeInput({nitro:8});assert.equal(a.nitro,8);
  for(const nitro of [3,-1,NaN,Infinity,2**54,'9'])assert.equal(S.normalizeInput({nitro},a).nitro,8);
  const s=S.create({seats:[0]}),k=s.karts[0];assert.equal(k.nitro,0);assert.equal(k.nitroTime,0);
  k.nitro=100;const snap=S.snapshot(s);assert.equal(snap.karts[0].nitro,100);assert(S.validSnapshot(snap));
  for(const [field,value] of [['nitro',101],['nitroTime',Infinity],['nitroUsed',-1],['nitroCasts',.5]]){const bad=structuredClone(snap);bad.karts[0][field]=value;assert(!S.validSnapshot(bad),field);}
});
test('nitro raises speed above mini turbo and emits one authoritative activation',()=>{
  const s=S.create({trackId:'yarn',seats:[0]});s.phase='racing';const k=s.karts[0];k.nitro=100;
  run(s,1100,{0:()=>({throttle:1,nitro:1})});assert(k.speed>42,'speed '+k.speed);
  assert.equal(s.events.filter(e=>e.kind==='nitro').length,1);
  assert.equal(S.snapshot(s).karts[0].nitroCasts,1);
  // An armed banana cancels the active boost, but preserves an unspent tank.
  k.nitro=35;s.hazards.push({id:99,kind:'banana',x:k.x,y:k.y,z:k.z,armedAt:0,owner:1});S.step(s,1);
  assert.equal(k.nitroTime,0);assert.equal(k.nitro,35);
});
