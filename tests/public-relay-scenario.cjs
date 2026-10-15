'use strict';
const assert=require('node:assert/strict');
const {autopilot}=require('./driver-input.cjs');
const readyExpression='window.__kart?.state.view?.players?.filter(p=>!p.ai).length===2&&window.__kart.state.driver?.kind==="sprite"&&!document.querySelector("#ready").disabled';
const stateExpression='window.__kart.state';
async function run({apps,H,wait,press,key,shot,check,state,closeWork}){
 const [a,b]=apps;
 await press(a.game,'[data-track="cheese"]');
 await wait(async()=>(await state(b)).view.trackId==='cheese','public guest sees chosen track');
 await press(a.game,'#ready');await H.sleep(350);assert.equal((await state(a)).view.race,null,'one ready does not start');
 await press(b.game,'#ready');
 await wait(async()=>(await state(b)).view.race?.phase==='countdown','public guest countdown');
 for(const x of apps){await H.evalIn(x.game,'document.activeElement?.blur();true');await key(x,'ArrowUp');}
 await wait(async()=>(await state(b)).view.race.phase==='racing','race starts');await H.sleep(2200);
 const race=(await state(a)).view.race;assert(race.karts.filter(p=>p.seat<2).every(p=>p.dist>25),'both physical keyboards reach host simulation');
 check('both physical keyboards drive their own kart through public relay',race.karts.map(p=>[p.seat,p.dist]));
 for(const x of apps)await shot(x.game,x.label+'-racing');
 const held=new Map(apps.map(x=>[x,{}]));let itemUsed=false;
 try{
  await wait(async()=>{const data=[];for(const x of apps)data.push(await autopilot(x,held.get(x)));const g=data[1];if(!itemUsed&&g?.item&&!g.rolling){await b.cdpS.press('KeyE');itemUsed=g.item;}return data.every(v=>v?.phase==='results');},'real-key public race completes',300000);
 }finally{for(const x of apps){for(const code of ['ArrowUp','ArrowLeft','ArrowRight'])await key(x,code,'keyUp').catch(()=>{});x.cdpS?.close();}}
 const ceremonies=[];
 for(const x of apps){
  ceremonies.push(await wait(async()=>{const c=await H.evalIn(x.game,'window.__kart.world().ceremony');return c.active&&c.ready&&c.t>4600?c:null;},'actual public podium '+x.label,25000));
  await shot(x.game,x.label+'-podium');
 }
 const order=c=>c.actors.slice().sort((a,b)=>a.place-b.place).map(a=>a.seat);
 assert.deepEqual(order(ceremonies[0]),order(ceremonies[1]),'actual podium actors agree');
 await wait(async()=>(await Promise.all(apps.map(x=>H.evalIn(x.game,'window.__kart.state.mode==="results"&&!document.querySelector("#results-panel").hidden&&!document.querySelector("#again").disabled')))).every(Boolean),'both painted result panels after podium',25000);
 const places=(await state(a)).view.race.karts.map(p=>[p.seat,p.place]);assert.deepEqual((await state(b)).view.race.karts.map(p=>[p.seat,p.place]),places);
 check('both physical Macs complete the same race and podium order over public relay',{places,itemUsed});
 for(const x of apps)await shot(x.game,x.label+'-results');
 await press(a.game,'#again');await press(b.game,'#again');
 await wait(async()=>(await state(b)).view.race?.phase==='countdown','public rematch reaches guest');check('public rematch after shared results');
 await closeWork(b);
 // The existing race rules reserve a departed driver's kart until settlement.
 // CPU replacement is immediate only between races (covered by the four-player path).
 await wait(async()=>(await state(a)).view.players.find(p=>p.seat===1)?.connected===false,'public mid-race departure reaches host');
 const after=await state(a);assert.equal(after.view.players.find(p=>p.seat===1).ai,false,'no mid-race ownership change');assert.notEqual(after.connection,'closed','host race remains open');
 check('public guest window exit disconnects the driver and preserves the host race');
}
module.exports={gameId:'pet-kart',readyExpression,stateExpression,run};
