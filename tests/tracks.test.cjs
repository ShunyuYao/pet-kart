'use strict';
// The three long tracks added in 0.5: longer, harder, each in its own style.
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../game/track.cjs'),S=require('../game/sim.cjs'),AI=require('../game/ai.cjs'),R=require('../game/room.cjs');
const OLD=['cheese','yarn'],NEW=['city','snow','volcano'];
const run=(state,ms,inputs)=>{for(let t=0;t<ms;t+=1000/60){if(inputs)for(const [seat,f] of Object.entries(inputs))S.setInput(state,Number(seat),f(state));S.step(state,1000/60);}return state;};
// Tightest corner: heading change across a 20 m chord.
function minRadius(t){let m=Infinity;for(let i=0;i<t.N;i++){const a=(i-10+t.N)%t.N,b=(i+10)%t.N;let d=Math.atan2(t.tx[b],t.tz[b])-Math.atan2(t.tx[a],t.tz[a]);d=Math.atan2(Math.sin(d),Math.cos(d));m=Math.min(m,20/Math.max(1e-6,Math.abs(d)));}return m;}
// Pairs of road samples that belong to different stretches of the lap (more than
// half a hairpin apart along the road) and how close they come on the map.
function closePairs(t,sepMin,dist){const out=[];for(let i=0;i<t.N;i+=2)for(let j=i+1;j<t.N;j+=2){const sep=Math.min(j-i,t.N-(j-i));if(sep<sepMin)continue;
  const d=Math.hypot(t.x[i]-t.x[j],t.z[i]-t.z[j]);if(d<dist)out.push({i,j,d,dy:Math.abs(t.y[i]-t.y[j]),cross:Math.abs(t.tx[i]*t.tx[j]+t.tz[i]*t.tz[j])});}return out;}
const bridge=p=>p.dy>=5&&p.cross<.5;

test('three new tracks follow the original two, in difficulty order',()=>{
  assert.deepEqual(T.ids,[...OLD,...NEW]);
  assert.deepEqual(T.ids.map(id=>T.build(id).level),[1,2,3,4,5]);
  for(const id of T.ids){const t=T.build(id);assert(t.name&&t.blurb,id+' has a name and blurb');assert.equal(typeof t.levelLabel,'string');}
});
test('new tracks are much longer than the old ones',()=>{
  const longestOld=Math.max(...OLD.map(id=>T.build(id).N));
  for(const id of NEW)assert(T.build(id).N>=1.6*longestOld,id+' length '+T.build(id).N);
  assert(T.build('volcano').N>T.build('snow').N&&T.build('snow').N>T.build('city').N,'longer as they get harder');
});
test('harder tracks: narrower road and real hairpins, still drivable',()=>{
  const oldWidth=Math.min(...OLD.map(id=>T.build(id).width)),oldR=Math.min(...OLD.map(id=>minRadius(T.build(id))));
  let prev=Infinity;
  for(const id of NEW){const t=T.build(id),r=minRadius(t);
    assert(t.width<oldWidth,id+' narrower');assert(t.width<=prev,id+' not wider than the easier track');prev=t.width;
    assert(r<oldR-8,id+' tightest corner '+r.toFixed(1)+' vs old '+oldR.toFixed(1));
    assert(r>=6,id+' corner still drivable '+r.toFixed(1));}
});
test('roads never run through each other; crossings are real bridges',()=>{
  for(const id of T.ids){const t=T.build(id);
    // No fence ever stands on another stretch of road (hairpin legs included)…
    for(const p of closePairs(t,2*(t.wall+t.half),t.wall+t.half+.5))assert(bridge(p),id+' fence on the road at '+p.i+'/'+p.j+' d='+p.d.toFixed(1));
    // …and stretches far apart along the lap keep a verge of their own between them.
    for(const p of closePairs(t,3*t.wall+20,2*t.wall+3))assert(bridge(p),id+' roads touch at '+p.i+'/'+p.j+' dy='+p.dy.toFixed(1));}
  // City and volcano fly over their own start straight just after the line.
  for(const id of ['city','volcano']){const t=T.build(id);
    assert(closePairs(t,25,t.wall).some(p=>bridge(p)&&(p.i<120||p.j<120)),id+' has a bridge over the start straight');}
});
test('harder tracks keep the fence closer to the road',()=>{
  const verge=id=>{const t=T.build(id);return t.wall-t.half;};
  assert(verge('city')<verge('cheese')&&verge('snow')<=verge('city')&&verge('volcano')<=verge('snow'),'verges '+T.ids.map(verge));
});
test('the inside fence of a tight corner never folds over itself',()=>{
  // Convention-free: a folded offset line runs backwards against the road direction.
  for(const id of T.ids){const t=T.build(id);
    for(let i=0;i<t.N;i++)for(const side of [-1,1]){
      const f=s=>T.fence(t,s,side),a=T.at(t,i-.5,side*f(i)),b=T.at(t,i+.5,side*f(i));
      assert((b.x-a.x)*t.tx[i]+(b.z-a.z)*t.tz[i]>0,id+' fence folds on side '+side+' at '+i+' (fence '+f(i).toFixed(1)+')');}}
});
test('mountain tracks climb high with drivable grades',()=>{
  for(const id of T.ids){const t=T.build(id);let g=0;for(let i=0;i<t.N;i++)g=Math.max(g,Math.abs(t.y[(i+5)%t.N]-t.y[i])/5);assert(g<=.16,id+' grade '+g.toFixed(3));}
  for(const id of ['snow','volcano']){const t=T.build(id);assert(Math.max(...t.y)-Math.min(...t.y)>=20,id+' climbs');}
  assert(Math.abs(T.build('snow').y[0])<.5&&Math.abs(T.build('volcano').y[0])<.5,'start lines are in the valley');
});
test('each track has its own look',()=>{
  const styles=T.ids.map(id=>T.build(id).theme.style),skies=T.ids.map(id=>T.build(id).theme.sky.join());
  assert.equal(new Set(styles).size,T.ids.length,'distinct scenery styles '+styles);
  assert.equal(new Set(skies).size,T.ids.length,'distinct skies');
  assert.equal(T.build('city').theme.night,true,'city is a night track');
});
// Drive straight from the start line (flat on every track), just off the road edge.
function offRoadSpeed(id){const t=T.build(id),p=T.at(t,2,t.half+1.2);
  const k={x:p.x,y:p.y,z:p.z,yaw:p.yaw,speed:0,slide:0,steer:0,idx:2,dist:2,lat:t.half+1.2,boost:0,spin:0,drift:0,driftDir:0,charge:0,off:1,wall:0,finishedAt:0};
  let top=0;for(let i=0;i<150;i++){S.stepKart(k,{steer:0,throttle:1,brake:0,drift:0,item:0},1/60,t);top=Math.max(top,k.speed);assert(k.off,id+' stays off-road');}return top;}
test('going off-road costs more on harder tracks',()=>{
  const v=Object.fromEntries(T.ids.map(id=>[id,offRoadSpeed(id)]));
  assert(v.city<v.cheese&&v.snow<v.city-1&&v.volcano<v.snow-1,'rougher verges on harder tracks '+JSON.stringify(v));
  assert(Math.abs(v.cheese-v.yarn)<.5,'old tracks unchanged');
});
test('snow is icy and volcanic gravel loose: the same steering turns a wider circle',()=>{
  const circle=id=>{const t=T.build(id),p=T.at(t,5,0),k={x:p.x,y:p.y,z:p.z,yaw:p.yaw,speed:20,slide:0,steer:0,idx:5,dist:5,lat:0,boost:0,spin:0,drift:0,driftDir:0,charge:0,off:0,wall:0,finishedAt:0};
    const y0=k.yaw;for(let i=0;i<30;i++){k.speed=20;S.stepKart(k,{steer:1,throttle:0,brake:0,drift:0,item:0},1/60,t);}return Math.abs(k.yaw-y0);};
  assert(circle('snow')<circle('cheese')*.9,'snow turns less: '+circle('snow').toFixed(3)+' vs '+circle('cheese').toFixed(3));
  assert(circle('volcano')<circle('cheese')&&circle('volcano')>circle('snow'),'volcanic gravel is loose, but not ice');
  assert(Math.abs(circle('city')-circle('cheese'))<1e-9,'city tarmac keeps full grip');
});
test('slopes: climbing slows, descending speeds up',()=>{
  const t=T.build('snow');let up=-1,down=-1;
  for(let i=0;i<t.N&&(up<0||down<0);i++){const g=(t.y[(i+30)%t.N]-t.y[i])/30;if(g>.08&&up<0)up=i;if(g<-.08&&down<0)down=i;}
  assert(up>=0&&down>=0,'snow has steep climbs and descents');
  const coast=s=>{const p=T.at(t,s,0),k={x:p.x,y:p.y,z:p.z,yaw:p.yaw,speed:20,slide:0,steer:0,idx:Math.round(s),dist:s,lat:0,boost:0,spin:0,drift:0,driftDir:0,charge:0,off:0,wall:0,finishedAt:0};
    for(let i=0;i<60;i++)S.stepKart(k,S.NEUTRAL,1/60,t);return k.speed;};
  const flat=(()=>{const c=T.build('cheese'),p=T.at(c,5,0),k={x:p.x,y:p.y,z:p.z,yaw:p.yaw,speed:20,slide:0,steer:0,idx:5,dist:5,lat:0,boost:0,spin:0,drift:0,driftDir:0,charge:0,off:0,wall:0,finishedAt:0};for(let i=0;i<60;i++)S.stepKart(k,S.NEUTRAL,1/60,c);return k.speed;})();
  const vu=coast(up),vd=coast(down);
  assert(vu<flat-.8,'uphill loses more speed '+vu+' vs '+flat);assert(vd>flat+.8,'downhill carries speed '+vd+' vs '+flat);
});
test('four karts line up on the road on every track',()=>{
  for(const id of T.ids){const s=S.create({trackId:id,seed:'grid',seats:[0,1,2,3]}),t=T.build(id);
    for(const k of s.karts)assert(Math.abs(k.lat)<=t.half-1,id+' kart on the road lat='+k.lat);
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const a=s.karts[i],b=s.karts[j];assert(Math.hypot(a.x-b.x,a.z-b.z)>=2*S.K.radius+.5,id+' grid slots overlap');}}
});
// CPU drivers are the yardstick for difficulty: the same drivers must lose speed on
// harder tracks, yet still get round cleanly (no pile-ups on walls, nobody stuck).
function cpuRace(id){
  const s=S.create({trackId:id,seed:'cpu-'+id,seats:[0,1,2,3]});S.start(s);const ai=[0,1,2,3].map(i=>AI.create({skill:.88+i*.03,seed:i+1}));
  const still=[0,0,0,0];let worst=0,guard=0,n=0,wall=0,speed=0;
  while(s.phase!=='results'&&guard++<60*600){for(const i of [0,1,2,3])S.setInput(s,i,ai[i](s,i));S.step(s,1000/60);
    if(s.phase==='racing')s.karts.forEach((k,i)=>{if(k.finishedAt)return;n++;wall+=k.wall;speed+=k.speed;still[i]=Math.abs(k.speed)<3?still[i]+1:0;worst=Math.max(worst,still[i]);});}
  return {s,worst,wall:wall/n,avg:speed/n};
}
test('four CPU drivers finish every new track without getting stuck, slower on harder tracks',()=>{
  const r=Object.fromEntries(T.ids.map(id=>[id,cpuRace(id)])),avg=T.ids.map(id=>r[id].avg.toFixed(1));
  for(const id of T.ids){const {s,worst,wall}=r[id];
    assert.equal(s.phase,'results',id+' race ends');
    assert(s.karts.filter(k=>k.finishedAt).length>=3,id+' at least three CPUs finish');
    assert(worst<60*4,id+' no CPU stuck for 4 s ('+(worst/60).toFixed(1)+' s)');
    assert(wall<.03,id+' CPUs rarely scrape walls ('+(wall*100).toFixed(1)+'%)');
    assert(S.validSnapshot(S.snapshot(s)),id+' snapshot valid');}
  const old=Math.min(r.cheese.avg,r.yarn.avg);
  assert(r.city.avg<old-1&&r.snow.avg<r.city.avg-.3&&r.volcano.avg<r.snow.avg-.3,'average CPU speed falls with difficulty '+avg);
});
test('the room host can pick any new track and guests accept its views',()=>{
  const room=R.create({seed:'tracks'});room.join(0,{name:'A',signature:'s:a',kind:'toy',color:'#f00'});room.join(1,{name:'B',signature:'s:b',kind:'toy',color:'#0f0'});
  for(const id of NEW){room.setTrack(id);const v=room.view(1);assert.equal(v.trackId,id);assert(R.validView(v),id+' view valid');}
});

// Terrain contracts: protect against decorative-only hazards, repeated launch,
// ground hits while airborne, and host/guest vertical state divergence.
const E=require('../game/terrain.cjs');
function terrainKart(t,s,lat=0,speed=25){const k=S.create({trackId:t.id,seats:[0]}).karts[0],p=T.at(t,s,lat);return Object.assign(k,p,{dist:s,idx:Math.round(s),lat,speed});}
for(const id of T.ids)test(id+': driving over ramp launches once, lands, and can repeat next lap',()=>{
  const t=T.build(id),r=E.features(t).find(f=>f.kind==='ramp'),k=terrainKart(t,r.s+r.len-.4,r.lat);
  let launched=0,landed=false,maxHeight=0;
  for(let i=0;i<500;i++){const was=k.air;const p=T.at(t,k.dist+12,0),d=Math.atan2(Math.sin(Math.atan2(p.x-k.x,p.z-k.z)-k.yaw),Math.cos(Math.atan2(p.x-k.x,p.z-k.z)-k.yaw));S.stepKart(k,{...S.NEUTRAL,throttle:1,steer:Math.max(-1,Math.min(1,-d*2))},1/60,t);if(!was&&k.air)launched++;if(was&&!k.air)landed=true;maxHeight=Math.max(maxHeight,k.y-T.sampleY(t,k.dist));if(landed)break;}
  assert.equal(launched,1);assert(landed);assert(maxHeight>2);assert.equal(k.glide,0);assert(Number.isFinite(k.y));
  const next=terrainKart(t,r.s+r.len-.4+t.N,r.lat);S.stepKart(next,{...S.NEUTRAL,throttle:1},1/30,t);assert(next.air);
  for(const [speed,lat] of [[5,r.lat],[-25,r.lat],[25,t.half+1]]){const q=terrainKart(t,r.s+r.len-.2,lat,speed);S.stepKart(q,S.NEUTRAL,1/30,t);assert(!q.air,'slow/reverse/bypass');}
});
test('lava has safe, warning and active phases; snapshots use the same race clock',()=>{
  const t=T.build('volcano'),f=E.features(t).find(f=>f.kind==='lava');
  assert.equal(E.phase(f,0),'idle');assert.equal(E.phase(f,f.period-f.warning-f.active),'warning');assert.equal(E.phase(f,f.period-f.active),'active');
  const time=f.period-f.active+100,a=E.sample(t,f,time),b=E.sample(t,f,time);assert.deepEqual(a,b);
  for(const [clock,air,shouldHit] of [[0,0,false],[time,0,true],[time,1,false]]){const s=S.create({trackId:t.id,seats:[0]});s.phase='racing';s.t=clock;const k=terrainKart(t,f.s,f.lat,0);k.air=air;k.y+=air?15:0;k.vy=0;s.karts=[k];S.step(s,16);assert.equal(k.spin>0,shouldHit);}
});
test('ice changes grip only inside its patch, airborne bypasses it',()=>{
  const t=T.build('snow'),f=E.features(t).find(f=>f.kind==='ice');
  assert(E.surface(t,f.s,f.lat,false).grip<t.grip*.7);assert.equal(E.surface(t,f.s,t.half,false).grip,t.grip);assert.equal(E.surface(t,f.s,f.lat,true).grip,t.grip);
});
test('gliding brake descends faster; snapshots retain complete airborne state',()=>{
  const t=T.build('yarn'),a=terrainKart(t,100),b=structuredClone(a);for(const k of [a,b])Object.assign(k,{air:1,glide:1,vy:0,y:20,airTime:1});
  for(let i=0;i<30;i++){S.stepKart(a,{...S.NEUTRAL,throttle:1},1/60,t);S.stepKart(b,{...S.NEUTRAL,brake:1},1/60,t);}assert(b.y<a.y-1);
  const s=S.create({trackId:t.id,seats:[0]});s.karts=[a];const snap=S.snapshot(s);for(const field of ['air','glide','vy','airTime','launchDist','envTime'])assert.equal(typeof snap.karts[0][field],'number',field);assert(S.validSnapshot(snap));
  snap.karts[0].vy=Infinity;assert(!S.validSnapshot(snap));
});
test('airborne karts bypass ground pads and bananas; landing reward requires a stable approach',()=>{
 const t=T.build('cheese'),s=S.create({trackId:t.id,seats:[0]}),pad=t.pads[0],k=terrainKart(t,pad.s+1,pad.lat);Object.assign(k,{air:1,glide:1,y:15,vy:0,airTime:1});s.karts=[k];s.phase='racing';s.hazards=[{id:1,x:k.x,y:0,z:k.z,owner:2,armedAt:0,kind:'banana'}];S.step(s,16);assert.equal(k.boost,0);assert.equal(k.spin,0);assert.equal(s.hazards.length,1);
 for(const steer of [0,1]){const q=terrainKart(t,15);Object.assign(q,{air:1,glide:1,vy:-3,y:.01,airTime:2});S.stepKart(q,{...S.NEUTRAL,throttle:1,steer},1/60,t);assert.equal(q.air,0);assert.equal(q.boost>0,steer===0);}
});
test('airborne drift cannot charge; updraft provides lift and flight always ends',()=>{
 const t=T.build('yarn'),f=E.features(t).find(x=>x.kind==='wind'),a=terrainKart(t,f.s+2,0,0),b=terrainKart(t,f.s+2,t.half,0);
 for(const k of [a,b])Object.assign(k,{air:1,glide:1,vy:0,y:20,airTime:.3});
 for(let i=0;i<30;i++)for(const k of [a,b])S.stepKart(k,{...S.NEUTRAL,drift:1,steer:.8},1/60,t);
 assert(a.y>b.y+.5);assert.equal(a.charge,0);
 for(let i=0;i<600;i++)S.stepKart(a,S.NEUTRAL,1/60,t);assert.equal(a.air,0);
});
test('obstacles can be bypassed and do not repeatedly stun a stopped kart',()=>{
 for(const id of T.ids){const t=T.build(id),f=E.features(t).find(f=>f.r),time=f.kind==='lava'?f.period-f.active+100:0;
   for(const [lat,expect] of [[E.sample(t,f,time).lat,true],[t.half+1,false]]){const s=S.create({trackId:id,seats:[0]}),k=terrainKart(t,f.s,lat,0);s.karts=[k];s.phase='racing';s.t=time;S.step(s,16);assert.equal(k.spin>0,expect,id);if(expect){const hits=k.terrainHits;for(let i=0;i<40;i++)S.step(s,16);assert.equal(k.terrainHits,hits,id+' immunity');}}
 }
});
test('prediction and authority share crosswind movement, and a new race clears flight',()=>{
 const t=T.build('city'),f=E.features(t).find(f=>f.kind==='wind'),s=S.create({trackId:t.id,seats:[0]}),k=terrainKart(t,f.s+3,0,20);s.karts=[k];s.phase='racing';s.t=1500;const pred=structuredClone(k);
 S.setInput(s,0,{throttle:1});S.step(s,16);S.stepKart(pred,{...S.NEUTRAL,throttle:1},.016,t,true,1516);assert.equal(k.x,pred.x);assert.equal(k.z,pred.z);
 const clean=S.create({trackId:t.id,seats:[0]}).karts[0];assert.equal(clean.air,0);assert.equal(clean.glide,0);assert.equal(clean.takeoffs,0);
});
