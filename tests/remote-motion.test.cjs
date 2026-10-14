'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{create}=require('../game/remote-motion.cjs');
const view=(t,x,extra={})=>({you:1,raceNo:1,race:{t,trackId:'cheese',phase:'racing',karts:[{seat:0,x,y:0,z:0,yaw:Math.PI/2,speed:20,steer:0},{seat:1,x:100,y:0,z:0,yaw:0,speed:20,steer:0}],...extra}});
test('same simulation history renders identically under regular and batched arrivals',()=>{
 const a=create(),b=create();for(let t=0;t<=400;t+=50){a.push(view(t,t*.02),1000+t);b.push(view(t,t*.02),1000+Math.ceil(t/180)*180);}
 for(let now=1400;now<1600;now+=16)assert.deepEqual(a.sample(now),b.sample(now));
});
test('remote movement is continuous through a 180ms delivery gap',()=>{
 const r=create();for(let t=0;t<=300;t+=50)r.push(view(t,t*.02),1000+t);
 let x=r.sample(1300)[0].x;for(let now=1316;now<=1490;now+=16){const y=r.sample(now)[0].x;assert(Math.abs(y-x-.32)<1e-9);x=y;}
});
test('projection is bounded; prolonged missing traffic stops drifting',()=>{
 const r=create();r.push(view(0,0),1000);r.push(view(50,1),1050);assert.equal(r.sample(5000)[0].x,3);assert.equal(r.sample(6000)[0].x,3);
});
test('local kart and authoritative objects are never modified',()=>{
 const r=create(),v=view(50,1),before=structuredClone(v);r.push(v,1000);const s=r.sample(1100);assert.deepEqual(s.map(k=>k.seat),[0]);s[0].x=99;assert.deepEqual(v,before);assert.equal(r.sample(1100)[0].x,1);
});
test('race, track, phase, seat and leave reset stale motion',()=>{
 for(const change of [v=>v.raceNo++,v=>v.race.trackId='yarn',v=>v.race.phase='results',v=>v.you=2]){const r=create();r.push(view(0,0),1000);r.push(view(50,1),1050);const v=view(0,30);change(v);r.push(v,1060);assert.equal(r.sample(1100)[0].x,30);}
 const r=create();r.push(view(0,0),1000);r.push({race:null},1010);assert.deepEqual(r.sample(1020),[]);r.push(view(0,0),1000);r.reset();assert.deepEqual(r.sample(1020),[]);
});
test('duplicate clocks ignored; suspension rebases without a huge projection',()=>{
 const r=create();r.push(view(50,1),1050);r.push(view(50,100),1100);assert.equal(r.sample(1100)[0].x,1);r.push(view(100,2),4000);assert.equal(r.sample(4000)[0].x,2);
});
test('teleports snap and yaw crosses the shortest arc',()=>{
 const r=create();r.push(view(0,0),1000);r.push(view(50,100),1050);assert.equal(r.sample(1175)[0].x,100);
 const q=create(),a=view(0,0),b=view(50,1);a.race.karts[0].yaw=Math.PI-.1;b.race.karts[0].yaw=-Math.PI+.1;q.push(a,1000);q.push(b,1050);assert(Math.abs(q.sample(1175)[0].yaw-Math.PI)<1e-9);
});
