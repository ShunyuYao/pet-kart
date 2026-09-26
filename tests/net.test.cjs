'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const N=require('../game/net.js'),Solo=require('../game/solo.js');
// In-memory pair that mimics pet.sessions semantics: latest lane keeps only the
// newest value per key, poll long-waits, transfers are delivered as events.
function pair({latency=15}={}){
  const sides={host:{events:[],cursor:0,waiter:null,assets:new Map(),role:'host'},guest:{events:[],cursor:0,waiter:null,assets:new Map(),role:'guest'}};
  let open=true,joined={host:false,guest:false};
  const push=(side,e)=>{side.events.push({cursor:++side.cursor,...e});side.waiter?.();};
  const other=r=>r==='host'?sides.guest:sides.host;
  const make=role=>{const me=sides[role];let seq=0;return {
    getContext:async()=>({invitationId:'00000000-0000-4000-8000-000000000001',artifactHash:'a'.repeat(64),protocol:{id:'pet-kart',version:1},role,peer:{sessionPeerId:'00000000-0000-4000-8000-000000000002',displayName:'peer'},expiresAt:Date.now()+1e6}),
    join:async()=>{joined[role]=true;if(joined.host&&joined.guest){push(sides.host,{type:'connected'});push(sides.guest,{type:'connected'});}return {status:joined.host&&joined.guest?'connected':'waiting',epoch:1,limits:{},peerStatus:'online'};},
    send:async m=>{if(!open)throw Error('session_closed');if(JSON.stringify(m).length>60*1024)throw Error('invalid_request');const s=++seq;setTimeout(()=>push(other(role),{type:'message',seq:s,message:JSON.parse(JSON.stringify(m))}),latency);return {status:'queued',seq:s};},
    poll:async({cursor=0,waitMs=0})=>{if(me.cursor<=cursor&&waitMs&&open)await new Promise(r=>{const t=setTimeout(r,waitMs);me.waiter=()=>{clearTimeout(t);me.waiter=null;r();};});
      return {cursor:me.cursor,events:me.events.filter(e=>e.cursor>cursor),transportState:!open?'closed':joined.host&&joined.guest?'connected':'waiting',epoch:1};},
    transfer:async t=>{const id=crypto.randomUUID();other(role).assets.set(id,{...t,transferId:id});setTimeout(()=>push(other(role),{type:'transfer',transferId:id,purpose:t.purpose}),latency);return {transferId:id,sha256:'0'.repeat(64),byteLength:1};},
    readTransfer:async({transferId})=>me.assets.get(transferId),
    leave:async()=>{open=false;push(sides.host,{type:'closed',reason:'peer_left'});push(sides.guest,{type:'closed',reason:'peer_left'});return {released:true,peerAcknowledged:true};},
  };};
  return {host:make('host'),guest:make('guest')};
}
const wait=async(fn,label,ms=8000)=>{const until=Date.now()+ms;while(Date.now()<until){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,20));}throw Error('timeout '+label);};
const P=(name,sig)=>({name,signature:sig,kind:'sprite',color:'#ff0000'});

test('two players: lobby, track pick, ready, race with guest intents, assets exchanged',async()=>{
  const sdk=pair(),views={h:null,g:null},assets={h:[],g:[]},errors=[];
  const h=N.create(sdk.host,{onView:v=>views.h=v,onAsset:(seat,sig,a)=>assets.h.push([seat,sig,a]),onError:e=>errors.push(e.message)});
  const g=N.create(sdk.guest,{onView:v=>views.g=v,onAsset:(seat,sig,a)=>assets.g.push([seat,sig,a]),onError:e=>errors.push(e.message)});
  await h.start(P('房主','sig-h'),{kind:'sprite',image:'data:image/png;base64,AAAA'});
  await g.start(P('客人','sig-g'),{kind:'sprite',image:'data:image/png;base64,BBBB'});
  await wait(()=>views.g?.players.length===3,'guest sees both players + computer driver');
  assert.equal(views.g.you,1);assert.equal(views.g.players[1].name,'客人');
  await wait(()=>assets.h.length&&assets.g.length,'assets exchanged');
  assert.deepEqual(assets.h[0].slice(0,2),[1,'sig-g']);assert.deepEqual(assets.g[0].slice(0,2),[0,'sig-h']);
  h.setTrack('yarn');await wait(()=>views.g.trackId==='yarn','guest sees track');
  assert.throws(()=>g.setTrack('cheese'),/host_only/);
  h.ready(true);await wait(()=>views.g.players[0].ready,'host ready visible');
  assert.equal(views.g.race,null,'no race until both ready');
  g.ready(true);await wait(()=>views.g.race?.phase==='countdown','race starts');
  g.setInput({throttle:1,steer:0,item:0});
  await wait(()=>views.h.race?.phase==='racing'&&views.h.race.karts[1].dist>15,'guest kart driven by guest intent',9000);
  // The host never pressed throttle: its kart can only have been nudged by bumps, never driven like the guest's.
  const hk=views.h.race.karts.find(k=>k.seat===0),gk=views.h.race.karts.find(k=>k.seat===1);
  assert(hk.dist<gk.dist-10&&hk.dist<15,'host kart not driven by guest intents '+hk.dist+' vs '+gk.dist);
  await g.leave();await wait(()=>h.diagnostics().closed,'host sees close');
  assert.deepEqual(errors,[]);h.dispose();g.dispose();
});
test('host ignores malformed guest input and guest rejects forged views',async()=>{
  const sdk=pair(),errors=[];let gv=null;
  const h=N.create(sdk.host,{onError:e=>errors.push(e.message)});
  const g=N.create(sdk.guest,{onView:v=>gv=v,onError:e=>errors.push(e.message)});
  await h.start(P('A','sig-a'));await g.start(P('B','sig-b'));await wait(()=>gv?.players.length===3,'joined');
  await sdk.host.send({type:'kart.view',payload:{serial:1e9,view:{...gv,you:1,race:{v:1,phase:'hack'}}},lane:'latest',key:'forged'});
  await wait(()=>errors.includes('invalid_view'),'forged view rejected');
  await sdk.guest.send({type:'kart.input',payload:{steer:'x',throttle:1,item:-5,readySeq:'no'},lane:'latest',key:'input'});
  await new Promise(r=>setTimeout(r,120));
  assert.equal(gv.players[1].ready,false);h.dispose();g.dispose();
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
test('LAN race: two players + one host-simulated computer driver; guest accepts 3-kart views',async()=>{
  const sdk=pair(),views={h:null,g:null},errors=[];
  const h=N.create(sdk.host,{onView:x=>views.h=x,onError:e=>errors.push(e.message)}),g=N.create(sdk.guest,{onView:x=>views.g=x,onError:e=>errors.push(e.message)});
  await h.start(P('房主','sig-h'));await g.start(P('客人','sig-g'));
  await wait(()=>views.g?.players.length===3,'guest sees 3 drivers');
  assert.deepEqual(views.g.players.map(p=>[p.seat,!!p.ai]),[[0,false],[1,false],[2,true]]);
  h.ready(true);await new Promise(r=>setTimeout(r,200));assert.equal(views.g.race,null,'computer driver alone cannot start the race');
  g.ready(true);await wait(()=>views.g.race?.karts.length===3,'3-kart race reaches guest');
  assert.deepEqual(errors,[]);h.dispose();g.dispose();
});
