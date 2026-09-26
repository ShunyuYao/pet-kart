'use strict';
// Installed app + read-only copy of the current appearance (never the real profile).
// Real drag of the HTML onto the pet, the chat preview entry, the real SDK consent dialog.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const GAME=path.resolve(__dirname,'..'),HOST=process.env.KART_HOST_ROOT||path.resolve(GAME,'../..');
const binary=process.env.KART_INSTALLED_APP||'/Applications/吐梨邦（测试版）.app/Contents/MacOS/吐梨邦（测试版）';
const original=process.env.KART_CURRENT_PROFILE;if(!original)throw Error('Set KART_CURRENT_PROFILE to a desktop-pet userData dir to copy the current appearance from (read-only)');
const H=require(path.join(HOST,'tests/e2e-helpers')),{activateClosingButton}=require(path.join(HOST,'tests/e2e/html-card-input')),F=require(path.join(HOST,'tests/helpers/lan-appearance-fixture'));
const source=process.env.KART_HTML||path.join(GAME,'dist/桌宠赛车.html'),root=fs.mkdtempSync(path.join(os.tmpdir(),'pet-plugin-appearance-peer-delivery-kart-'));
const evidence=path.join(GAME,'artifacts/installed',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(evidence,{recursive:true});
const report={binary,checks:[],failures:[],console:[]};let child,log='';
const pass=(s,d)=>{report.checks.push({s,d});console.log('PASS',s,d?JSON.stringify(d):'');};
async function wait(fn,label,ms=20000){const until=Date.now()+ms;let last;while(Date.now()<until){try{last=await fn();if(last)return last;}catch(e){last=e.message;}await H.sleep(150);}throw Error('timeout '+label+' last='+JSON.stringify(last));}
async function shot(page,name){const r=await H.cdp(page,'Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,name+'.png'),Buffer.from(r.data,'base64'));}
(async()=>{try{
  const config=JSON.parse(fs.readFileSync(path.join(original,'config.json')));if(process.env.KART_CHARACTER){config.character=process.env.KART_CHARACTER;config.characterAppearances={};}const key=config.characterAppearances?.[config.character]||config.character;
  fs.mkdirSync(path.join(root,'plugins'));const characterRoot=path.join(original,'plugins',key);
  if(fs.existsSync(characterRoot)){const spec=JSON.parse(fs.readFileSync(path.join(characterRoot,'character.json')));for(const id of [key,spec.realtime?.renderer].filter(Boolean))fs.cpSync(path.join(original,'plugins',id),path.join(root,'plugins',id),{recursive:true});}
  // Optional: swap in a different build of the current appearance (e.g. an upgraded pack).
  if(process.env.KART_PACK_DIR){fs.rmSync(path.join(root,'plugins',key),{recursive:true,force:true});fs.cpSync(process.env.KART_PACK_DIR,path.join(root,'plugins',key),{recursive:true});}
  fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({character:config.character,characterAppearances:config.characterAppearances||{},plugins:{grants:config.plugins?.grants||{},registrySources:['http://127.0.0.1:1']},onboarding:{completed:true},general:{autoCheckUpdates:false},relay:{url:'',paired:{}},tts:{enabled:false},behavior:{idleStroll:false,autoSleep:false}}));
  fs.writeFileSync(path.join(root,'settings-privacy.json'),JSON.stringify({usageStatsEnabled:false}));
  const port=await F.freePort(),discovery=await F.freePort();report.key=key;
  const sourceHost=process.env.KART_SOURCE_HOST;report.host=sourceHost||binary;
  child=spawn(sourceHost?require(path.join(sourceHost,'demo/node_modules/electron')):binary,[...(sourceHost?[path.join(sourceHost,'demo')]:[]),'--remote-debugging-port='+port,'--mute-audio','--use-mock-keychain'],{env:{...process.env,ELECTRON_RUN_AS_NODE:undefined,...(process.env.KART_SOURCE_HOST?{}:{}),PET_USERDATA_DIR:root,PET_E2E_TEST:'1',PET_E2E_HIDDEN:'1',PET_E2E_BACKGROUND:'1',PET_ACTIVITY_BRIDGE_PORT:'0',PET_LAN_DISCOVERY_PORT:String(discovery),PET_LAN_DISCOVERY_TARGETS:'127.0.0.1:'+discovery,PET_E2E_LAN_TCP_PORT:String(await F.freePort()),PET_E2E_TF_PORT:String(await F.freePort())},detached:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const pet=await H.findTarget(port,'/index.html');await wait(()=>H.evalIn(pet,'currentCharKey==='+JSON.stringify(key)),'current appearance');
  await H.evalIn(pet,'petAPI.openChatWindow();true');const chat=await H.findTarget(port,'/chat.html');await wait(()=>H.evalIn(chat,'typeof chatAPI==="object"'),'chat');
  const point=await H.evalIn(pet,'({x:LX+SIZE/2,y:LY+SIZE/2})'),data={items:[{mimeType:'text/html',data:'',title:path.basename(source),baseURL:''}],files:[source],dragOperationsMask:1};
  for(const type of ['dragEnter','dragOver','drop'])await H.cdp(pet,'Input.dispatchDragEvent',{type,...point,data});
  const id=await wait(()=>H.evalIn(chat,'chatAPI.getCarriedFile().then(c=>c?.htmlWork?.id)'),'real HTML import');
  const opened=await H.evalIn(chat,`chatAPI.previewHtmlWork(${JSON.stringify(id)})`);assert.equal(opened.ok,true,JSON.stringify(opened));
  const page=await wait(async()=>(await (await fetch('http://127.0.0.1:'+port+'/json')).json()).find(p=>p.url.startsWith('pet-work://')&&!p.url.includes('thumbnail=1')),'work page');
  { const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled')report.console.push(m.params.args.map(a=>a.value??a.description).join(' '));if(m.method==='Runtime.exceptionThrown')report.console.push('EXC '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));};ws.send(JSON.stringify({id:1,method:'Runtime.enable'}));report._ws=ws; }
  await H.cdp(page,'Emulation.setFocusEmulationEnabled',{enabled:true});
  // While consent is pending the game must say so instead of looking broken.
  await wait(()=>H.evalIn(page,'!document.querySelector("#grant-box").hidden&&document.querySelector("#grant-text").textContent.includes("允许")&&!!window.__kart.state.driver'),'pending consent explained');
  pass('pending consent is explained and a placeholder driver is shown',await H.evalIn(page,'document.querySelector("#grant-text").textContent'));
  let dialog=await H.findReadyTarget(port,'/dialog.html','dialogAPI');report.consent=await H.evalIn(dialog,'document.body.innerText');
  await activateClosingButton(port,dialog,'.btn-secondary');
  await wait(()=>H.evalIn(page,'document.querySelector("#grant-text").textContent.includes("重新授权")&&window.__kart.state.driver.kind==="toy"'),'denied state');
  await shot(page,'00-denied');pass('denied consent: clear message, built-in driver, retry button');
  const {activateButton}=require(path.join(HOST,'tests/e2e/html-card-input'));await activateButton(page,'#grant-retry');
  dialog=await H.findReadyTarget(port,'/dialog.html','dialogAPI');await activateClosingButton(port,dialog,'.btn-primary');
  await wait(()=>H.evalIn(page,'window.__kart.state.driver.kind!=="toy"&&document.querySelector("#grant-box").hidden'),'retry grants and reads pet',30000);
  pass('retry → allow → current pet read',{consent:report.consent});
  const st=await H.evalIn(page,'({driver:window.__kart?.state.driver,status:document.querySelector("#import-status")?.textContent,err:document.querySelector("#error")?.textContent,env:document.querySelector("#env-note")?.textContent,hasPet:typeof window.pet,world:window.__kart?.world()})');
  report.state=st;console.log(JSON.stringify(st,null,1));await shot(page,'01-preview');
  st.petNote=await H.evalIn(page,'document.querySelector("#pet-auto").textContent');
  if(process.env.KART_EXPECT_NO_REALTIME){assert.match(st.petNote,/没有 3D 布偶数据/);pass('2D fallback explains that this pack has no 3D data',st.petNote);}
  assert.equal(st.hasPet,'object');assert.equal(st.driver?.kind,process.env.KART_EXPECT_3D?'doll3d':'sprite','current pet auto-imported');pass('current pet auto-imported in preview',st.driver);
  if(process.env.KART_SHOWCASE){await H.evalIn(page,'document.querySelector("#menu").style.visibility="hidden";true');for(const n of [1,2]){await H.sleep(1800);await shot(page,'showcase-'+key+'-'+n);}
    const seat=await H.evalIn(page,'window.__kart.world().drivers[0]');assert.equal(seat.kind,process.env.KART_EXPECT_3D?'doll3d':'sprite');pass('showcase '+key,seat);}
  if(process.env.KART_EXPECT_3D){await wait(()=>H.evalIn(page,'window.__kart.state.driver.kind==="doll3d"&&window.__kart.world().drivers[0]?.kind==="doll3d"'),'3D doll from host',60000);pass('host provides 3D appearance: doll3d driver');await shot(page,'02-preview-3d');}
}catch(e){report.failures.push(e.stack);console.error(e);process.exitCode=1;}finally{
  report._ws?.close();delete report._ws;if(child){H.kill(child);}fs.writeFileSync(path.join(evidence,'host.log'),log);
  fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log('console:',report.console.slice(-15));console.log('REPORT',evidence);process.exit(process.exitCode||0);
}})();
