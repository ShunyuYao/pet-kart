// Computer driver for solo races. Produces the same intent shape a player sends.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./track.cjs'));else root.KartAI=factory(root.KartTrack);})(globalThis,function(T){
  'use strict';
  function create({skill=.9,seed=7}={}){
    let item=0,holdSince=0,wobble=seed%10/10;
    return function drive(state,seat){
      const track=T.build(state.trackId),k=state.karts.find(x=>x.seat===seat);if(!k)return null;
      // Rubber band against the best of the other drivers.
      const rival=state.karts.filter(x=>x.seat!==seat).sort((a,b)=>b.dist-a.dist)[0];
      wobble+=.004;
      // Corner planning: the slowest safe speed over the road ahead, allowing for the
      // braking distance to get there. Radius is widened by the usable road width.
      const heading=d=>{const a=T.at(track,k.dist+d);return Math.atan2(a.tx,a.tz);};
      let target=30*1.2,tight=0;
      for(let d=4;d<=Math.max(30,k.speed*2.2);d+=4){
        let turn=heading(d+6)-heading(d-6);turn=Math.abs(Math.atan2(Math.sin(turn),Math.cos(turn)));
        const r=12/Math.max(.02,turn)+track.half*.7,corner=2.05*track.grip*r/(1+.015*2.05*track.grip*r);
        target=Math.min(target,Math.sqrt(corner*corner+2*26*Math.max(0,d-6)));
        if(d<=16)tight=Math.max(tight,turn);
      }
      const look=Math.max(7,Math.min(10+Math.max(0,k.speed)*.55,6+target*.6)),laneBias=Math.sin(wobble*3+seat)*track.half*.35*Math.max(0,1-tight*2);
      const p=T.at(track,k.dist+look,laneBias);
      const want=Math.atan2(p.x-k.x,p.z-k.z);let diff=want-k.yaw;diff=Math.atan2(Math.sin(diff),Math.cos(diff));
      // yaw decreases when steering right (steer > 0).
      const steer=Math.max(-1,Math.min(1,-diff*2.4));
      // Rubber band so a solo race stays close without the CPU ever cheating on physics.
      const gap=rival?k.dist-rival.dist:0,limit=gap>35?.78:gap<-35?1:skill;
      const cap=Math.min(30*limit+(k.boost>0?10:0),target);
      const throttle=k.speed<cap||(Math.abs(diff)<.05&&k.speed<target)?1:0;
      const brake=(k.speed>cap+2.5&&k.speed>10)||(Math.abs(diff)>.9&&k.speed>14)?1:0;
      if(k.item&&!k.rolling&&state.t>=(k.rollUntil||0)){
        if(!holdSince)holdSince=state.t;
        const behind=rival&&rival.dist<k.dist&&k.dist-rival.dist<18,ahead=rival&&rival.dist>k.dist&&rival.dist-k.dist<50;
        if((k.item==='mushroom'&&Math.abs(diff)<.25)||(k.item==='banana'&&(behind||state.t-holdSince>6000))||(k.item==='yarn'&&(ahead||state.t-holdSince>8000))){item++;holdSince=0;}
      }
      return {steer,throttle:state.phase==='countdown'?(state.countdown<500?1:0):throttle&&!brake?1:0,brake,drift:0,item};
    };
  }
  return {create};
});
