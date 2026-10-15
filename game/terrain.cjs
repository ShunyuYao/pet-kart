// Race-clock terrain shared by physics and presentation. No wall clock or random
// draws here: a guest, a CPU and the host see the same moving obstacle.
'use strict';
const T=require('./track.cjs'),cache=new Map();
function features(track){
  if(cache.has(track.id))return cache.get(track.id);
  const ramp=(s,glide=false,lat=0)=>({kind:'ramp',s,len:10,w:track.width-3,lat,h:2.4,glide});
  const moving=(kind,s,extra={})=>({kind,s,lat:0,r:1.5,height:3,period:6000,warning:1400,active:1800,...extra});
  const wind=(s,lat=0)=>({kind:'wind',s,len:38,w:5,lat,lift:7});
  const list={
    cheese:[ramp(48),moving('cheese',155),ramp(track.N*.57),moving('cheese',track.N*.82,{period:7500})],
    yarn:[ramp(48,true),wind(72),moving('yarn',180,{period:7200}),ramp(track.N*.55,true),wind(track.N*.55+24),moving('yarn',track.N*.82)],
    city:[ramp(48,true),moving('gate',165,{period:7000}),{kind:'wind',s:track.N*.4,len:28,w:track.width,lat:0,lift:0},ramp(track.N*.62,true),moving('gate',track.N*.84,{period:5500})],
    snow:[ramp(48,true),{kind:'ice',s:135,len:28,w:6,lat:0},moving('iceblock',185,{lat:-2,r:1.3}),moving('snowball',track.N*.28),ramp(track.N*.66,true),wind(track.N*.66+24),{kind:'ice',s:track.N*.82,len:35,w:6,lat:1},moving('snowball',track.N*.9)],
    volcano:[ramp(48,true),wind(73),moving('lava',170,{lat:-2,r:2,height:11,period:6500}),moving('lava',235,{lat:2,r:2,height:11,period:7000}),ramp(track.N*.58,true),wind(track.N*.58+24),moving('lava',track.N*.78,{lat:0,r:2,height:11,period:5800})],
  }[track.id].map((f,i)=>({...f,s:Math.round(f.s),id:track.id+':'+i}));
  cache.set(track.id,list);return list;
}
const distance=(track,a,b)=>{let d=T.wrap(a-b,track.N);return d>track.N/2?d-track.N:d;};
function phase(f,time){if(f.kind!=='lava')return 'active';const p=T.wrap(time,f.period);return p<f.period-f.warning-f.active?'idle':p<f.period-f.active?'warning':'active';}
function sample(track,f,time){
  let lat=f.lat;
  if(['cheese','yarn','snowball','gate'].includes(f.kind))lat=Math.sin(time/f.period*Math.PI*2)*(track.half-1.6);
  const p=T.at(track,f.s,lat);return {...p,lat,phase:phase(f,time)};
}
function surface(track,s,lat,air){
  let height=0,grip=track.grip,kind='road';
  for(const f of features(track)){const d=distance(track,s,f.s);if(d<0||d>f.len||Math.abs(lat-f.lat)>f.w/2)continue;
    if(f.kind==='ramp')height=Math.max(height,f.h*d/f.len);
    if(!air&&f.kind==='ice'){grip*=.48;kind='ice';}
  }return {height,grip,kind};
}
function fly(k,inp,dt,track,previousDist,ground,racing){
  k.air??=0;k.glide??=0;k.vy??=0;k.airTime??=0;k.launchDist??=-1e6;
  if(!k.air&&racing&&k.speed>12&&k.spin<=0){for(const f of features(track)){
    if(f.kind!=='ramp'||Math.abs(k.lat-f.lat)>f.w/2)continue;
    const end=f.s+f.len,lap=Math.floor((k.dist-end)/track.N),cross=end+lap*track.N;
    if(previousDist<cross&&k.dist>=cross&&k.dist-previousDist<5&&Math.abs(cross-k.launchDist)>5){
      k.air=1;k.glide=f.glide?1:0;k.vy=f.glide?6.5:9;k.airTime=0;k.launchDist=cross;k.y=T.sampleY(track,cross)+f.h;k.takeoffs=(k.takeoffs||0)+1;k.drift=0;k.charge=0;break;
    }
  }}
  if(k.air){
    k.airTime+=dt;
    let lift=0;
    for(const f of features(track))if(f.kind==='wind'&&distance(track,k.dist,f.s)>=0&&distance(track,k.dist,f.s)<f.len&&Math.abs(k.lat-f.lat)<f.w/2&&k.glide&&k.airTime<2)lift=f.lift;
    k.vy+=((k.glide?-4.5:-19)+lift-(inp.brake?9:0))*dt;k.y+=k.vy*dt;
    // Flight is always finite, even if a driver circles in an updraft.
    if(k.airTime>4)k.vy=Math.min(k.vy,-10);
    if(k.y<=ground){k.y=ground;k.air=0;k.glide=0;k.vy=0;k.landings=(k.landings||0)+1;if(racing&&k.speed>14&&Math.abs(inp.steer)<.55&&k.spin<=0){k.boost=Math.max(k.boost,.65);k.boostKind='landing';k.landingBoosts=(k.landingBoosts||0)+1;}}
  }else k.y=ground;
}
function flow(k,dt,track,time){
  for(const f of features(track))if(f.kind==='wind'&&!f.lift){
    const d=distance(track,k.dist,f.s);if(d<0||d>f.len||Math.abs(k.lat-f.lat)>f.w/2)continue;
    const p=T.at(track,k.dist),[rx,rz]=T.rightOf(p.tx,p.tz),push=Math.sin(time/2000)*(k.air?4:1.2)*dt;k.x+=rx*push;k.z+=rz*push;
  }
}
function affect(state,k,dt,hit){
  const track=T.build(state.trackId);if(k.finishedAt)return;
  k.terrainCooldown=Math.max(0,(k.terrainCooldown||0)-dt);
  for(const f of features(track)){
    const p=sample(track,f,state.t);
    if(f.r&&p.phase==='active'&&!k.terrainCooldown&&Math.hypot(k.x-p.x,k.z-p.z)<f.r+1&&k.y<p.y+f.height&&k.y>p.y-2){
      hit(state,k,f.kind);k.terrainCooldown=1.8;k.terrainHits=(k.terrainHits||0)+1;
    }
  }
}
module.exports={features,distance,phase,sample,surface,fly,flow,affect};
