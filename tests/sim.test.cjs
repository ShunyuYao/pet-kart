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
  const s=S.create({seed:3});S.start(s);run(s,3300);run(s,2500,{0:()=>({throttle:1})});
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
  assert(!S.validSnapshot({...snap,karts:[...snap.karts,{...snap.karts[0],seat:3}]}),'at most 3 karts / seats 0-2');
});
