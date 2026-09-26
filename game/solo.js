// Local driver: same room rules, seat 1 is a computer driver. No network needed.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./room.cjs'));else root.KartSolo=factory(root.KartRoom);})(globalThis,function(R){
  'use strict';
  const RIVALS=[{name:'电脑 · 奶酪队长',signature:'builtin:cpu-cheddar',kind:'toy',color:'#6c7cff',species:'cat'},
    {name:'电脑 · 棉花教练',signature:'builtin:cpu-cotton',kind:'toy',color:'#22c55e',species:'bunny'}];
  function create({onView=()=>{},onConnection=()=>{},now=()=>Date.now()}={}){
    let room=null,timer=null,last=0,acc=0,lastView=0;
    return {
      role:()=>'solo',
      peek:()=>room?room.view(0):null,
      async start(profile){room=R.create({seed:'solo:'+now(),solo:true});room.join(0,profile);room.join(1,RIVALS[0],{isAI:true});room.join(2,RIVALS[1],{isAI:true});onView(room.view(0));onConnection('solo');
        last=now();timer=setInterval(()=>{const t=now();acc+=Math.min(2000,t-last);last=t;while(acc>=1000/60){room.tick(1000/60);acc-=1000/60;}if(t-lastView>=100){lastView=t;onView(room.view(0));}},1000/60);onView(room.view(0));},
      setProfile(p){room?.join(0,p);},
      setInput(v){room?.input(0,v);},
      ready(v){room.ready(0,v);onView(room.view(0));},
      setTrack(id){room.setTrack(id);},
      async leave(){this.dispose();},
      dispose(){clearInterval(timer);timer=null;},
      diagnostics:()=>({role:'solo'}),
    };
  }
  return {create,RIVALS};
});
