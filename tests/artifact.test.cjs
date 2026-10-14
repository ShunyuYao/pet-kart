'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
test('published artifact matches metadata and has no test fault seams',()=>{
 const root=path.resolve(__dirname,'..'),meta=require('../dist/build.json'),html=fs.readFileSync(path.join(root,meta.file),'utf8');
 assert.equal(meta.version,require('../package.json').version);assert.equal(meta.bytes,Buffer.byteLength(html));assert.equal(meta.sha256,crypto.createHash('sha256').update(html).digest('hex'));
 const sdk=JSON.parse(html.match(/id="pet-sdk">([^<]+)</)[1]);assert.deepEqual(sdk.interaction.protocol,meta.protocol);assert.equal(sdk.interaction.players,4);assert.equal(sdk.interaction.transport,'lan');
 assert(!html.includes('__kartRenderProbe')&&!html.includes('__kartPollDelay'));new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
