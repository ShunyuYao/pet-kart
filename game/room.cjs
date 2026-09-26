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
  const SEATS=[0,1,2,3];
  // fill: computer drivers that take every empty seat (LAN rooms race 4 karts);
  // they give their seat to a human who joins between races.
  function create({seed='room',solo=false,fill=null,now=()=>Date.now()}={}){
    const room={phase:'lobby',trackId:'cheese',laps:S.LAPS,raceNo:0,players:[],race:null,solo,notice:''};
    const waiting=new Map();
    let ai=null;
    const racing=()=>!!room.race&&room.race.phase!=='results';
    function seat(n){return room.players.find(p=>p.seat===n);}
    function place(n,profile,isAI){
      let s=seat(n);
      if(s&&s.ai!==isAI){room.players.splice(room.players.indexOf(s),1);s=null;}
      if(!s){s={seat:n,ready:false,connected:true,ai:isAI};room.players.push(s);room.players.sort((a,b)=>a.seat-b.seat);}
      Object.assign(s,profile,{connected:true,gone:false});if(isAI)s.ready=true;return s;
    }
    function refill(){
      if(!fill||racing())return;
      for(const [n,p] of waiting){waiting.delete(n);place(n,p,false);}
      const used=new Set(room.players.filter(p=>p.ai).map(p=>p.signature));
      for(const n of SEATS)if(!seat(n)){const cpu=fill.find(c=>!used.has(c.signature));if(!cpu)break;used.add(cpu.signature);place(n,validateProfile(cpu),true);}
    }
    function join(n,profile,{isAI=false}={}){
      if(!SEATS.includes(n))throw Error('invalid_seat');
      const p=validateProfile(profile);
      // A human arriving mid-race waits for the results screen instead of hijacking a kart.
      if(!isAI&&racing()&&seat(n)?.ai!==false){waiting.set(n,p);return null;}
      const s=place(n,p,isAI);refill();return s;
    }
    function isHuman(n){return seat(n)?.ai===false||waiting.has(n);}
    function remove(n){
      waiting.delete(n);const s=seat(n);if(!s)return;
      if(racing()){s.connected=false;s.ready=false;return;}
      room.players.splice(room.players.indexOf(s),1);refill();
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
      if(fill&&!racing()&&(waiting.size||room.players.some(p=>!p.ai&&p.gone)))settle();
      if(!room.race)return;
      for(const a of ai||[]){const inp=a.drive(room.race,a.seat);if(inp)S.setInput(room.race,a.seat,inp);}
      S.step(room.race,dtMs);
    }
    // Between races: humans who left during the race give their seat back, spectators sit down.
    function settle(){for(const p of [...room.players])if(!p.ai&&p.gone)room.players.splice(room.players.indexOf(p),1);refill();}
    function depart(n){const s=seat(n);if(racing()&&s&&!s.ai){s.gone=true;s.connected=false;s.ready=false;waiting.delete(n);}else remove(n);}
    function view(you){
      const spectator=waiting.has(you);
      return {v:1,you,solo:room.solo,phase:spectator?'lobby':room.phase,trackId:room.trackId,laps:room.laps,raceNo:room.raceNo,notice:room.notice,waiting:spectator,
        players:room.players.map(p=>({seat:p.seat,name:p.name,signature:p.signature,kind:p.kind,color:p.color,ready:p.ready,connected:p.connected,ai:p.ai})),
        race:room.race&&!spectator?S.snapshot(room.race):null};
    }
    return {room,join,leave,depart,setTrack,ready,input,tick,view,seat,isHuman,waiting:()=>[...waiting.keys()]};
  }
  function validView(v){
    return !!v&&v.v===1&&SEATS.includes(v.you)&&['lobby','race'].includes(v.phase)&&T.ids.includes(v.trackId)&&Number.isSafeInteger(v.raceNo)&&typeof v.waiting==='boolean'&&
      Array.isArray(v.players)&&v.players.length<=4&&v.players.every(p=>{try{validateProfile(p);return SEATS.includes(p.seat);}catch{return false;}})&&
      (v.race===null||S.validSnapshot(v.race));
  }
  return {create,validateProfile,validView,KINDS};
});
