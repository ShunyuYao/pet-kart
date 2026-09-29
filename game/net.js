// LAN session adapter over the host's `pet.sessions` bridge (HTML work, experimental).
// Room of up to 4 (protocol v2): the host is seat 0 and runs the authoritative room;
// each guest (seats 1-3, in arrival order) sends intents only and talks to the host.
// The host addresses a guest with `to` and learns the sender from `from`; it relays
// every driver's avatar to the other guests (star topology, guests never connect).
// Limits honoured per guest session (demo/core/peer-session/contracts.js): latest lane
// ≤ 30 calls/s, ≤ 60 KB per message, ≤ 8 latest keys; transfers ≤ 1 MB, one at a time.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./room.cjs'));else root.KartNet=factory(root.KartRoom);})(globalThis,function(R){
  'use strict';
  // Computer drivers fill every empty seat so a LAN race always has four karts.
  const CPUS=[{name:'电脑 · 奶酪队长',signature:'builtin:cpu-cheddar',kind:'toy',color:'#6c7cff'},
    {name:'电脑 · 棉花教练',signature:'builtin:cpu-cotton',kind:'toy',color:'#22c55e'},
    {name:'电脑 · 布丁车手',signature:'builtin:cpu-pudding',kind:'toy',color:'#f59e0b'}];
  const PROTOCOL={id:'pet-kart',version:2},PURPOSE='kart.profile.v1',SEND_MS=50,SIM_MS=1000/60,STALE_MS=3000,GUEST_SEATS=[1,2,3];
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const encode=value=>{const b=new TextEncoder().encode(JSON.stringify(value));let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
  const decode=value=>{if(typeof value!=='string'||value.length>1400000)throw Error('invalid_profile');return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0))));};
  const MAX_PAYLOAD=Math.ceil(1024*1024/3)*4;
  function create(sdk,{onView=()=>{},onConnection=()=>{},onError=()=>{},onAsset=()=>{},now=()=>Date.now()}={}){
    let context=null,host=false,room=null,connection='waiting',closed=false,disposed=false,cursor=0,epoch=0;
    let profile=null,asset=null,lastHello=0,serial=0,applied=0,mySeat=null;
    let input={steer:0,throttle:0,brake:0,drift:0,item:0},readySeq=0,readyWant=false,sending=false;
    // host: sessionPeerId -> guest seat state; payloads: signature -> encoded avatar (for relay)
    const peers=new Map(),payloads=new Map();
    // guest: single upload channel to the host
    let sentSignature='',transferJob=null,lastHeard=0;
    const timers=[],recent=[];
    // Last session lifecycle events (never messages) for diagnostics.
    const note=e=>{if(e.type==='message')return;recent.push({t:Math.round(now()),type:e.type,reason:e.reason,from:e.from?String(e.from).slice(0,8):undefined});if(recent.length>30)recent.shift();};
    const fail=e=>{recent.push({t:Math.round(now()),type:'error',reason:e?.message||String(e)});if(recent.length>30)recent.shift();onError(e instanceof Error?e:Error(String(e)));};
    const status=s=>{if(connection!==s){connection=s;onConnection(s);}};
    const send=(type,payload,key,to)=>closed||disposed?Promise.reject(Error('session_closed')):sdk.send({...(to?{to}:{}),type,payload,lane:'latest',key});
    function end(reason='peer_left'){
      if(closed)return;closed=true;timers.forEach(clearInterval);status('closed');
      if(room){room.room.notice=reason;onView(room.view(0));}
    }
    let ownCache={signature:null,asset:null,data:null};
    function ownPayload(){
      if(!asset||!profile)return null;
      if(ownCache.signature===profile.signature&&ownCache.asset===asset)return ownCache.data;
      let data=encode({v:1,signature:profile.signature,asset});
      if(data.length>MAX_PAYLOAD){fail(Error('asset_too_large'));data=null;}
      ownCache={signature:profile.signature,asset,data};return data;
    }
    // ---------- guest ----------
    // Transfers are budgeted (60/min, one at a time per work): a transient refusal backs off quietly.
    const TRANSIENT=/backpressure|quota_exceeded|peer_offline|not_connected|invalid_request/;
    let uploadAfter=0;
    const retryLater=e=>{uploadAfter=now()+2000;if(!TRANSIENT.test(e.message))fail(e);};
    async function guestUpload(){
      if(transferJob||!asset||connection!=='connected'||closed||sentSignature===profile.signature||now()<uploadAfter)return;
      const signature=profile.signature,payload=ownPayload();if(!payload){sentSignature=signature;return;}
      transferJob=sdk.transfer({purpose:PURPOSE,contentType:'application/octet-stream',dataBase64:payload})
        .then(()=>{sentSignature=signature;}).catch(retryLater).finally(()=>{transferJob=null;});
    }
    async function guestSend(){
      if(connection!=='connected'||sending||closed)return;sending=true;
      try{
        if(profile&&now()-lastHello>1000){lastHello=now();await send('kart.hello',{profile},'hello');}
        await send('kart.input',{...input,readySeq,ready:readyWant},'input');
      }catch(e){if(!/backpressure/.test(e.message))fail(e);}finally{sending=false;}
    }
    // ---------- host ----------
    function peer(id){let p=peers.get(id);if(!p){p={id,seat:null,lastHeard:now(),readySeq:0,sent:new Set(),sending:false,online:true,signature:null,pending:null};peers.set(id,p);}return p;}
    // A guest's look is relayed once its hello has declared that signature as its own. It may
    // arrive before the hello, or from a guest waiting for the next race (its seat still shows
    // a computer driver): keep it until then (health check 2026-09-29, kart avatar-before-hello
    // and join-mid-race: those looks never reached the other guests).
    function acceptPending(p){
      const v=p.pending;if(!v||p.signature!==v.signature)return;p.pending=null;
      payloads.set(v.signature,v.data);for(const q of peers.values())if(q!==p)q.sent.delete(v.signature);
    }
    function freeSeat(){const taken=new Set([...peers.values()].map(p=>p.seat));return GUEST_SEATS.find(n=>!taken.has(n)&&!room.isHuman(n));}
    function drop(id){const p=peers.get(id);if(!p)return;peers.delete(id);if(p.seat!==null)room.depart(p.seat);}
    function hostTick(){
      // Fixed-step simulation driven by wall time (not rAF: must keep running when hidden).
      const t=now();hostTick.last??=t;// Catch up on real elapsed time even if timers were delayed (bounded to 2 s).
      const acc=Math.min(2000,t-hostTick.last);hostTick.last=t;
      for(const p of peers.values()){
        const s=p.seat===null?null:room.seat(p.seat);if(!s||s.ai||s.gone)continue;
        const online=p.online&&t-p.lastHeard<STALE_MS;
        if(s.connected!==online){s.connected=online;if(!online)room.input(p.seat,{steer:0,throttle:0,brake:0,drift:0});}
      }
      hostTick.acc=(hostTick.acc||0)+acc;while(hostTick.acc>=SIM_MS){room.tick(SIM_MS);hostTick.acc-=SIM_MS;}
    }
    async function publishTo(p){
      if(p.seat===null||p.sending||!p.online||closed)return;p.sending=true;
      try{await send('kart.view',{serial:++serial,view:room.view(p.seat)},'view',p.id);}
      catch(e){if(!/backpressure|quota_exceeded|invalid_request|peer_offline|not_connected/.test(e.message))fail(e);}
      finally{p.sending=false;}
    }
    // The host SDK gate allows ~60 send calls/s per work: with three guests each view tick
    // serves two of them in rotation (~13 Hz each, 40 calls/s total); guests interpolate.
    let rotation=0;
    function publish(){
      onView(room.view(0));
      const list=[...peers.values()].filter(p=>p.seat!==null&&p.online);if(!list.length)return;
      const count=Math.min(list.length,2);rotation=(rotation+count)%list.length;
      for(let i=0;i<count;i++)void publishTo(list[(rotation+i)%list.length]);
    }
    let uploading=false;
    function hostUpload(){
      // Each guest needs every other human driver's avatar: the host's own and the other guests'.
      // The host SDK runs one transfer per work at a time, so guests are served one after another.
      if(closed||uploading||now()<uploadAfter)return;
      const own=ownPayload();if(own)payloads.set(profile.signature,own);
      const current=new Set(room.room.players.filter(p=>!p.ai).map(p=>p.signature));
      for(const p of peers.values()){
        if(!p.online||p.seat===null)continue;
        const mine=room.seat(p.seat)?.signature;
        const next=[...current].find(sig=>sig!==mine&&!p.sent.has(sig)&&payloads.has(sig));if(!next)continue;
        uploading=true;
        sdk.transfer({to:p.id,purpose:PURPOSE,contentType:'application/octet-stream',dataBase64:payloads.get(next)})
          .then(()=>p.sent.add(next)).catch(retryLater).finally(()=>{uploading=false;});
        return;
      }
    }
    async function hostEvent(e){
      const from=e.from;
      if(e.type==='closed'){end(e.reason||'peer_left');return;}
      if(!from)return;
      if(e.type==='peer_left'){drop(from);return;}
      if(e.type==='disconnected'){const p=peers.get(from);if(p)p.online=false;return;}
      // A guest keeps received avatars across reconnects; resync_required is about messages only.
      if(e.type==='connected'||e.type==='peer_joined'||e.type==='resync_required'){const p=peer(from);p.online=true;p.lastHeard=now();return;}
      if(e.type==='transfer'&&e.purpose===PURPOSE){
        const data=await sdk.readTransfer({transferId:e.transferId});
        if(data.purpose!==PURPOSE||data.contentType!=='application/octet-stream')throw Error('invalid_profile');
        const value=decode(data.dataBase64);if(!value||value.v!==1||typeof value.signature!=='string')throw Error('invalid_profile');
        const p=peer(from);p.lastHeard=now();
        // Relay only what the guest declared as its own driver (its hello may come later).
        p.pending={signature:value.signature,data:data.dataBase64};acceptPending(p);
        onAsset(p.seat,value.signature,value.asset);return;
      }
      if(e.type!=='message')return;
      const {type,payload:v}=e.message,p=peer(from);p.lastHeard=now();p.online=true;
      if(type==='kart.hello'){
        let valid;try{valid=R.validateProfile(v?.profile);}catch{return;}
        if(p.seat===null){const n=freeSeat();if(n===undefined)return;p.seat=n;}
        p.signature=valid.signature;acceptPending(p);
        room.join(p.seat,valid);return;
      }
      if(type==='kart.input'&&v&&typeof v==='object'&&p.seat!==null){
        const s=room.seat(p.seat);if(!s||s.ai)return;
        room.input(p.seat,v);
        if(Number.isSafeInteger(v.readySeq)&&v.readySeq>p.readySeq){p.readySeq=v.readySeq;try{room.ready(p.seat,!!v.ready);}catch(err){fail(err);}}
      }
    }
    // ---------- both ----------
    async function guestEvent(e){
      if(e.type==='closed'){end(e.reason||'peer_left');return;}
      if(e.type==='resync_required')return;
      if(e.type==='transfer'&&e.purpose===PURPOSE){
        const data=await sdk.readTransfer({transferId:e.transferId});
        if(data.purpose!==PURPOSE||data.contentType!=='application/octet-stream')throw Error('invalid_profile');
        const value=decode(data.dataBase64);if(!value||value.v!==1||typeof value.signature!=='string')throw Error('invalid_profile');
        lastHeard=now();onAsset(null,value.signature,value.asset);return;
      }
      if(e.type!=='message')return;
      const {type,payload:p}=e.message;lastHeard=now();
      if(type!=='kart.view'||!p||!Number.isSafeInteger(p.serial)||p.serial<=applied)return;
      if(!R.validView(p.view)||!GUEST_SEATS.includes(p.view.you)||(mySeat!==null&&p.view.you!==mySeat))throw Error('invalid_view');
      mySeat=p.view.you;applied=p.serial;onView(p.view);
    }
    // sessions.poll is budgeted at ~30 calls/s per work. A host with several guests always has
    // fresh events, so pace the loop (≤ 20/s) and let each call return a batch.
    const POLL_GAP=50;
    async function poll(){
      let lastPoll=0;
      while(!disposed&&!closed){
        try{
          const wait=lastPoll+POLL_GAP-now();if(wait>0)await pause(wait);lastPoll=now();
          const b=await sdk.poll({cursor,waitMs:1000});if(disposed||closed)break;
          if(b.transportState==='closed'){for(const e of b.events)if(e.type==='closed'){end(e.reason);break;}end();break;}
          if(b.epoch!==epoch)epoch=b.epoch; // a reconnect: the host keeps looks it received, never resend (8 MB per session)
          status(b.transportState);if(b.transportState==='connected'&&b.events.length)lastHeard=now();
          for(const e of b.events){note(e);try{await(host?hostEvent(e):guestEvent(e));}catch(err){fail(err);}}cursor=b.cursor;
        }catch(e){if(/session_closed|caller_disposed|permission_denied|permission_revoked|account_changed/.test(e.message)){end(e.message);break;}status('reconnecting');fail(e);await pause(350);}
      }
    }
    async function start(localProfile,localAsset){
      if(context)throw Error('already_started');
      context=await sdk.getContext();if(!context)throw Error('no_invitation');
      if(context.protocol?.id!==PROTOCOL.id||context.protocol?.version!==PROTOCOL.version)throw Error('protocol_mismatch');
      host=context.role==='host';profile=R.validateProfile(localProfile);asset=localAsset||null;
      if(host){room=R.create({seed:context.invitationId,fill:CPUS});room.join(0,profile);onView(room.view(0));}
      const joined=await sdk.join();epoch=joined.epoch;lastHeard=now();status(joined.status==='connected'?'connected':'waiting');void poll();
      if(host){timers.push(setInterval(()=>{try{hostTick();}catch(e){fail(e);}},SIM_MS));timers.push(setInterval(publish,SEND_MS));timers.push(setInterval(hostUpload,250));}
      else{timers.push(setInterval(()=>void guestSend(),SEND_MS));timers.push(setInterval(()=>void guestUpload(),250));}
      return context;
    }
    return {
      start,
      role:()=>context?.role||null,
      // Host renders its own authoritative room every frame (views go out at 20 Hz).
      peek:()=>room?room.view(0):null,
      setProfile(p,a){profile=R.validateProfile(p);asset=a||null;sentSignature='';lastHello=0;if(room)room.join(0,profile);},
      setInput(v){input={steer:+v.steer||0,throttle:v.throttle?1:0,brake:v.brake?1:0,drift:v.drift?1:0,item:v.item|0};if(room)room.input(0,input);},
      ready(value){if(closed)throw Error('session_closed');if(room)room.ready(0,value);else{readySeq++;readyWant=!!value;lastHello=0;}},
      setTrack(id){if(!room)throw Error('host_only');room.setTrack(id);},
      async leave(){try{await sdk.leave();}finally{end('peer_left');}},
      dispose(){disposed=true;timers.forEach(clearInterval);},
      diagnostics:()=>({role:context?.role,connection,closed,serial,applied,seat:host?0:mySeat,peers:[...peers.values()].map(p=>({seat:p.seat,online:p.online,sent:p.sent.size})),profile:profile?.signature,sentSignature,recent:recent.slice()}),
    };
  }
  return {create,PROTOCOL,PURPOSE,CPUS};
});
