'use strict';
// Read-only root-position observation of the built artifact. The only timing
// fault seam delays real SDK polls; no simulation, input, messages or results mocked.
const assert=require('node:assert/strict'),vm=require('node:vm');
exports.instrument=html=>{
 let observed=0,polls=0,closes=0;
 html=html.replace(/([\w$]+)\.root\.position\.set\(([\w$]+)\.x,\2\.y,\2\.z\)/g,(m,cart,state,at)=>{
   const prefix=html.slice(Math.max(0,at-900),at),loops=[...prefix.matchAll(/for\(let\[([\w$]+),([\w$]+)\]of /g)],loop=loops.at(-1);
   if(!loop||loop[2]!==cart)return m;observed++;
   return `${m},globalThis.__kartRenderProbe?.({t:performance.now(),seat:${loop[1]},state:{...${state}},position:{x:${cart}.root.position.x,y:${cart}.root.position.y,z:${cart}.root.position.z}})`;
 });
 html=html.replace(/await ([\w$]+)\.poll\(/g,(m,api)=>{polls++;return `(await globalThis.__kartPollDelay?.(),await ${api}.poll(`;});
 html=html.replace(/waitMs:1e3\}\);/g,m=>{closes++;return 'waitMs:1e3}));';});
 assert.equal(observed,1,'exactly one race root transform probe');assert.equal(polls,1);assert.equal(closes,1);
 const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert(js);new vm.Script(js);return html;
};
