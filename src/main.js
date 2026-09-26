// Entry: UI flow, input, prediction/interpolation and wiring of world + transport.
import {createWorld} from './scene.js';
import {createAudio} from './audio.js';
import * as C from './characters.js';
import T from '../game/track.cjs';
import S from '../game/sim.cjs';
import Net from '../game/net.js';
import Solo from '../game/solo.js';

const $=id=>document.getElementById(id);
const world=createWorld($('stage'));
const audio=createAudio();
const ITEM_ICON={mushroom:'🍄',banana:'🍌',yarn:'🧶'},ITEM_NAME={mushroom:'加速蘑菇',banana:'香蕉皮',yarn:'追踪毛线球'};
const KIND_LABEL={doll3d:'3D 布偶',sprite:'2D 角色',toy:'内置玩具'};
// Computer drivers: fixed built-in toys, keyed by their stable signatures.
const CPU_ASSETS={'builtin:cpu-cheddar':{kind:'toy',species:'cat',color:'#6c7cff'},'builtin:cpu-cotton':{kind:'toy',species:'bunny',color:'#22c55e'}};
const cpuAsset=p=>CPU_ASSETS[p.signature]||{kind:'toy',species:'mouse',color:p.color};

let driver=null,transport=null,mode='title',view=null,connection='idle',sdk=window.pet||null,petDriver=null;
let ceremonyFor=-1,lastRaceNo=-1,lastEventSeq=0,pred=null,remoteBuf=[],itemCount=0,errorTimer=null,toastTimer=null,lastFrame=performance.now();
const peerAssets=new Map(),keys=new Set();

// ---------- UI helpers ----------
function show(panel){for(const id of ['title-panel','lobby-panel','results-panel'])$(id).hidden=id!==panel;$('menu').hidden=!panel;}
function error(text){$('error').textContent=text||'';$('error').hidden=!text;clearTimeout(errorTimer);if(text)errorTimer=setTimeout(()=>{$('error').hidden=true;},7000);}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;$('toast').classList.remove('pop');void $('toast').offsetWidth;$('toast').classList.add('pop');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},1800);}
function describe(e){const m=e?.message||String(e);const map={no_invitation:'这份 HTML 还没有联机邀请。',protocol_mismatch:'双方的游戏版本不一致，请用同一份 HTML。',session_closed:'本次邀请已结束。',zip_invalid:'这个 ZIP 读不出来，请确认是完整的角色包。',zip64_unsupported:'ZIP 太大（ZIP64），请重新打包后再导入。',pack_no_character:'包里没有 character.json，不像是桌宠角色包。',pack_no_frames:'角色包里没有找到 idle 动作图。',pack_realtime_invalid:'角色包里的 3D 布偶数据不完整。',image_decode_failed:'图片解码失败，换一张 PNG / WebP / JPG 试试。',file_too_large:'文件太大了（超过 12 MB）。',asset_too_large:'形象素材超过 1 MB，搭子那边会显示为玩具车手。',CHARACTER_IMAGE_UNAVAILABLE:'暂时读不到当前桌宠形象。',invalid_view:'收到了一份无效的对局数据，已忽略。'};
  return map[m]||(/permission|denied|revoked/i.test(m)?'能力未授权：请重新打开 HTML 并允许读取形象 / 联机。':/zip_entry_missing/.test(m)?'角色包缺少文件：'+m.split(':').slice(1).join(':'):'出了点问题：'+m);}
function portraitInto(el,d){el.replaceChildren();if(d?.portrait){const img=new Image();img.src=d.portrait;img.alt='';el.append(img);}else{el.textContent=d?.asset?.species==='cat'?'🐱':d?.asset?.species==='bunny'?'🐰':'🐭';}}
function renderDriverCard(){
  portraitInto($('driver-portrait'),driver);$('driver-name').textContent=driver?.profile.name||'…';
  $('driver-kind').textContent=driver?KIND_LABEL[driver.profile.kind]+(driver.profile.kind==='doll3d'?' · 实时骨骼坐姿':''):'';
  $('driver-kind').dataset.kind=driver?.profile.kind||'';
  $('use-pet').hidden=!sdk?.character;$('use-pet').disabled=!petDriver;
  $('pet-auto').hidden=!(driver&&petDriver&&(driver.source==='pet'||driver.characterKey===petDriver.characterKey));
  $('pet-auto').textContent='🐾 已自动带入你的桌宠形象，换装后会自动跟随。'+(driver?.profile.kind==='sprite'&&realtimeNote?' '+realtimeNote:'');
}
async function setDriver(next,{remember=true}={}){
  driver=next;renderDriverCard();
  const seat=transport?mySeat():0;
  await world.setDriver(seat,{profile:driver.profile,asset:driver.asset,fallback:driver.fallback});
  if(transport)transport.setProfile(driver.profile,driver.asset);
  if(remember)void C.saveDriver('last',driver);
}
function mySeat(){return view?.you??0;}

// ---------- character import ----------
async function importFiles(files){
  const list=[...files];if(!list.length)return;
  $('import-status').textContent='正在读取 '+(list[0].webkitRelativePath?.split('/')[0]||list[0].name)+' …';$('import-status').dataset.state='busy';
  try{
    let d;
    if(list.length>1||list[0].webkitRelativePath)d=await C.packDriver(list);
    else if(/\.zip$/i.test(list[0].name)||list[0].type==='application/zip')d=await C.packDriver(list[0]);
    else if(/^image\//.test(list[0].type)||/\.(png|webp|jpe?g|gif)$/i.test(list[0].name))d=await C.imageDriver(list[0]);
    else throw Error('请导入角色包 ZIP / 文件夹，或 PNG / WebP / JPG 图片。');
    if(d.characterKey)void C.saveDriver('pack:'+d.characterKey,d);
    await setDriver(d);
    $('import-status').textContent='已导入「'+d.profile.name+'」 · '+KIND_LABEL[d.profile.kind]+(d.profile.kind==='doll3d'?'（换成这个桌宠时也会自动用 3D）':'');$('import-status').dataset.state='ok';
  }catch(e){console.error(e);$('import-status').textContent=describe(e);$('import-status').dataset.state='error';}
}
$('import-file').addEventListener('change',e=>{void importFiles(e.target.files);e.target.value='';});
$('import-folder').addEventListener('change',e=>{void importFiles(e.target.files);e.target.value='';});
addEventListener('dragover',e=>{e.preventDefault();document.body.classList.add('dragging');});
addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('dragging');});
addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('dragging');if(mode==='race')return;void importFiles(e.dataTransfer.files);});
for(const t of C.TOYS){const b=document.createElement('button');b.type='button';b.className='chip';b.dataset.toy=t.id;b.textContent=(t.id==='cat'?'🐱 ':t.id==='bunny'?'🐰 ':'🐭 ')+t.name;b.addEventListener('click',async()=>{await setDriver(await C.toyDriver(t.id));$('import-status').textContent='';});$('toy-row').append(b);}
$('use-pet').addEventListener('click',async()=>{if(petDriver)await setDriver(await preferPack(petDriver));});
async function preferPack(d){
  // Newest hosts expose the pet's realtime (3D rag-doll) data directly: no import needed.
  if(d?.source==='pet'&&sdk?.character?.getRealtime){
    try{const raw=await sdk.character.getRealtime(),rt=await C.realtimeDriver(raw,d);if(rt){realtimeNote='';return rt;}
      realtimeNote=raw?'这个形象的 3D 数据格式本游戏不认识，先以 2D 上车。':'这个形象的角色包没有 3D 布偶数据，以 2D 上车；升级到带实时布偶的角色包即可 3D 上车。';}
    catch(e){console.warn('realtime unavailable',e);realtimeNote='读取 3D 布偶数据失败（'+describe(e)+'），先以 2D 上车。';}
  }
  // If this desktop pet's own pack was imported before, race it in 3D.
  if(d?.characterKey){const cached=await C.loadDriver('pack:'+d.characterKey);if(cached?.asset.kind==='doll3d'){$('import-status').textContent='当前桌宠「'+cached.profile.name+'」已导入过 3D 布偶包，自动用 3D 上场。';$('import-status').dataset.state='ok';return cached;}}
  return d;
}

// Consent is the user's choice: explain pending / denied states and allow retrying.
function grantState(text){$('grant-box').hidden=!text;$('grant-text').textContent=text||'';}
async function readPet(){
  grantState('正在请求读取你的桌宠形象：请在桌宠弹出的授权窗口里点「允许」。');
  let grant;try{grant=await sdk.capabilities.request({});}catch(e){grantState('授权请求没有完成（'+describe(e)+'），可以再试一次。');return false;}
  if(grant?.status!=='granted'||!grant.permissions?.includes('character:read')){grantState('还没有允许读取桌宠形象，现在先用内置车手。想用自己的桌宠，点下面的按钮重新授权。');return false;}
  try{petDriver=await C.currentPetDriver(sdk.character);}catch(e){grantState('已授权，但暂时读不到当前桌宠形象：'+describe(e));return false;}
  grantState('');await setDriver(await preferPack(petDriver),{remember:false});void followPet();return true;
}
$('grant-retry').addEventListener('click',async()=>{if(await readPet()){error('');await joinInvitation();}});
// A received "play together" invitation; permission problems are explained by the grant box.
async function joinInvitation(){
  if(transport||!sdk?.sessions?.getContext)return;
  let context=null;try{context=await sdk.sessions.getContext();}catch(e){if(!/permission|denied|revoked/i.test(e.message))error(describe(e));return;}
  if(context)await startLan().catch(e=>{error(describe(e));transport=null;});renderMenus();
}

// Follow outfit/character changes of the desktop pet (subscribe first, then read).
let following=false,realtimeNote='';
async function followPet(){
  const ch=sdk?.character;if(!ch?.watch||following)return;following=true;
  let sub;try{sub=await ch.watch();}catch{return;}
  addEventListener('beforeunload',()=>void ch.unwatch(sub).catch(()=>{}));
  let lastSig=petDriver?.profile.signature;
  while(true){
    try{
      const rev=await ch.next(sub);if(!rev)continue;
      const next=await C.currentPetDriver(ch);if(next.profile.signature===lastSig)continue;lastSig=next.profile.signature;
      const usingPet=!driver||driver.source==='pet'||driver.characterKey===petDriver?.characterKey;petDriver=next;
      if(usingPet){await setDriver(await preferPack(next),{remember:false});toast('已换上新的桌宠形象');}else renderDriverCard();
    }catch(e){if(/revoked|denied|disposed|inactive/i.test(e.message))return;await new Promise(r=>setTimeout(r,1000));}
  }
}

// ---------- transport ----------
function onView(v){
  view=v;
  if(v.race&&v.raceNo!==lastRaceNo){lastRaceNo=v.raceNo;lastEventSeq=0;pred=null;remoteBuf=[];}
  if(transport?.role()==='guest'&&v.race){remoteBuf.push({t:performance.now(),karts:v.race.karts.filter(k=>k.seat!==v.you)});if(remoteBuf.length>12)remoteBuf.shift();reconcile(v.race);}
  syncDrivers(v);renderMenus();
}
function syncDrivers(v){
  world.setTrack(v.race?.trackId||v.trackId);
  if(driver)void world.setDriver(v.you,{profile:driver.profile,asset:driver.asset,fallback:driver.fallback});
  for(const p of v.players){
    if(p.seat===v.you)continue;
    const asset=p.ai?cpuAsset(p):peerAssets.get(p.signature);
    if(asset)void world.setDriver(p.seat,{profile:p,asset});
    else void world.setDriver(p.seat,{profile:{...p,signature:'pending:'+p.signature},asset:{kind:'toy',species:'mouse',color:p.color}});
  }
  for(const seat of [0,1,2])if(seat!==v.you&&!v.players.some(p=>p.seat===seat))world.removeDriver(seat);
}
function onAsset(seat,signature,asset){
  if(!C.checkAsset(asset)){error('搭子的形象数据无效，已改用玩具车手显示。');return;}
  peerAssets.set(signature,asset);if(view)syncDrivers(view);
}
function onConnection(s){connection=s;renderMenus();if(s==='closed'&&mode!=='title')toast('联机已结束');}
async function startSolo(){
  if(transport)return;
  transport=Solo.create({onView,onConnection});mode='lobby';
  await world.setDriver(0,{profile:driver.profile,asset:driver.asset,fallback:driver.fallback});
  await transport.start(driver.profile);
}
async function startLan(){
  transport=Net.create(sdk.sessions,{onView,onConnection,onAsset,onError:e=>{if(!/backpressure/.test(e.message))error(describe(e));}});mode='lobby';
  const ctx=await transport.start(driver.profile,driver.asset);
  await world.setDriver(ctx.role==='host'?0:1,{profile:driver.profile,asset:driver.asset,fallback:driver.fallback});
}
async function leave(){
  const t=transport;transport=null;view=null;pred=null;mode='title';lastRaceNo=-1;world.stopCeremony();ceremonyFor=-1;
  try{await t?.leave();}catch{}t?.dispose();audio.silence();
  world.removeDriver(1);await world.setDriver(0,{profile:driver.profile,asset:driver.asset,fallback:driver.fallback});
  renderMenus();
}

// ---------- menus ----------
function renderMenus(){
  const race=view?.race,phase=race?.phase,solo=view?.solo,host=transport?.role()!=='guest';
  mode=!transport?'title':!view?'lobby':!race||(phase==='grid')?'lobby':phase==='results'?(world.ceremonyActive&&!world.ceremonyDone?'ceremony':'results'):'race';
  $('ceremony-bar').hidden=mode!=='ceremony';
  $('hud').hidden=mode!=='race';
  // Driving keys (Space = drift) must not re-activate whatever button was focused last.
  if(mode==='race'&&document.activeElement?.matches?.('button'))document.activeElement.blur();
  show(mode==='title'?'title-panel':mode==='lobby'?'lobby-panel':mode==='results'?'results-panel':null);
  const labels={idle:'',solo:'单人 · 对战电脑',waiting:'等待搭子加入…',connected:'已连接搭子',reconnecting:'正在重连…',closed:'邀请已结束'};
  $('conn').textContent=labels[connection]||connection;$('conn').dataset.state=connection;$('conn').hidden=!transport;
  $('leave').hidden=!transport;$('leave').textContent=solo?'回到首页':'离开本局';
  if(view&&(mode==='lobby'||mode==='results')){
    const me=view.players.find(p=>p.seat===view.you);
    for(const box of [$('lobby-players'),$('results-players')])box.replaceChildren();
    $('lobby-players').append(...[0,1,2].map(seat=>playerRow(view.players.find(p=>p.seat===seat),seat)));
    for(const b of document.querySelectorAll('[data-track]')){b.setAttribute('aria-pressed',String(b.dataset.track===view.trackId));b.disabled=!host;}
    $('track-hint').textContent=host?'选一条赛道（房主决定）':'房主选择了：'+T.build(view.trackId).name;
    $('track-blurb').textContent=T.build(view.trackId).blurb+' · '+view.laps+' 圈';
    const ended=connection==='closed';
    $('ready').disabled=ended||!me;$('ready').textContent=solo?'开始比赛':me?.ready?'已准备 · 点此取消':'我准备好了';
    $('lobby-note').textContent=ended?'对方已离开。通过桌宠重新发送这份 HTML，就能再比一场。':solo?'电脑对手已就位。':view.players.length<2?'把这个 HTML 通过桌宠「发送并一起玩」给搭子，对方接受后会出现在这里。':'两人都准备好就发车。';
    $('lobby-title').textContent=solo?'单人赛 · 对战电脑':'双人赛 · 局域网';
  }
  if(mode==='results'){
    const order=[...race.karts].sort((a,b)=>a.place-b.place);
    $('results-players').append(...order.map(k=>{const p=view.players.find(x=>x.seat===k.seat),row=document.createElement('div');row.className='result-row'+(k.seat===view.you?' is-you':'');
      const medal=document.createElement('span');medal.className='medal';medal.textContent=['🥇','🥈','🥉'][k.place-1]||'🏁';
      const name=document.createElement('strong');name.textContent=(p?.name||'车手')+(k.seat===view.you?'（你）':'');
      const time=document.createElement('span');time.textContent=k.finishedAt?fmt(k.finishedAt):'未完赛';row.append(medal,name,time);return row;}));
    const mine=race.karts.find(k=>k.seat===view.you);
    $('results-title').textContent=mine?.place===1?'冠军！冲线第一 🏁':'第 '+(mine?.place||2)+' 名 · 下次再冲！';
    const me=view.players.find(p=>p.seat===view.you),other=view.players.find(p=>p.seat!==view.you);
    $('again').disabled=connection==='closed';$('again').textContent=solo?'再来一局':me?.ready?'已准备 · 等搭子':'再来一局';
    $('results-note').textContent=solo?'':connection==='closed'?'对方已离开。':other?.ready?'搭子想再来一局！':'两人都点「再来一局」就重新发车。';
    for(const b of document.querySelectorAll('[data-next-track]')){b.setAttribute('aria-pressed',String(b.dataset.nextTrack===view.trackId));b.disabled=!host;}
  }
}
function playerRow(p,seat){
  const row=document.createElement('div');row.className='player-row'+(p&&p.seat===view.you?' is-you':'');
  const dot=document.createElement('span');dot.className='dot';dot.style.background=p?.color||'#ccc';
  const name=document.createElement('strong');name.textContent=p?p.name+(p.seat===view.you?'（你）':''):'等待搭子…';
  const kind=document.createElement('small');kind.textContent=p?(p.ai?'电脑':KIND_LABEL[p.kind]):'';
  const st=document.createElement('span');st.className='state';st.textContent=!p?'':p.ai?'就位':!p.connected?'掉线中':p.ready?'✓ 已准备':'未准备';
  row.append(dot,name,kind,st);return row;
}
const fmt=ms=>{const s=ms/1000;return Math.floor(s/60)+':'+(s%60).toFixed(2).padStart(5,'0');};
for(const id of T.ids){
  const t=T.build(id);
  for(const [box,attr] of [[$('track-list'),'track'],[$('next-track-list'),'nextTrack']]){
    const b=document.createElement('button');b.type='button';b.className='track-card';b.dataset[attr]=id;
    const name=document.createElement('strong');name.textContent=t.name;const sub=document.createElement('small');sub.textContent=t.blurb;b.append(name,sub);
    b.addEventListener('click',()=>{try{transport.setTrack(id);if(transport.role()==='solo'||transport.role()==='host')onView(transport.peek());}catch(e){error(describe(e));}});box.append(b);
  }
}
$('solo').addEventListener('click',()=>void startSolo().catch(e=>error(describe(e))));
$('ready').addEventListener('click',()=>{const me=view?.players.find(p=>p.seat===view.you);try{transport.ready(view.solo?true:!me?.ready);}catch(e){error(describe(e));}});
$('again').addEventListener('click',()=>{try{transport.ready(true);}catch(e){error(describe(e));}});
$('leave').addEventListener('click',()=>void leave());
$('sfx').addEventListener('click',()=>{audio.setSfx(!audio.sfx);$('sfx').setAttribute('aria-pressed',String(audio.sfx));$('sfx').textContent='音效 '+(audio.sfx?'开':'关');});
$('music').addEventListener('click',()=>{audio.setMusic(!audio.music);$('music').setAttribute('aria-pressed',String(audio.music));$('music').textContent='音乐 '+(audio.music?'开':'关');});

// ---------- input ----------
const K={up:['ArrowUp','KeyW'],down:['ArrowDown','KeyS'],left:['ArrowLeft','KeyA'],right:['ArrowRight','KeyD'],drift:['Space','ShiftLeft','ShiftRight'],item:['KeyE','KeyX']};
const held=list=>list.some(k=>keys.has(k));
addEventListener('keydown',e=>{
  if(e.target.closest?.('input,textarea,select'))return;
  if(mode==='race'&&[...K.up,...K.down,...K.left,...K.right,...K.drift].includes(e.code))e.preventDefault();
  if(e.repeat)return;keys.add(e.code);
  if(mode==='ceremony'&&e.code==='Space'){e.preventDefault();world.skipCeremony();return;}
  if(mode==='race'&&K.item.includes(e.code)){e.preventDefault();itemCount++;}
  pushInput();
});
addEventListener('keyup',e=>{keys.delete(e.code);pushInput();});
// Push intents on every key change, not only per animation frame: lower latency, and
// still correct when the compositor throttles rAF (hidden / occluded window).
function pushInput(){if(transport&&mode==='race')transport.setInput(readInput());}
addEventListener('blur',()=>keys.clear());
let padItem=false;
function readInput(){
  let steer=(held(K.right)?1:0)-(held(K.left)?1:0),throttle=held(K.up),brake=held(K.down),drift=held(K.drift);
  const pad=[...(navigator.getGamepads?.()||[])].find(Boolean);
  if(pad){const ax=pad.axes[0]||0;if(Math.abs(ax)>.18)steer=Math.max(-1,Math.min(1,ax));const b=i=>!!pad.buttons[i]?.pressed;throttle||=b(0)||b(7);brake||=b(1)||b(6);drift||=b(5)||b(4);
    const it=b(2)||b(3);if(it&&!padItem&&mode==='race')itemCount++;padItem=it;}
  return {steer,throttle:throttle?1:0,brake:brake?1:0,drift:drift?1:0,item:itemCount};
}

// ---------- guest prediction ----------
function reconcile(race){
  const server=race.karts.find(k=>k.seat===view.you);if(!server)return;
  if(race.phase!=='racing'||!pred){pred={...server};return;}
  // Soft-correct toward where the host's kart is now (≈ one-way latency ahead).
  const lead=.06,sx=server.x+Math.sin(server.yaw)*server.speed*lead,sz=server.z+Math.cos(server.yaw)*server.speed*lead;
  const err=Math.hypot(sx-pred.x,sz-pred.z);
  if(err>7||(server.spin>0&&pred.spin<=0)){Object.assign(pred,server);return;}
  const a=.18;pred.x+=(sx-pred.x)*a;pred.z+=(sz-pred.z)*a;pred.speed+=(server.speed-pred.speed)*.25;
  let dy=server.yaw-pred.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));pred.yaw+=dy*.2;pred.dist+=(server.dist-pred.dist)*a;
  if(server.boost>pred.boost+.25)pred.boost=server.boost;
  for(const f of ['item','rolling','lap','finishedAt','place','itemUsed'])pred[f]=server[f];
}
function remoteStates(){
  // Render other karts ~110 ms in the past, interpolated between snapshots.
  const t=performance.now()-110;let a=null,b=null;
  for(let i=remoteBuf.length-1;i>0;i--)if(remoteBuf[i-1].t<=t){a=remoteBuf[i-1];b=remoteBuf[i];break;}
  if(!a)return remoteBuf.at(-1)?.karts||[];
  const f=Math.max(0,Math.min(1,(t-a.t)/Math.max(1,b.t-a.t)));
  return b.karts.map(kb=>{const ka=a.karts.find(k=>k.seat===kb.seat);if(!ka)return kb;const k={...kb};
    for(const n of ['x','y','z','speed','steer'])k[n]=ka[n]+(kb[n]-ka[n])*f;
    let dy=kb.yaw-ka.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));k.yaw=ka.yaw+dy*f;return k;});
}

// ---------- HUD + events ----------
const EVENT_TEXT={hit:s=>s===view.you?'💫 打滑了！':'💥 击中搭子！',box:s=>s===view.you?'🎁 抽道具…':null,lap:(s,e)=>s===view.you?(e.lap===view.race.laps?'🔥 最后一圈！':'第 '+e.lap+' 圈'):null,finish:s=>s===view.you?'🏁 冲线！':'搭子冲线了！'};
function processEvents(race){
  for(const e of race.events){
    if(e.seq<=lastEventSeq)continue;lastEventSeq=e.seq;
    const mine=e.seat===view.you;
    if(e.type==='countdown')continue;
    if(e.type==='go')audio.play('go');
    if(e.type==='boost'&&mine){audio.play('boost');if(e.kind==='orange')toast('🔥 橙色涡轮！');else if(e.kind==='rocket')toast('🚀 完美起步！');}
    if(e.type==='box'&&mine)audio.play('box');
    if(e.type==='hit')audio.play('hit');
    if(e.type==='drop'&&mine)audio.play('drop');
    if(e.type==='fire'&&mine)audio.play('fire');
    if(e.type==='lap'&&mine)audio.play('lap');
    if(e.type==='finish')audio.play('finish');
    if(e.type==='bump')audio.play('bump');
    const text=EVENT_TEXT[e.type]?.(e.seat,e);if(text)toast(text);
  }
}
let lastCount=-1;
function hud(race,me){
  const track=T.build(race.trackId);
  if(race.phase==='countdown'){const n=Math.ceil(race.countdown/1000);$('countdown').hidden=n>3||n<1;$('countdown').textContent=String(n);if(n!==lastCount&&n>=1&&n<=3){audio.play('countdown');$('countdown').classList.remove('pop');void $('countdown').offsetWidth;$('countdown').classList.add('pop');}lastCount=n;}
  else{$('countdown').hidden=!(race.phase==='racing'&&race.t<700);$('countdown').textContent='GO!';lastCount=-1;}
  if(!me)return;
  $('place').textContent=['1st','2nd','3rd'][me.place-1]||me.place+'th';$('place').dataset.place=me.place;
  $('lap').textContent='圈 '+Math.max(1,Math.min(race.laps,me.lap||1))+' / '+race.laps;
  $('time').textContent=fmt(me.finishedAt||race.t);
  $('speed').textContent=String(Math.round(Math.abs(me.speed)*3.6));
  const rolling=me.item&&me.rolling;$('item-slot').dataset.state=rolling?'rolling':me.item?'ready':'empty';
  $('item-icon').textContent=rolling?['🍄','🍌','🧶'][Math.floor(performance.now()/90)%3]:ITEM_ICON[me.item]||'';
  $('item-name').textContent=rolling?'抽取中…':me.item?ITEM_NAME[me.item]+' · E 使用':'道具箱';
  $('charge').style.width=Math.min(100,(me.charge||0)/1.9*100)+'%';$('charge').dataset.level=me.charge>=1.9?'2':me.charge>=.9?'1':'0';$('drift-meter').hidden=!me.drift;
  $('wrong-way').hidden=true;
  const peer=view.players.find(p=>p.seat!==view.you);
  $('banner').hidden=!(transport?.role()!=='solo'&&(connection!=='connected'||peer&&!peer.connected));
  $('banner').textContent=connection==='closed'?'联机已结束':'搭子连接中断，TA 的车会先滑行…';
  minimap(track,race);
}
const mm=$('minimap'),mg=mm.getContext('2d');let mmTrack=null,mmBox=null;
function minimap(track,race){
  const w=mm.width,h=mm.height;
  if(mmTrack!==track.id){mmTrack=track.id;let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(let i=0;i<track.N;i++){x0=Math.min(x0,track.x[i]);x1=Math.max(x1,track.x[i]);z0=Math.min(z0,track.z[i]);z1=Math.max(z1,track.z[i]);}const s=Math.min((w-24)/(x1-x0),(h-24)/(z1-z0));mmBox={x0,z0,s,ox:(w-(x1-x0)*s)/2,oz:(h-(z1-z0)*s)/2};}
  const P=(x,z)=>[w-(mmBox.ox+(x-mmBox.x0)*mmBox.s),mmBox.oz+(z-mmBox.z0)*mmBox.s];
  mg.clearRect(0,0,w,h);mg.lineJoin='round';
  for(const [lw,c] of [[9,'rgba(255,255,255,.9)'],[5,'rgba(60,56,80,.85)']]){mg.beginPath();for(let i=0;i<=track.N;i+=3){const [x,y]=P(track.x[i%track.N],track.z[i%track.N]);i?mg.lineTo(x,y):mg.moveTo(x,y);}mg.closePath();mg.lineWidth=lw;mg.strokeStyle=c;mg.stroke();}
  const [sx,sy]=P(track.x[0],track.z[0]);mg.fillStyle='#fff';mg.fillRect(sx-4,sy-4,8,8);
  for(const k of race.karts){const p=view.players.find(q=>q.seat===k.seat),[x,y]=P(k.x,k.z);mg.beginPath();mg.arc(x,y,k.seat===view.you?7:5.5,0,7);mg.fillStyle=p?.color||'#fff';mg.fill();mg.lineWidth=2.5;mg.strokeStyle='#fff';mg.stroke();}
}

// ---------- award ceremony ----------
function assetFor(p){
  if(p.seat===view.you)return {asset:driver.asset,fallback:driver.fallback};
  if(p.ai)return {asset:cpuAsset(p)};
  return {asset:peerAssets.get(p.signature)||{kind:'toy',species:'mouse',color:p.color}};
}
function startCeremony(race){
  ceremonyFor=view.raceNo;audio.play('drumroll');
  const podium=[...race.karts].sort((a,b)=>a.place-b.place).slice(0,3).map(k=>{const p=view.players.find(x=>x.seat===k.seat)||{seat:k.seat,name:'车手',color:'#999'};return {seat:k.seat,place:k.place,name:p.name,...assetFor(p)};});
  void world.startCeremony({podium}).catch(e=>{console.warn('ceremony failed',e);world.stopCeremony();renderMenus();});
  renderMenus();
}
world.onCeremonySound=n=>audio.play(n);
$('skip-ceremony').addEventListener('click',()=>{world.skipCeremony();});

// ---------- frame loop ----------
function frame(now){
  window.__rafCount=(window.__rafCount||0)+1;
  const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;
  const input=readInput();
  if(transport&&mode==='race')transport.setInput(input);else if(transport)transport.setInput({steer:0,throttle:input.throttle,brake:0,drift:0,item:itemCount});
  const role=transport?.role();
  if(role==='host'||role==='solo'){const v=transport.peek();if(v){view=v;if(v.race&&v.raceNo!==lastRaceNo){lastRaceNo=v.raceNo;lastEventSeq=0;}}}
  const race=view?.race,states={};
  if(race){
    for(const k of race.karts)states[k.seat]=k;
    if(role==='guest'){
      if(pred&&race.phase==='racing'){S.stepKart(pred,input,dt,T.build(race.trackId),true);states[view.you]=pred;}
      for(const r of remoteStates())states[r.seat]=r;
    }
    processEvents(race);
    if(race.phase==='results'&&ceremonyFor!==view.raceNo)startCeremony(race);
    if(race.phase!=='results'&&world.ceremonyActive){world.stopCeremony();ceremonyFor=-1;}
    const newMode=race.phase==='results'?(world.ceremonyActive&&!world.ceremonyDone?'ceremony':'results'):race.phase==='grid'?'lobby':'race';if(newMode!==mode)renderMenus();
    hud(race,states[view.you]);
    const me=states[view.you];if(me&&mode==='race')audio.engine(me.speed,input.throttle,me.boost>0);else audio.silence();
  }
  world.update({race,states,you:view?.you??0,dt,phase:race?.phase});
  requestAnimationFrame(frame);
}

// ---------- boot ----------
Object.defineProperty(window,'__kart',{value:{
  get state(){return {mode,connection,view:view?structuredClone(view):null,driver:driver&&{...driver.profile},pred:pred&&{...pred},input:readInput()};},
  world:()=>world.diagnostics(),transport:()=>transport?.diagnostics()||null,
}});
async function boot(){
  show('title-panel');$('swap').open=!sdk?.character;renderDriverCard();
  const cached=await C.loadDriver('last');
  // Show a driver immediately; never leave the card blank while consent is pending.
  await setDriver(cached||await C.toyDriver('mouse'),{remember:false});
  if(sdk?.character?.getCurrent)await readPet();
  else if(cached)await setDriver(cached,{remember:false});
  $('env-note').textContent=sdk?.sessions?'从桌宠打开：可以读取当前形象，也可以通过桌宠「发送并一起玩」联机。':'普通浏览器：可单人对战电脑、导入角色；双人联机需通过桌宠发送并一起玩。';
  await joinInvitation();
  renderMenus();
}
world.setTrack('cheese');
requestAnimationFrame(frame);
addEventListener('beforeunload',()=>{transport?.dispose();audio.dispose();world.destroy();});
void boot();
