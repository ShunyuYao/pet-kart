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
      const look=10+Math.max(0,k.speed)*.55,laneBias=Math.sin(wobble*3+seat)*track.half*.35;
      const p=T.at(track,k.dist+look,laneBias);
      const want=Math.atan2(p.x-k.x,p.z-k.z);let diff=want-k.yaw;diff=Math.atan2(Math.sin(diff),Math.cos(diff));
      // yaw decreases when steering right (steer > 0).
      const steer=Math.max(-1,Math.min(1,-diff*2.4));
      // Rubber band so a solo race stays close without the CPU ever cheating on physics.
      const gap=rival?k.dist-rival.dist:0,limit=gap>35?.78:gap<-35?1:skill;
      const throttle=k.speed<30*limit||Math.abs(diff)<.05?1:0;
      const brake=Math.abs(diff)>.9&&k.speed>14?1:0;
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
