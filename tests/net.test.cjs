'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const N=require('../game/net.js'),Solo=require('../game/solo.js'),S=require('../game/sim.cjs');
// In-memory room that mimics the host's pet.sessions room contract (players 3-4):
// the host addresses guests with `to` (required once there are several), host events
// carry `from`, peer_joined/peer_left announce seats, guests only ever see the host.
function room({latency=15,maxPlayers=4}={}){
  const uuid=()=>crypto.randomUUID();
  const mk=role=>({role,events:[],cursor:0,waiter:null,assets:new Map(),open:true,joined:false,peerId:uuid()});
  const host=mk('host'),guests=[];let epoch=1;
  const push=(side,e)=>{side.events.push({cursor:++side.cursor,...e});side.waiter?.();};
  const live=()=>guests.filter(g=>g.open);
  const both=g=>host.joined&&g.joined&&g.open;
  function connect(g){if(both(g)){push(host,{type:'peer_joined',from:g.peerId});push(host,{type:'connected',from:g.peerId,epoch:1});push(g,{type:'connected',epoch:1});}}
  const targets=to=>{if(to===undefined){if(live().length!==1)throw Error('invalid_request');return live();}if(to==='*')return live().filter(both);const g=live().find(x=>x.peerId===to);if(!g)throw Error('invalid_request');return [g];};
  // sdk-surface: sessions.poll maxCallsPerMinute 1800 (~30/s) per work caller.
  // The real gate (demo/core/plugin-runtime/sdk-gate.js) counts 1800 polls per sliding minute,
  // not 30 per second: the per-second model failed the sped-up mid-race test at random.
  const poll=me=>async({cursor=0,waitMs=0})=>{const t=Date.now();me.polls=(me.polls||[]).filter(x=>t-x<60000);if(me.polls.length>=1800){me.pollQuota=(me.pollQuota||0)+1;throw Error('quota_exceeded');}me.polls.push(t);if(me.cursor<=cursor&&waitMs&&(me===host?host.open:me.open))await new Promise(r=>{const t=setTimeout(r,waitMs);me.waiter=()=>{clearTimeout(t);me.waiter=null;r();};});
    const state=me===host?(!host.open?'closed':live().some(both)?'connected':'waiting'):(!me.open?'closed':both(me)?'connected':'waiting');
    return {cursor:me.cursor,events:me.events.filter(e=>e.cursor>cursor),transportState:state,epoch};};
  const ctx=(me,extra)=>({invitationId:'00000000-0000-4000-8000-000000000001',artifactHash:'a'.repeat(64),protocol:{id:'pet-kart',version:2},role:me.role,peer:{sessionPeerId:guests[0]?.peerId||uuid(),displayName:'peer'},expiresAt:Date.now()+1e6,maxPlayers,...extra});
  const hostSdk={
    getContext:async()=>ctx(host,{peers:live().map(g=>({sessionPeerId:g.peerId,displayName:g.name,status:both(g)?'connected':'invited'}))}),
    join:async()=>{host.joined=true;live().forEach(connect);return {status:live().some(both)?'connected':'waiting',epoch:1,limits:{},peerStatus:'online'};},
    // The host SDK gate allows ~60 send calls per second per caller (sdk-surface maxCallsPerMinute 3600).
    send:async({to,...m})=>{if(!host.open)throw Error('session_closed');const t=Date.now();host.sends=(host.sends||[]).filter(x=>t-x<1000);if(host.sends.length>=60){host.quotaHits=(host.quotaHits||0)+1;throw Error('quota_exceeded');}host.sends.push(t);host.peak=Math.max(host.peak||0,host.sends.length);const list=targets(to);for(const g of list)setTimeout(()=>push(g,{type:'message',message:structuredClone(m)}),latency);return {status:'queued',seq:1};},
    // sdk-surface: sessions.transfer maxConcurrent 1 per work caller (all guests share it).
    transfer:async({to,...t})=>{if(host.transferring)throw Error('quota_exceeded');host.transferring=true;host.transfers=(host.transfers||0)+1;try{const list=targets(to);let first;for(const g of list){const id=uuid();first??=id;g.assets.set(id,{...t,transferId:id});setTimeout(()=>push(g,{type:'transfer',transferId:id,purpose:t.purpose}),latency);}await new Promise(r=>setTimeout(r,latency*2));return {transferId:first,sha256:'0'.repeat(64),byteLength:1};}finally{host.transferring=false;}},
    readTransfer:async({transferId})=>host.assets.get(transferId),
    poll:poll(host),
    leave:async()=>{host.open=false;for(const g of live()){g.open=false;push(g,{type:'closed',reason:'peer_left'});}push(host,{type:'closed',reason:'peer_left'});return {released:true,peerAcknowledged:true};},
  };
  function addGuest(name='guest'){
    const g=mk('guest');g.name=name;guests.push(g);
    if(live().length>maxPlayers-1)throw Error('room_full');
    const sdk={
      getContext:async()=>ctx(g,{}),
      join:async()=>{g.joined=true;connect(g);return {status:both(g)?'connected':'waiting',epoch:1,limits:{},peerStatus:'online'};},
      send:async({to,...m})=>{if(to!==undefined)throw Error('invalid_request');if(!g.open)throw Error('session_closed');if(JSON.stringify(m).length>60*1024)throw Error('invalid_request');setTimeout(()=>push(host,{type:'message',from:g.peerId,message:structuredClone(m)}),latency);return {status:'queued',seq:1};},
      transfer:async({to,...t})=>{g.transfers=(g.transfers||0)+1;const id=uuid();host.assets.set(id,{...t,transferId:id});setTimeout(()=>push(host,{type:'transfer',from:g.peerId,transferId:id,purpose:t.purpose}),latency);return {transferId:id,sha256:'0'.repeat(64),byteLength:1};},
      readTransfer:async({transferId})=>g.assets.get(transferId),
      poll:poll(g),
      leave:async()=>{g.open=false;push(host,{type:'peer_left',from:g.peerId,reason:'peer_left'});push(g,{type:'closed',reason:'peer_left'});return {released:true,peerAcknowledged:true};},
    };
    return sdk;
  }
  // resync_required only says messages may have been lost (e.g. a latest-lane delivery failed).
  const resync=()=>{for(const g of live()){push(host,{type:'resync_required',from:g.peerId,reason:'delivery_failed'});push(g,{type:'resync_required',reason:'delivery_failed'});}};
  // A reconnect: every link drops and comes back (new epoch + resync, as manager.js does).
  const bounce=()=>{epoch++;for(const g of live()){push(host,{type:'disconnected',from:g.peerId});push(host,{type:'connected',from:g.peerId,epoch});push(host,{type:'resync_required',from:g.peerId,reason:'connection_lost'});push(g,{type:'connected',epoch});push(g,{type:'resync_required',reason:'connection_lost'});}};
  return {host:hostSdk,addGuest,guests,resync,bounce,transfers:()=>[host.transfers||0,...guests.map(g=>g.transfers||0)],quotaHits:()=>(host.quotaHits||0)+(host.pollQuota||0)+guests.reduce((n,g)=>n+(g.pollQuota||0),0),peakSendsPerSecond:()=>host.peak||0};
}
const wait=async(fn,label,ms=8000)=>{const until=Date.now()+ms;while(Date.now()<until){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,20));}throw Error('timeout '+label);};
const P=(name,sig)=>({name,signature:sig,kind:'sprite',color:'#ff0000'});
const A=tag=>({kind:'sprite',image:'data:image/png;base64,'+tag});
// Every room a test opens is disposed afterwards, pass or fail (a failed wait used to leave the
// game timers running and the test process hanging).
const rooms=[];test.afterEach(()=>{for(const x of rooms.splice(0))x.dispose();});
async function lanRoom(names,{assets=false,warp=1}={}){
  const r=room(),views={},gotAssets={},errors=[],clients={},sdks={},t0=Date.now();
  // Host simulation may run on a sped-up clock so a whole race finishes in seconds of test time.
  const make=(key,sdk,now)=>N.create(sdk,{onView:v=>views[key]=v,onAsset:(seat,sig,a)=>(gotAssets[key]||=new Map()).set(sig,a),onError:e=>errors.push(key+':'+e.message),...(now?{now}:{})});
  clients.h=make('h',r.host,warp>1?()=>t0+(Date.now()-t0)*warp:null);await clients.h.start(P('房主','sig-h'),assets?A('HOST'):null);
  const add=async n=>{sdks[n]=r.addGuest(n);clients[n]=make(n,sdks[n]);await clients[n].start(P('客人'+n,'sig-'+n),assets?A(n.toUpperCase()):null);};
  for(const n of names)await add(n);
  const x={r,views,gotAssets,errors,clients,sdks,add,dispose(){Object.values(clients).forEach(c=>c.dispose());}};rooms.push(x);return x;
}
const humans=v=>v.players.filter(p=>!p.ai).map(p=>[p.seat,p.name]);

test('4 players: each guest gets its own seat, computer drivers only fill empty seats, assets reach everyone',async()=>{
  const x=await lanRoom(['b','c','d'],{assets:true});
  await wait(()=>['b','c','d'].every(n=>x.views[n]?.players.filter(p=>!p.ai).length===4),'all four humans seated');
  assert.deepEqual(humans(x.views.h),[[0,'房主'],[1,'客人b'],[2,'客人c'],[3,'客人d']]);
  assert.equal(x.views.h.players.length,4,'no computer driver once four humans are in');
  assert.deepEqual(['b','c','d'].map(n=>x.views[n].you),[1,2,3]);
  await wait(()=>['b','c','d'].every(n=>x.gotAssets[n]?.size===3)&&x.gotAssets.h?.size===3,'every client holds the other three drivers');
  assert.deepEqual([...x.gotAssets.c.keys()].sort(),['sig-b','sig-d','sig-h']);
  assert.equal(x.gotAssets.b.get('sig-d').image,'data:image/png;base64,D','host relays guest D avatar to guest B');
  for(const n of ['h','b','c'])x.clients[n].ready(true);
  await new Promise(r=>setTimeout(r,200));assert.equal(x.views.h.race,null,'one human not ready blocks the start');
  x.clients.d.ready(true);await wait(()=>x.views.c.race?.karts.length===4,'4-kart race reaches guests');
  x.clients.c.setInput({throttle:1,steer:0});
  await wait(()=>x.views.h.race.phase==='racing'&&x.views.h.race.karts.find(k=>k.seat===2).dist>15,'guest C drives seat 2',9000);
  const dist=s=>x.views.h.race.karts.find(k=>k.seat===s).dist;
  assert(dist(1)<15&&dist(3)<15&&dist(0)<15,'other karts not driven by C');
  assert.equal(x.r.quotaHits(),0,'three guests never hit the host send gate');
  assert(x.r.peakSendsPerSecond()<=50,'host view fan-out keeps headroom under ~60 sends/s: '+x.r.peakSendsPerSecond());
  assert.deepEqual(x.errors,[]);x.dispose();
});

test('message resyncs never re-send avatars (transfer budget is 60/min per work)',async()=>{
  const x=await lanRoom(['b','c'],{assets:true});
  await wait(()=>['b','c'].every(n=>x.gotAssets[n]?.size===2)&&x.gotAssets.h?.size===2,'avatars exchanged');
  await new Promise(r=>setTimeout(r,600));const before=x.r.transfers();
  for(let i=0;i<5;i++){x.r.resync();await new Promise(r=>setTimeout(r,300));}
  assert.deepEqual(x.r.transfers(),before,'no avatar re-sent after resync_required');
  assert.deepEqual(x.errors,[]);x.dispose();
});

test('2 humans: two computer drivers fill the grid to 4 karts in two rows',async()=>{
  const x=await lanRoom(['b']);
  await wait(()=>x.views.b?.players.length===4,'guest sees 2 humans + 2 computers');
  assert.deepEqual(x.views.b.players.map(p=>[p.seat,!!p.ai]),[[0,false],[1,false],[2,true],[3,true]]);
  assert.equal(new Set(x.views.b.players.map(p=>p.signature)).size,4,'distinct computer drivers');
  x.clients.h.ready(true);x.clients.b.ready(true);await wait(()=>x.views.b.race?.karts.length===4,'4-kart race');
  const karts=x.views.h.race.karts,key=k=>k.x.toFixed(1)+','+k.z.toFixed(1);
  assert.equal(new Set(karts.map(key)).size,4,'four distinct grid slots');
  const rows=new Set(karts.map(k=>Math.round(k.dist)));assert.equal(rows.size,2,'two grid rows');
  assert.deepEqual(x.errors,[]);x.dispose();
});

test('guest arriving mid-race spectates, then takes a computer seat at the results',async()=>{
  const x=await lanRoom(['b'],{warp:25});await wait(()=>x.views.b?.players.length===4,'lobby');
  x.clients.h.ready(true);x.clients.b.ready(true);await wait(()=>x.views.h.race?.phase==='racing','race started');
  await x.add('c');
  await wait(()=>x.views.c?.waiting===true,'late guest told to wait');
  assert.equal(x.views.c.race,null,'spectator gets no race it could drive in');
  assert.equal(x.views.h.race.karts.length,4,'running race untouched');
  assert(!x.views.h.players.some(p=>p.name==='客人c'),'not seated during the race');
  // Computer drivers finish on their own; the grace period then closes the race for idle humans.
  await wait(()=>x.views.h.race?.phase==='results','results',20000);
  await wait(()=>x.views.c?.waiting===false&&humans(x.views.c).some(([,n])=>n==='客人c'),'late guest seated at results');
  assert.equal(x.views.h.players.length,4,'still four karts: one computer replaced');
  assert.equal(x.views.h.players.filter(p=>p.ai).length,1);
  assert.deepEqual(x.errors,[]);x.dispose();
});

test('a guest leaving the lobby frees its seat for a computer; others keep playing; host leave ends everyone',async()=>{
  const x=await lanRoom(['b','c']);await wait(()=>x.views.h?.players.filter(p=>!p.ai).length===3,'three humans');
  await x.clients.b.leave();
  await wait(()=>!x.views.h.players.some(p=>p.name==='客人b')&&x.views.h.players.length===4,'seat 1 refilled by a computer');
  assert(!x.clients.h.diagnostics().closed,'room stays open');
  x.clients.h.ready(true);x.clients.c.ready(true);await wait(()=>x.views.c.race?.karts.length===4,'remaining guest still races');
  await x.clients.h.leave();await wait(()=>x.clients.c.diagnostics().closed,'host leave closes guests');
  assert.deepEqual(x.errors,[]);x.dispose();
});

test('host ignores malformed guest input and guests reject forged views',async()=>{
  const x=await lanRoom(['b']);await wait(()=>x.views.b?.players.length===4,'joined');
  const peerId=x.r.guests[0].peerId;
  await x.r.host.send({to:peerId,type:'kart.view',payload:{serial:1e9,view:{...x.views.b,race:{v:1,phase:'hack'}}},lane:'latest',key:'forged'});
  await wait(()=>x.errors.includes('b:invalid_view'),'forged view rejected');
  x.errors.length=0;
  await x.sdks.b.send({type:'kart.input',payload:{steer:'x',throttle:1,item:-5,readySeq:'no'},lane:'latest',key:'input'});
  await new Promise(r=>setTimeout(r,150));
  assert.equal(x.views.h.players.find(p=>p.seat===1).ready,false);assert.deepEqual(x.errors,[]);x.dispose();
});

test('race snapshots and views accept 4 seats and reject a fifth',()=>{
  const s=S.create({trackId:'cheese',seed:'four',seats:[0,1,2,3]});
  assert(S.validSnapshot(S.snapshot(s)));
  const five=S.snapshot(S.create({trackId:'cheese',seed:'five',seats:[0,1,2,3]}));five.karts.push({...five.karts[0],seat:4});
  assert(!S.validSnapshot(five));
});

test('solo room races against the computer',async()=>{
  let v=null;const s=Solo.create({onView:x=>v=x});await s.start(P('我','sig-me'));
  assert.equal(v.players.length,3);assert(v.players[1].ai&&v.players[2].ai);s.ready(true);
  await wait(()=>v.race?.phase==='countdown','countdown');s.setInput({throttle:1});
  await wait(()=>v.race.phase==='racing'&&v.race.karts[1].dist>10&&v.race.karts[0].dist>10,'both karts move',9000);s.dispose();
});
test('solo race has you + two computer drivers with distinct profiles',async()=>{
  let v=null;const s=Solo.create({onView:x=>v=x});await s.start(P('我','sig-me'));
  assert.equal(v.players.length,3);assert.deepEqual(v.players.map(p=>!!p.ai),[false,true,true]);
  assert.equal(new Set(v.players.map(p=>p.signature)).size,3);
  s.ready(true);await wait(()=>v.race?.karts.length===3,'three karts');s.dispose();
});

// Health check 2026-09-29 (vibe_contents/net-checkup, kart join-mid-race / avatar-before-hello /
// reconnect-avatars): the host relayed a guest's look only if that seat already showed the same
// signature, so a look that arrived before the hello, or from a guest who joined mid-race, was
// never relayed; and every reconnect re-sent the guest's look.
test('a late guest\'s look reaches the other guests once it is seated',async()=>{
  const x=await lanRoom(['b'],{assets:true,warp:25});await wait(()=>x.views.b?.players.length===4,'lobby');
  x.clients.h.ready(true);x.clients.b.ready(true);await wait(()=>x.views.h.race?.phase==='racing','race started');
  await x.add('c');
  await wait(()=>x.views.h.race?.phase==='results','results',20000);
  await wait(()=>x.views.c?.waiting===false,'late guest seated');
  await wait(()=>x.gotAssets.b?.has('sig-c'),'b receives c\'s look',8000);
  assert(x.gotAssets.c?.has('sig-b')&&x.gotAssets.c?.has('sig-h'),'c has everyone\'s look');
  assert.deepEqual(x.errors,[]);x.dispose();
});
test('a look that arrives before its owner\'s hello is kept and relayed',async()=>{
  const x=await lanRoom(['b'],{assets:true});
  await wait(()=>x.gotAssets.b?.has('sig-h')&&x.gotAssets.h?.has('sig-b'),'first two exchanged');
  // c's hello is held back 1.5 s, so its look reaches the host first.
  const sdk=x.r.addGuest('c'),send=sdk.send,t0=Date.now();
  sdk.send=async m=>m.type==='kart.hello'&&Date.now()-t0<1500?{status:'queued',seq:0}:send(m);
  x.sdks.c=sdk;x.clients.c=N.create(sdk,{onView:v=>x.views.c=v,onAsset:(seat,sig,a)=>(x.gotAssets.c||=new Map()).set(sig,a),onError:e=>x.errors.push('c:'+e.message)});
  await x.clients.c.start(P('客人c','sig-c'),A('C'));
  await wait(()=>x.gotAssets.b?.has('sig-c'),'b receives c\'s look after c\'s hello',8000);
  assert.deepEqual(x.errors,[]);x.dispose();
});
test('reconnects never re-send looks (the host bridge caps a session at 8 MB of transfers)',async()=>{
  const x=await lanRoom(['b','c'],{assets:true});
  await wait(()=>['b','c'].every(n=>x.gotAssets[n]?.size===2)&&x.gotAssets.h?.size===2,'looks exchanged');
  await new Promise(r=>setTimeout(r,600));const before=x.r.transfers();
  for(let i=0;i<8;i++){x.r.bounce();await new Promise(r=>setTimeout(r,250));}
  await new Promise(r=>setTimeout(r,800));
  assert.deepEqual(x.r.transfers(),before,'8 reconnects: no look sent again');
  x.dispose();
});
