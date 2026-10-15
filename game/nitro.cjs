// Drift-earned N₂O. Pure race rules shared by authority and local prediction.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.KartNitro=factory();})(globalThis,function(){
  'use strict';
  const K=Object.freeze({capacity:100,rate:30,duration:3,max:45});
  function begin(k,input,dt,racing){
    k.nitroTime=Math.max(0,(k.nitroTime||0)-dt);
    if(k.spin>0||!racing||k.finishedAt)k.nitroTime=0;
    // Consume even unsuccessful presses: no queued activation after filling up.
    if(Number.isSafeInteger(input.nitro)&&input.nitro>(k.nitroUsed||0)){
      k.nitroUsed=input.nitro;
      if(racing&&!k.finishedAt&&k.spin<=0&&!k.nitroTime&&k.nitro>=K.capacity){
        k.nitro=0;k.nitroTime=K.duration;k.nitroCasts=(k.nitroCasts||0)+1;
      }
    }
  }
  function charge(k,dt,progress){
    if(k.drift&&Math.abs(k.steer)>.15&&k.speed>11&&!k.air&&!k.off&&!k.wall&&k.spin<=0&&!k.finishedAt&&!k.nitroTime&&progress>k.speed*dt*.3)
      k.nitro=Math.min(K.capacity,(k.nitro||0)+K.rate*dt);
  }
  function valid(k){return Number.isFinite(k.nitro)&&k.nitro>=0&&k.nitro<=K.capacity&&Number.isFinite(k.nitroTime)&&k.nitroTime>=0&&k.nitroTime<=K.duration&&['nitroUsed','nitroCasts'].every(f=>Number.isSafeInteger(k[f])&&k[f]>=0);}
  return {K,begin,charge,valid};
});
