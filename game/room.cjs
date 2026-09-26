// Lobby + race lifecycle shared by solo and LAN host. Pure and authoritative:
// seats only express intents (ready, input); the room decides everything else.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./sim.cjs'),require('./track.cjs'),require('./ai.cjs'));else root.KartRoom=factory(root.KartSim,root.KartTrack,root.KartAI);})(globalThis,function(S,T,AI){
  'use strict';
  const KINDS=['sprite','doll3d','toy'];
  function validateProfile(p){
    if(!p||typeof p!=='object')throw Error('invalid_profile');
    const name=typeof p.name==='string'?[...p.name.replace(/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g,'')].slice(0,24).join('').trim():'';
    if(!name||typeof p.signature!=='string'||!/^[A-Za-z0-9:._-]{1,96}$/.test(p.signature)||!KINDS.includes(p.kind))throw Error('invalid_profile');
    const color=/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:'#ff7a59';
    return {name,signature:p.signature,kind:p.kind,color};
  }
  function create({seed='room',solo=false,now=()=>Date.now()}={}){
    const room={phase:'lobby',trackId:'cheese',laps:S.LAPS,raceNo:0,players:[],race:null,solo,notice:''};
    let ai=null;
    function seat(n){return room.players.find(p=>p.seat===n);}
    function join(n,profile,{isAI=false}={}){
      const p=validateProfile(profile);let s=seat(n);
      if(!s){s={seat:n,ready:false,connected:true,ai:isAI};room.players.push(s);room.players.sort((a,b)=>a.seat-b.seat);}
      Object.assign(s,p,{connected:true});if(isAI)s.ready=true;return s;
    }
    function leave(n){const s=seat(n);if(s){s.connected=false;s.ready=false;}}
    function setTrack(id){if(!T.ids.includes(id))throw Error('invalid_track');if(room.race&&room.race.phase!=='results')throw Error('invalid_phase');room.trackId=id;for(const p of room.players)if(!p.ai)p.ready=false;}
    function ready(n,value){
      const s=seat(n);if(!s)throw Error('invalid_seat');
      if(room.race&&room.race.phase!=='results')return;
      s.ready=!!value;
      // Humans decide; computer drivers are always ready and never start a race alone.
      const humans=room.players.filter(p=>!p.ai&&p.connected);
      if(humans.length>=(room.solo?1:2)&&humans.every(p=>p.ready))begin();
    }
    function begin(){
      room.raceNo++;room.phase='race';
      room.race=S.create({trackId:room.trackId,laps:room.laps,seed:seed+':'+room.raceNo,seats:room.players.map(p=>p.seat)});
      ai=room.players.filter(p=>p.ai).map(p=>({seat:p.seat,drive:AI.create({skill:.9,seed:room.raceNo+p.seat})}));
      for(const p of room.players)if(!p.ai)p.ready=false;
      S.start(room.race);
    }
    function input(n,value){if(room.race)S.setInput(room.race,n,value);}
    function tick(dtMs){
      if(!room.race)return;
      for(const a of ai||[]){const inp=a.drive(room.race,a.seat);if(inp)S.setInput(room.race,a.seat,inp);}
      S.step(room.race,dtMs);
    }
    function view(you){
      return {v:1,you,solo:room.solo,phase:room.phase,trackId:room.trackId,laps:room.laps,raceNo:room.raceNo,notice:room.notice,
        players:room.players.map(p=>({seat:p.seat,name:p.name,signature:p.signature,kind:p.kind,color:p.color,ready:p.ready,connected:p.connected,ai:p.ai})),
        race:room.race?S.snapshot(room.race):null};
    }
    return {room,join,leave,setTrack,ready,input,tick,view,seat};
  }
  function validView(v){
    return !!v&&v.v===1&&[0,1,2].includes(v.you)&&['lobby','race'].includes(v.phase)&&T.ids.includes(v.trackId)&&Number.isSafeInteger(v.raceNo)&&
      Array.isArray(v.players)&&v.players.length<=3&&v.players.every(p=>{try{validateProfile(p);return [0,1,2].includes(p.seat);}catch{return false;}})&&
      (v.race===null||S.validSnapshot(v.race));
  }
  return {create,validateProfile,validView,KINDS};
});
