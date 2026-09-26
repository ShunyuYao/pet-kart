// LAN session adapter over the host's `pet.sessions` bridge (HTML work, experimental).
// Host = seat 0 and runs the authoritative room; guest = seat 1 sends intents only.
// Limits honoured (demo/core/peer-session/contracts.js): latest lane ≤ 30 calls/s,
// ≤ 60 KB per message, ≤ 8 latest keys; transfers ≤ 1 MB each, one at a time.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./room.cjs'));else root.KartNet=factory(root.KartRoom);})(globalThis,function(R){
  'use strict';
  // The third racer in a LAN match is a computer driver simulated by the host.
  const LAN_CPU={name:'电脑 · 奶酪队长',signature:'builtin:cpu-cheddar',kind:'toy',color:'#6c7cff'};
  const PROTOCOL={id:'pet-kart',version:1},PURPOSE='kart.profile.v1',SEND_MS=50,SIM_MS=1000/60,STALE_MS=3000;
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const encode=value=>{const b=new TextEncoder().encode(JSON.stringify(value));let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
  const decode=value=>{if(typeof value!=='string'||value.length>1400000)throw Error('invalid_profile');return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0))));};
  function create(sdk,{onView=()=>{},onConnection=()=>{},onError=()=>{},onAsset=()=>{},now=()=>Date.now()}={}){
    let context=null,host=false,room=null,connection='waiting',closed=false,disposed=false,cursor=0,epoch=0;
    let profile=null,asset=null,sentSignature='',transferJob=null,lastHeard=0,lastHello=0,serial=0,applied=0;
    let input={steer:0,throttle:0,brake:0,drift:0,item:0},readySeq=0,readyWant=false,guestReadySeq=0,sending=false;
    const timers=[];
    const fail=e=>onError(e instanceof Error?e:Error(String(e)));
    const status=s=>{if(connection!==s){connection=s;onConnection(s);}};
    const send=(type,payload,key)=>closed||disposed?Promise.reject(Error('session_closed')):sdk.send({type,payload,lane:'latest',key});
    function end(reason='peer_left'){
      if(closed)return;closed=true;timers.forEach(clearInterval);status('closed');
      if(room){room.room.notice=reason;onView(room.view(0));}
    }
    async function upload(){
      // One transfer at a time; re-sent after a reconnect so the peer can redraw us.
      if(transferJob||!asset||connection!=='connected'||closed||sentSignature===profile.signature)return;
      const signature=profile.signature,payload=encode({v:1,signature,asset});
      if(payload.length>Math.ceil(1024*1024/3)*4){fail(Error('asset_too_large'));sentSignature=signature;return;}
      transferJob=sdk.transfer({purpose:PURPOSE,contentType:'application/octet-stream',dataBase64:payload})
        .then(()=>{sentSignature=signature;}).catch(fail).finally(()=>{transferJob=null;});
    }
    function hostTick(){
      // Fixed-step simulation driven by wall time (not rAF: must keep running when hidden).
      const t=now();hostTick.last??=t;// Catch up on real elapsed time even if timers were delayed (bounded to 2 s).
      let acc=Math.min(2000,t-hostTick.last);hostTick.last=t;
      const guest=room.seat(1);
      if(guest){const online=connection==='connected'&&t-lastHeard<STALE_MS;if(guest.connected!==online){guest.connected=online;if(!online)room.input(1,{steer:0,throttle:0,brake:0,drift:0});}}
      hostTick.acc=(hostTick.acc||0)+acc;while(hostTick.acc>=SIM_MS){room.tick(SIM_MS);hostTick.acc-=SIM_MS;}
    }
    async function publish(){
      onView(room.view(0));
      if(connection!=='connected'||sending||closed)return;sending=true;
      try{await send('kart.view',{serial:++serial,view:room.view(1)},'view');}catch(e){if(!/backpressure/.test(e.message))fail(e);}finally{sending=false;}
    }
    async function guestSend(){
      if(connection!=='connected'||sending||closed)return;sending=true;
      try{
        if(profile&&now()-lastHello>1000){lastHello=now();await send('kart.hello',{profile},'hello');}
        await send('kart.input',{...input,readySeq,ready:readyWant},'input');
      }catch(e){if(!/backpressure/.test(e.message))fail(e);}finally{sending=false;}
    }
    async function event(e){
      if(e.type==='closed'){end(e.reason||'peer_left');return;}
      if(e.type==='resync_required'){sentSignature='';return;}
      if(e.type==='transfer'&&e.purpose===PURPOSE){
        const data=await sdk.readTransfer({transferId:e.transferId});
        if(data.purpose!==PURPOSE||data.contentType!=='application/octet-stream')throw Error('invalid_profile');
        const value=decode(data.dataBase64);if(!value||value.v!==1||typeof value.signature!=='string')throw Error('invalid_profile');
        lastHeard=now();onAsset(host?1:0,value.signature,value.asset);return;
      }
      if(e.type!=='message')return;
      const {type,payload:p}=e.message;lastHeard=now();
      if(host){
        if(type==='kart.hello'){room.join(1,p?.profile);return;}
        if(type==='kart.input'&&p&&typeof p==='object'){
          if(!room.seat(1))return;
          room.input(1,p);
          if(Number.isSafeInteger(p.readySeq)&&p.readySeq>guestReadySeq){guestReadySeq=p.readySeq;try{room.ready(1,!!p.ready);}catch(err){fail(err);}}
        }
        return;
      }
      if(type!=='kart.view'||!p||!Number.isSafeInteger(p.serial)||p.serial<=applied)return;
      if(!R.validView(p.view)||p.view.you!==1)throw Error('invalid_view');
      applied=p.serial;onView(p.view);
    }
    async function poll(){
      while(!disposed&&!closed){
        try{
          const b=await sdk.poll({cursor,waitMs:1000});if(disposed||closed)break;
          if(b.transportState==='closed'){for(const e of b.events)if(e.type==='closed'){end(e.reason);break;}end();break;}
          if(b.epoch!==epoch){epoch=b.epoch;sentSignature='';}
          status(b.transportState);if(b.transportState==='connected'&&b.events.length)lastHeard=now();
          for(const e of b.events){try{await event(e);}catch(err){fail(err);}}cursor=b.cursor;
        }catch(e){if(/session_closed|caller_disposed|permission_denied|permission_revoked|account_changed/.test(e.message)){end(e.message);break;}status('reconnecting');fail(e);await pause(350);}
      }
    }
    async function start(localProfile,localAsset){
      if(context)throw Error('already_started');
      context=await sdk.getContext();if(!context)throw Error('no_invitation');
      if(context.protocol?.id!==PROTOCOL.id||context.protocol?.version!==PROTOCOL.version)throw Error('protocol_mismatch');
      host=context.role==='host';profile=R.validateProfile(localProfile);asset=localAsset||null;
      if(host){room=R.create({seed:context.invitationId});room.join(0,profile);room.join(2,LAN_CPU,{isAI:true});onView(room.view(0));}
      const joined=await sdk.join();epoch=joined.epoch;lastHeard=now();status(joined.status==='connected'?'connected':'waiting');void poll();
      if(host){timers.push(setInterval(()=>{try{hostTick();}catch(e){fail(e);}},SIM_MS));timers.push(setInterval(()=>void publish(),SEND_MS));}
      else timers.push(setInterval(()=>void guestSend(),SEND_MS));
      timers.push(setInterval(()=>void upload(),250));
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
      diagnostics:()=>({role:context?.role,connection,closed,serial,applied,profile:profile?.signature,sentSignature}),
    };
  }
  return {create,PROTOCOL,PURPOSE};
});
