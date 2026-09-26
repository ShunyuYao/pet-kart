// Podium award ceremony, rendered in real time on its own stage inside the world.
// Pure presentation: it receives the final places and never changes results.
import * as THREE from '../vendor/lib/three.module.js';
import {buildAvatar} from './avatars.js';

export const CEREMONY_MS=8200;
const STAGE=new THREE.Vector3(0,0,1600);           // far from both tracks; fog hides the circuit
const STEPS={1:{x:0,h:2.2,c:'#ffd24a'},2:{x:-3.4,h:1.5,c:'#d7dde8'},3:{x:3.4,h:1.0,c:'#e2a36b'}};
const DROP_AT={3:.6,2:1.6,1:2.8};                  // seconds: 3rd lands first, champion last
const STYLE={1:'jump',2:'wave',3:'clap'};

const tex=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;};
const easeOutBounce=x=>{const n=7.5625,d=2.75;if(x<1/d)return n*x*x;if(x<2/d)return n*(x-=1.5/d)*x+.75;if(x<2.5/d)return n*(x-=2.25/d)*x+.9375;return n*(x-=2.625/d)*x+.984375;};
const clamp01=v=>Math.max(0,Math.min(1,v));

function buildStage(trackName){
  const g=new THREE.Group();g.position.copy(STAGE);
  const std=(c,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:.55,...o});
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(14,14.6,.4,64),std('#f4efe6'));disk.position.y=.2;disk.receiveShadow=true;g.add(disk);
  const carpet=new THREE.Mesh(new THREE.PlaneGeometry(4.4,16),std('#c8283a',{roughness:.9}));carpet.rotation.x=-Math.PI/2;carpet.position.set(0,.42,6);carpet.receiveShadow=true;g.add(carpet);
  // Steps: white blocks, metal trim band, big place number on the front.
  for(const [place,s] of Object.entries(STEPS)){
    const block=new THREE.Mesh(new THREE.BoxGeometry(3.2,s.h,3),std('#ffffff',{roughness:.35}));block.position.set(s.x,.4+s.h/2,0);block.castShadow=block.receiveShadow=true;g.add(block);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(3.26,.22,3.06),std(s.c,{metalness:.8,roughness:.25}));trim.position.set(s.x,.4+s.h-.11,0);g.add(trim);
    const num=tex(256,256,(c,w,h)=>{c.fillStyle=s.c;c.beginPath();c.arc(w/2,h/2,110,0,7);c.fill();c.fillStyle='#1d1b2e';c.font='900 170px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(place,w/2,h/2+10);});
    const face=new THREE.Mesh(new THREE.CircleGeometry(.72,40),new THREE.MeshBasicMaterial({map:num,transparent:true}));face.position.set(s.x,.4+s.h/2,1.51);g.add(face);
  }
  // Curved backdrop with title.
  const banner=tex(2048,512,(c,w,h)=>{const gr=c.createLinearGradient(0,0,w,h);gr.addColorStop(0,'#3a2a8c');gr.addColorStop(.5,'#ff5a8a');gr.addColorStop(1,'#ffc93c');c.fillStyle=gr;c.fillRect(0,0,w,h);
    c.fillStyle='rgba(255,255,255,.12)';for(let i=0;i<40;i++){c.beginPath();c.arc(Math.random()*w,Math.random()*h,8+Math.random()*30,0,7);c.fill();}
    c.fillStyle='#fff';c.textAlign='center';c.font='900 150px system-ui,"PingFang SC",sans-serif';c.fillText('桌宠大奖赛 · 颁奖典礼',w/2,230);c.font='700 80px system-ui,"PingFang SC",sans-serif';c.fillText('🏁 '+trackName+' 🏁',w/2,380);});
  // Seen from inside the cylinder the texture is mirrored; flip it back.
  banner.wrapS=THREE.RepeatWrapping;banner.repeat.x=-1;
  const wall=new THREE.Mesh(new THREE.CylinderGeometry(16,16,8,48,1,true,-Math.PI*.36,Math.PI*.72),new THREE.MeshStandardMaterial({map:banner,side:THREE.BackSide,roughness:.8}));
  wall.rotation.y=Math.PI;wall.position.set(0,4.4,6);g.add(wall);
  // Pennant strings and balloon columns.
  const colors=['#ff5a5f','#ffc93c','#3d8bff','#22c55e','#a855f7'];
  for(const side of [-1,1]){
    for(let i=0;i<14;i++){const b=new THREE.Mesh(new THREE.SphereGeometry(.55,16,12),std(colors[i%5],{roughness:.25}));b.position.set(side*(8.2+Math.sin(i)*.3),.9+i*.62,1+Math.cos(i*1.7)*.35);b.scale.y=1.18;b.castShadow=true;g.add(b);}
  }
  for(let i=0;i<22;i++){const f=new THREE.Mesh(new THREE.ConeGeometry(.35,.8,3),std(colors[i%5],{side:THREE.DoubleSide}));const x=-8+i*16/21;f.position.set(x,8.3-Math.sin(i/21*Math.PI)*1.2,-2.5);f.rotation.set(Math.PI,0,0);g.add(f);}
  return g;
}
function makeTrophy(){
  const gold=new THREE.MeshStandardMaterial({color:'#ffcf3a',metalness:1,roughness:.18,emissive:'#6a4a00',emissiveIntensity:.35});
  const g=new THREE.Group();
  const cup=new THREE.Mesh(new THREE.LatheGeometry([[0,0],[.18,0],[.2,.06],[.08,.14],[.07,.34],[.14,.4],[.36,.56],[.42,.86],[.44,1],[.4,1.02]].map(([x,y])=>new THREE.Vector2(x,y)),36),gold);g.add(cup);
  for(const s of [-1,1]){const h=new THREE.Mesh(new THREE.TorusGeometry(.17,.035,10,24,Math.PI*1.2),gold);h.position.set(s*.44,.74,0);h.rotation.z=s>0?-Math.PI*.6:Math.PI*1.6;g.add(h);}
  const base=new THREE.Mesh(new THREE.BoxGeometry(.5,.14,.5),new THREE.MeshStandardMaterial({color:'#2b2238',roughness:.4}));base.position.y=-.07;g.add(base);
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});g.scale.setScalar(.9);return g;
}
function makeConfetti(n=420){
  const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(.14,.24),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),n);
  mesh.frustumCulled=false;const colors=['#ff5a5f','#ffc93c','#3d8bff','#22c55e','#a855f7','#ffffff','#ff8fc2'].map(c=>new THREE.Color(c));
  const parts=Array.from({length:n},(_,i)=>({p:new THREE.Vector3(),v:new THREE.Vector3(),r:new THREE.Euler(),w:new THREE.Vector3(),live:false,phase:Math.random()*6}));
  parts.forEach((_,i)=>mesh.setColorAt(i,colors[i%colors.length]));
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),one=new THREE.Vector3(1,1,1),hidden=new THREE.Matrix4().makeScale(0,0,0);
  let next=0;
  return {mesh,
    burst(origin,count,power=9){for(let k=0;k<count;k++){const p=parts[next];next=(next+1)%n;p.live=true;p.p.copy(origin);
      const a=Math.random()*Math.PI*2,up=.55+Math.random()*.6;p.v.set(Math.cos(a)*power*(1-up)*1.4,power*up,Math.sin(a)*power*(1-up)*1.4);
      p.w.set(Math.random()*9,Math.random()*9,Math.random()*9);}},
    update(dt){parts.forEach((p,i)=>{if(!p.live){mesh.setMatrixAt(i,hidden);return;}
      p.v.y=Math.max(p.v.y-9*dt,-2.2);p.v.x*=Math.pow(.35,dt);p.v.z*=Math.pow(.35,dt);p.phase+=dt*3;
      p.p.addScaledVector(p.v,dt);p.p.x+=Math.sin(p.phase)*dt*.6;if(p.p.y<.45){p.p.y=.45;p.v.set(0,0,0);p.w.set(0,0,0);}
      p.r.x+=p.w.x*dt;p.r.y+=p.w.y*dt;p.r.z+=p.w.z*dt;q.setFromEuler(p.r);m.compose(p.p,q,one);mesh.setMatrixAt(i,m);});
      mesh.instanceMatrix.needsUpdate=true;},
    reset(){parts.forEach(p=>{p.live=false;});},
    get live(){return parts.filter(p=>p.live).length;}};
}
function makeFireworks(n=900){
  const geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*3);
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  const points=new THREE.Points(geo,new THREE.PointsMaterial({size:.55,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));points.frustumCulled=false;
  const parts=Array.from({length:n},()=>({life:0,max:1,p:new THREE.Vector3(),v:new THREE.Vector3(),c:new THREE.Color()}));let next=0;
  return {points,
    burst(origin,color){const c=new THREE.Color(color);for(let k=0;k<110;k++){const p=parts[next];next=(next+1)%n;const u=Math.random()*2-1,a=Math.random()*Math.PI*2,r=Math.sqrt(1-u*u),sp=6+Math.random()*3;
      p.p.copy(origin);p.v.set(r*Math.cos(a)*sp,u*sp,r*Math.sin(a)*sp);p.max=p.life=1.1+Math.random()*.5;p.c.copy(c).lerp(new THREE.Color('#ffffff'),Math.random()*.35);}},
    update(dt){parts.forEach((p,i)=>{if(p.life>0){p.life-=dt;p.v.y-=4*dt;p.v.multiplyScalar(Math.pow(.4,dt));p.p.addScaledVector(p.v,dt);}
      const a=Math.max(0,p.life/p.max);pos[i*3]=p.p.x;pos[i*3+1]=p.life>0?p.p.y:-999;pos[i*3+2]=p.p.z;col[i*3]=p.c.r*a;col[i*3+1]=p.c.g*a;col[i*3+2]=p.c.b*a;});
      geo.attributes.position.needsUpdate=true;geo.attributes.color.needsUpdate=true;},
    get live(){return parts.filter(p=>p.life>0).length;}};
}
function label(text,color){
  const t=tex(512,128,(c,w,h)=>{c.font='800 54px system-ui,"PingFang SC",sans-serif';const tw=Math.min(w-10,c.measureText(text).width+60);c.fillStyle='rgba(20,18,40,.78)';c.beginPath();c.roundRect((w-tw)/2,16,tw,92,46);c.fill();c.strokeStyle=color;c.lineWidth=6;c.stroke();c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,64,w-40);});
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false}));s.scale.set(3.4,.85,1);s.renderOrder=12;return s;
}

export function createCeremony({scene,camera,sun,onSound=()=>{}}){
  let ready=false,skipped=false,startWall=0,group=null,actors=[],trophy=null,confetti=null,fireworks=null,spots=[],clock=0,active=false,token=0,lastFire=0,sounds=new Set();
  function dispose(){
    if(!group)return;scene.remove(group);
    group.traverse(o=>{o.geometry?.dispose?.();[].concat(o.material||[]).forEach(m=>{m.map?.dispose?.();m.dispose?.();});});
    actors.forEach(a=>a.avatar.dispose?.());group=null;actors=[];trophy=null;confetti=null;fireworks=null;spots=[];
  }
  async function start({trackName,podium}){
    const my=++token;dispose();active=true;ready=false;skipped=false;clock=0;lastFire=0;sounds.clear();
    group=buildStage(trackName);scene.add(group);
    for(const place of [1,2,3]){const sp=new THREE.SpotLight(STEPS[place].c==='#ffd24a'?'#fff2c0':'#ffffff',0,40,Math.PI/9,.5,1.2);
      sp.position.set(STEPS[place].x,16,8);sp.target.position.set(STEPS[place].x,2,0);group.add(sp,sp.target);spots[place]=sp;}
    trophy=makeTrophy();trophy.visible=false;const glow=new THREE.PointLight('#ffe7a0',30,6,1.6);glow.position.set(.6,.8,1.4);trophy.add(glow);group.add(trophy);
    confetti=makeConfetti();group.add(confetti.mesh);fireworks=makeFireworks();group.add(fireworks.points);
    // Build every standing driver before the show starts so all three drop on cue.
    const built=await Promise.all(podium.map(async d=>({...d,avatar:await buildAvatar(d.asset,d.fallback,{standing:true})})));
    if(my!==token){built.forEach(b=>b.avatar.dispose?.());return;}
    for(const d of built){
      const s=STEPS[d.place];if(!s)continue;const holder=new THREE.Group();holder.add(d.avatar.object);
      holder.position.set(s.x,.4+s.h,0);holder.visible=false;d.avatar.object.traverse(o=>{if(o.isMesh)o.castShadow=true;});
      const tag=label(['🥇','🥈','🥉'][d.place-1]+' '+d.name,s.c);tag.position.set(0,(d.avatar.height||1.8)+(d.place===1?2.3:.9),0);holder.add(tag);
      group.add(holder);actors.push({...d,holder,top:.4+s.h});
    }
    ready=true;startWall=performance.now()-(skipped?CEREMONY_MS:0);
  }
  function skip(){if(!active)return;skipped=true;if(ready)startWall=Math.min(startWall,performance.now()-CEREMONY_MS);}
  function update(dt){
    if(!active||!group)return false;
    // The timeline follows the wall clock from the moment every driver is built, so a
    // throttled or occluded window still finishes on time; dt only drives particles.
    if(ready)clock=(performance.now()-startWall)/1000;const t=clock;
    for(const a of actors){
      const at=DROP_AT[a.place],k=clamp01((t-at)/.75);a.holder.visible=t>=at;
      a.holder.position.y=a.top+(1-easeOutBounce(k))*9;a.holder.rotation.y=(1-k)*Math.PI*2;
      if(t>=at+.55&&!sounds.has('land'+a.place)){sounds.add('land'+a.place);onSound(a.place===1?'champion':'land');
        confetti.burst(new THREE.Vector3(STEPS[a.place].x,a.top+1,0),a.place===1?160:50,a.place===1?11:7);}
      const cheer=clamp01((t-at-.7)/.6);a.avatar.update(dt,{t:t*1,style:k<1?'wave':STYLE[a.place],cheer});
      spots[a.place].intensity+=(((t>=at)?(a.place===1?260:170):0)-spots[a.place].intensity)*Math.min(1,dt*6);
    }
    // Trophy descends onto the champion and hovers above their head.
    const champ=actors.find(a=>a.place===1);
    if(champ&&t>DROP_AT[1]+.4){trophy.visible=true;const k=clamp01((t-DROP_AT[1]-.4)/1.2),top=champ.top+(champ.avatar.height||1.8)+.55;
      trophy.position.set(0,top+(1-(1-Math.pow(1-k,3)))*7+Math.sin(t*3)*.06,0);trophy.rotation.y+=dt*1.6;}
    if(t>DROP_AT[1]+.3&&t-lastFire>.45){lastFire=t;const pal=['#ff5a8a','#ffd24a','#5ad1ff','#9dff7a','#c38bff'];
      fireworks.burst(new THREE.Vector3((Math.random()-.5)*16,10+Math.random()*6,-3-Math.random()*4),pal[Math.floor(Math.random()*5)]);if(Math.random()<.5)onSound('pop');}
    confetti.update(dt);fireworks.update(dt);
    // Camera: wide establishing → push-in on the champion → slow orbit.
    const push=clamp01((t-DROP_AT[1]-.2)/1.8),orbit=Math.sin(Math.max(0,t-4.2)*.35)*.42;
    const dist=19-push*7,height=5.2-push*.8,focus=2.6+push*.4;
    camera.position.set(STAGE.x+Math.sin(orbit)*dist,STAGE.y+height,STAGE.z+Math.cos(orbit)*dist);
    camera.lookAt(STAGE.x,STAGE.y+focus,STAGE.z);camera.fov=50;camera.updateProjectionMatrix();
    sun.position.set(STAGE.x+20,STAGE.y+40,STAGE.z+30);sun.target.position.copy(STAGE);
    return true;
  }
  return {start,update,skip,stop(){token++;active=false;dispose();},
    get active(){return active;},get done(){return active&&ready&&clock>=CEREMONY_MS/1000;},
    diagnostics:()=>({active,ready,t:Math.round(clock*1000),actors:actors.map(a=>({seat:a.seat,place:a.place,kind:a.avatar.kind,visible:a.holder.visible,y:+a.holder.position.y.toFixed(2),top:a.top})),
      trophy:!!trophy?.visible,confetti:confetti?.live||0,fireworks:fireworks?.live||0})};
}
