// Three.js world: track, scenery, karts, items and effects. Pure presentation —
// it never decides game outcomes; it draws whatever the room/prediction says.
import * as THREE from '../vendor/lib/three.module.js';
import T from '../game/track.cjs';
import {buildAvatar} from './avatars.js';
import {createCeremony} from './ceremony.js';

const canvasTex=(w,h,draw,{repeat,srgb=true}={})=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);if(srgb)t.colorSpace=THREE.SRGBColorSpace;if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(...repeat);}t.anisotropy=4;return t;};
function noise(g,w,h,base,spread,n=4000,size=2){g.fillStyle=base;g.fillRect(0,0,w,h);for(let i=0;i<n;i++){const v=(Math.random()-.5)*spread;g.fillStyle=`rgba(${v>0?255:0},${v>0?255:0},${v>0?255:0},${Math.abs(v)})`;g.fillRect(Math.random()*w,Math.random()*h,size,size);}}

function ribbon(track,from,to,y0,{vScale=8,closed=true,step=1,height=0}={}){
  // Strip between lateral offsets `from`..`to` (or a vertical wall when height>0).
  const pos=[],uv=[],idx=[],N=track.N;let row=0;
  for(let i=0;i<=N;i+=step){
    const s=i%N,a=T.at(track,s,from),b=T.at(track,s,to);
    if(height){pos.push(a.x,a.y+y0,a.z,a.x,a.y+y0+height,a.z);}else pos.push(a.x,a.y+y0,a.z,b.x,b.y+y0,b.z);
    uv.push(0,i/vScale,1,i/vScale);
    if(row>0){const k=row*2;idx.push(k-2,k,k-1,k-1,k,k+1);}row++;
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}

function makeKart(color,number){
  const g=new THREE.Group(),paint=new THREE.MeshStandardMaterial({color,roughness:.35,metalness:.25}),dark=new THREE.MeshStandardMaterial({color:'#24222b',roughness:.8}),chrome=new THREE.MeshStandardMaterial({color:'#dfe4ee',roughness:.25,metalness:.8});
  const box=(w,h,d,m,p,r)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(...p);if(r)o.rotation.set(...r);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;};
  box(1.25,.26,2.0,paint,[0,.36,0]);box(.28,.3,1.25,paint,[.76,.36,-.05]);box(.28,.3,1.25,paint,[-.76,.36,-.05]);
  box(.95,.22,.75,paint,[0,.4,1.05],[.18,0,0]);box(1.5,.14,.18,dark,[0,.26,1.35]);box(1.5,.18,.2,dark,[0,.34,-1.12]);
  box(.8,.42,.12,dark,[0,.66,-.66],[-.25,0,0]);box(.8,.1,.55,dark,[0,.52,-.35]);box(1.2,.08,.35,paint,[0,.98,-1.05]);box(.08,.35,.08,dark,[.45,.8,-1.02]);box(.08,.35,.08,dark,[-.45,.8,-1.02]);
  const col=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.5),dark);col.position.set(0,.64,.38);col.rotation.x=-.9;g.add(col);
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(.19,.035,8,20),dark);wheel.position.set(0,.8,.16);wheel.rotation.x=-.75;g.add(wheel);
  const wheels=[];
  for(const [x,z,front] of [[.82,.78,1],[-.82,.78,1],[.84,-.78,0],[-.84,-.78,0]]){
    const pivot=new THREE.Group();pivot.position.set(x,.34,z);g.add(pivot);
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(front?.3:.36,front?.3:.36,front?.26:.34,20),dark);tire.rotation.z=Math.PI/2;tire.castShadow=true;pivot.add(tire);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,(front?.26:.34)+.02,12),chrome);hub.rotation.z=Math.PI/2;tire.add(hub);hub.rotation.z=0;
    wheels.push({pivot,tire,front});
  }
  const flames=[];
  for(const x of [.22,-.22]){
    const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.07,.08,.3,10),chrome);pipe.rotation.x=Math.PI/2;pipe.position.set(x,.52,-1.2);g.add(pipe);
    const flame=new THREE.Mesh(new THREE.ConeGeometry(.12,.7,10,1,true),new THREE.MeshBasicMaterial({color:'#ffb347',transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    flame.rotation.x=-Math.PI/2;flame.position.set(x,.52,-1.6);flame.visible=false;g.add(flame);flames.push(flame);
  }
  const plate=canvasTex(128,128,(c)=>{c.fillStyle='#fff';c.beginPath();c.arc(64,64,58,0,7);c.fill();c.fillStyle='#222';c.font='bold 84px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(String(number),64,70);});
  const num=new THREE.Mesh(new THREE.CircleGeometry(.2,24),new THREE.MeshBasicMaterial({map:plate}));num.position.set(0,.53,1.33);num.rotation.x=-.3;g.add(num);
  return {group:g,wheels,flames,wheel};
}
function banana(){const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:'#ffd93b',roughness:.5});const arc=new THREE.Mesh(new THREE.TorusGeometry(.42,.13,10,18,Math.PI*.9),m);arc.rotation.set(0,0,Math.PI*1.05);arc.position.y=.55;arc.castShadow=true;g.add(arc);
  for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.ConeGeometry(.12,.35,8),m);p.position.set(s*.38,.2,0);p.rotation.z=s*.9;g.add(p);}const tip=new THREE.Mesh(new THREE.SphereGeometry(.06),new THREE.MeshStandardMaterial({color:'#5b3a1a'}));tip.position.set(-.33,.9,0);g.add(tip);return g;}
function yarnBall(){const t=canvasTex(128,64,(c,w,h)=>{c.fillStyle='#ff6fa8';c.fillRect(0,0,w,h);c.strokeStyle='#ffc1dc';c.lineWidth=4;for(let i=-4;i<12;i++){c.beginPath();c.moveTo(i*14,0);c.bezierCurveTo(i*14+20,20,i*14-10,44,i*14+16,h);c.stroke();}});
  const m=new THREE.Mesh(new THREE.SphereGeometry(.6,20,14),new THREE.MeshStandardMaterial({map:t,roughness:.9}));m.castShadow=true;return m;}

export function createWorld(canvas){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(68,1,.1,1400);
  const hemi=new THREE.HemisphereLight('#ffffff','#7fbf6a',1.25);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#fff4de',2.1);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:260});sun.shadow.bias=-.0006;scene.add(sun,sun.target);
  let trackGroup=null,track=null,boxes=[],pads=[],theme=null;
  const karts=new Map(),hazards=new Map(),projectiles=new Map(),sparks=makeSparks();scene.add(sparks.points);
  const tagCache=new Map();
  let onCeremonySound=()=>{};
  const ceremony=createCeremony({scene,camera,sun,onSound:n=>onCeremonySound(n)});

  function setTrack(id){
    if(track?.id===id)return;
    if(trackGroup){scene.remove(trackGroup);trackGroup.traverse(o=>{o.geometry?.dispose();if(o.material){[].concat(o.material).forEach(m=>{m.map?.dispose();m.dispose();});}});}
    track=T.build(id);theme=track.theme;trackGroup=new THREE.Group();scene.add(trackGroup);
    scene.background=canvasTex(8,256,(c,w,h)=>{const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,theme.sky[0]);g.addColorStop(.55,theme.sky[1]);g.addColorStop(1,'#ffffff');c.fillStyle=g;c.fillRect(0,0,w,h);});
    scene.fog=new THREE.Fog(theme.sky[1],140,520);hemi.groundColor.set(new THREE.Color(theme.grass).lerp(new THREE.Color('#fff1e0'),.7));
    const grass=canvasTex(256,256,(c,w,h)=>{noise(c,w,h,theme.grass,.10,6000,3);c.fillStyle=theme.grass2;for(let y=0;y<h;y+=64)c.fillRect(0,y,w,32);},{repeat:[280,280]});
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(5000,5000),new THREE.MeshStandardMaterial({map:grass,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;ground.receiveShadow=true;trackGroup.add(ground);
    const road=canvasTex(256,256,(c,w,h)=>{noise(c,w,h,theme.road,.12,9000,2);c.fillStyle='rgba(255,255,255,.9)';c.fillRect(10,0,6,h);c.fillRect(w-16,0,6,h);c.fillStyle='rgba(255,255,255,.55)';c.fillRect(w/2-3,0,6,h/2);},{});
    road.wrapT=THREE.RepeatWrapping;
    const roadMesh=new THREE.Mesh(ribbon(track,-track.half,track.half,.03,{vScale:8}),new THREE.MeshStandardMaterial({map:road,roughness:.85,side:THREE.DoubleSide}));roadMesh.receiveShadow=true;trackGroup.add(roadMesh);
    const curb=canvasTex(16,64,(c,w,h)=>{c.fillStyle=theme.curbA;c.fillRect(0,0,w,h/2);c.fillStyle=theme.curbB;c.fillRect(0,h/2,w,h/2);});curb.wrapT=THREE.RepeatWrapping;
    const sand=canvasTex(128,128,(c,w,h)=>noise(c,w,h,'#e9d3a0',.12,3000,2));sand.wrapS=sand.wrapT=THREE.RepeatWrapping;
    for(const s of [-1,1]){
      const cm=new THREE.Mesh(ribbon(track,s*track.half,s*(track.half+1.3),.05,{vScale:3}),new THREE.MeshStandardMaterial({map:curb,roughness:.7,side:THREE.DoubleSide}));cm.receiveShadow=true;trackGroup.add(cm);
      const sm=new THREE.Mesh(ribbon(track,s*(track.half+1.3),s*track.wall,.02,{vScale:6}),new THREE.MeshStandardMaterial({map:sand,roughness:1,side:THREE.DoubleSide}));sm.receiveShadow=true;trackGroup.add(sm);
      const wall=canvasTex(64,32,(c,w,h)=>{c.fillStyle='#ffffff';c.fillRect(0,0,w,h);c.fillStyle=theme.accent;c.fillRect(0,0,w/2,h);c.fillStyle='rgba(0,0,0,.18)';c.fillRect(0,h-5,w,5);});wall.wrapS=wall.wrapT=THREE.RepeatWrapping;
      const wm=new THREE.Mesh(ribbon(track,s*(track.wall+.4),0,0,{vScale:4,height:1.1}),new THREE.MeshStandardMaterial({map:wall,roughness:.6,side:THREE.DoubleSide}));wm.castShadow=true;trackGroup.add(wm);
    }
    // Bridge pillars where the road is lifted (figure-eight).
    const pillarM=new THREE.MeshStandardMaterial({color:'#d9cfe6',roughness:.8});
    for(let i=0;i<track.N;i+=10)if(track.y[i]>1.4)for(const s of [-1,1]){
      const p=T.at(track,i,s*(track.half+.4));
      let clear=true;for(let j=0;j<track.N;j+=3)if(track.y[j]<1&&Math.hypot(track.x[j]-p.x,track.z[j]-p.z)<track.wall+1.5){clear=false;break;}
      if(!clear)continue;const m=new THREE.Mesh(new THREE.CylinderGeometry(.45,.55,p.y,10),pillarM);m.position.set(p.x,p.y/2,p.z);m.castShadow=true;trackGroup.add(m);
    }
    // Start/finish: checkered strip + gantry.
    const check=canvasTex(128,32,(c,w,h)=>{for(let x=0;x<16;x++)for(let y=0;y<4;y++){c.fillStyle=(x+y)%2?'#111':'#fff';c.fillRect(x*8,y*8,8,8);}});
    const s0=T.at(track,0),line=new THREE.Mesh(new THREE.PlaneGeometry(track.width,2.2),new THREE.MeshStandardMaterial({map:check,roughness:.8}));line.rotation.set(-Math.PI/2,0,s0.yaw+Math.PI);line.position.set(s0.x,s0.y+.05,s0.z);line.receiveShadow=true;trackGroup.add(line);
    const gantry=new THREE.Group(),postM=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.5});
    for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,7.5,12),postM);p.position.set(s*(track.half+2),3.75,0);p.castShadow=true;gantry.add(p);}
    const banner=canvasTex(1024,128,(c,w,h)=>{const g=c.createLinearGradient(0,0,w,0);g.addColorStop(0,theme.curbA);g.addColorStop(1,theme.accent);c.fillStyle=g;c.fillRect(0,0,w,h);c.fillStyle='#fff';c.font='900 76px system-ui,"PingFang SC",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('桌宠大奖赛 · '+track.name,w/2,h/2+4);});
    const board=new THREE.Mesh(new THREE.BoxGeometry(track.width+5,1.7,.4),[postM,postM,postM,postM,new THREE.MeshBasicMaterial({map:banner}),new THREE.MeshBasicMaterial({map:banner})]);board.position.y=7;board.castShadow=true;gantry.add(board);
    gantry.position.set(s0.x,s0.y,s0.z);gantry.rotation.y=s0.yaw;trackGroup.add(gantry);
    // Boost pads.
    pads=track.pads.map(p=>{const t=canvasTex(64,128,(c,w,h)=>{c.fillStyle='#1a1440';c.fillRect(0,0,w,h);c.fillStyle='#39f0ff';for(let y=0;y<h;y+=42){c.beginPath();c.moveTo(8,y+34);c.lineTo(w/2,y+6);c.lineTo(w-8,y+34);c.lineTo(w-20,y+34);c.lineTo(w/2,y+18);c.lineTo(20,y+34);c.fill();}});t.wrapT=THREE.RepeatWrapping;
      const a=T.at(track,p.s+p.len/2,p.lat),m=new THREE.Mesh(new THREE.PlaneGeometry(p.w,p.len),new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:.95}));m.rotation.set(-Math.PI/2,0,a.yaw+Math.PI);m.position.set(a.x,a.y+.06,a.z);trackGroup.add(m);return t;});
    // Item boxes (3 per row).
    const qTex=canvasTex(128,128,(c,w,h)=>{const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#ffe36e');g.addColorStop(.5,'#ff7ad9');g.addColorStop(1,'#6ee7ff');c.fillStyle=g;c.fillRect(0,0,w,h);c.fillStyle='rgba(255,255,255,.95)';c.font='900 92px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText('?',w/2,h/2+6);c.strokeStyle='#fff';c.lineWidth=8;c.strokeRect(4,4,w-8,h-8);});
    const boxM=new THREE.MeshStandardMaterial({map:qTex,transparent:true,opacity:.88,emissive:'#ffffff',emissiveIntensity:.25,roughness:.3});
    boxes=[];for(const s of track.boxes)for(const lat of [-5,0,5]){const p=T.at(track,s,lat),m=new THREE.Mesh(new THREE.BoxGeometry(1.3,1.3,1.3),boxM);m.position.set(p.x,p.y+1.1,p.z);m.castShadow=true;trackGroup.add(m);boxes.push(m);}
    scenery(track);
  }
  function scenery(track){
    // Deterministic decoration placed outside the fence.
    let seed=track.N*7919;const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
    const clear=(x,z,m)=>{for(let j=0;j<track.N;j+=4)if(Math.hypot(track.x[j]-x,track.z[j]-z)<track.wall+m)return false;return true;};
    const trunk=new THREE.MeshStandardMaterial({color:'#8a5a3b',roughness:1}),leaves=['#3fae5a','#57c46b','#2f9a52'].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.9,flatShading:true}));
    const cheeseM=new THREE.MeshStandardMaterial({color:'#ffcf4a',roughness:.6}),holeM=new THREE.MeshStandardMaterial({color:'#e8a92a'});
    const yarnCols=['#ff7fb0','#8f6bff','#50c8ff','#ffd166'];
    let placed=0;
    for(let n=0;n<900&&placed<150;n++){
      const x=(rnd()-.5)*520,z=(rnd()-.5)*520;if(!clear(x,z,4))continue;placed++;
      const kind=rnd();const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rnd()*6.28;
      if(kind<.62){const h=4+rnd()*5;const t=new THREE.Mesh(new THREE.CylinderGeometry(.35,.5,h*.4,8),trunk);t.position.y=h*.2;g.add(t);
        for(let k=0;k<3;k++){const c=new THREE.Mesh(new THREE.ConeGeometry(h*.34-k*.4,h*.45,8),leaves[(n+k)%3]);c.position.y=h*.45+k*h*.2;c.castShadow=true;g.add(c);}}
      else if(track.id==='cheese'){const w=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.5,2.6,3,1,false,0,Math.PI*.6),cheeseM);w.position.y=1.3;w.castShadow=true;g.add(w);for(let k=0;k<3;k++){const h=new THREE.Mesh(new THREE.SphereGeometry(.35+rnd()*.3,10,8),holeM);h.position.set(rnd()*1.6,1+rnd()*1.2,1.2+rnd());g.add(h);}}
      else{const r=1.3+rnd()*2;const b=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),new THREE.MeshStandardMaterial({color:yarnCols[n%4],roughness:1}));b.position.y=r;b.castShadow=true;g.add(b);
        const band=new THREE.Mesh(new THREE.TorusGeometry(r*1.001,.08,6,30),new THREE.MeshStandardMaterial({color:'#ffffff'}));band.position.y=r;band.rotation.x=rnd()*3;g.add(band);}
      trackGroup.add(g);
    }
    const cloudM=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,transparent:true,opacity:.92});
    for(let i=0;i<18;i++){const c=new THREE.Group();for(let k=0;k<4;k++){const b=new THREE.Mesh(new THREE.SphereGeometry(6+rnd()*6,12,10),cloudM);b.position.set(k*7-10,rnd()*3,rnd()*4);c.add(b);}const a=rnd()*6.28,r=260+rnd()*200;c.position.set(Math.cos(a)*r,60+rnd()*50,Math.sin(a)*r);trackGroup.add(c);}
  }
  function nameTag(text,color){
    const key=text+color;if(tagCache.has(key))return tagCache.get(key);
    const t=canvasTex(512,112,(c,w,h)=>{c.font='800 50px system-ui,"PingFang SC",sans-serif';const tw=Math.min(w-20,c.measureText(text).width+56);c.fillStyle='rgba(20,18,40,.72)';c.beginPath();c.roundRect((w-tw)/2,14,tw,80,40);c.fill();c.fillStyle=color;c.beginPath();c.arc((w-tw)/2+34,54,12,0,7);c.fill();c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2+12,56,w-80);});
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true,sizeAttenuation:false}));s.scale.set(.2,.044,1);s.renderOrder=10;tagCache.set(key,s);return s;
  }
  async function setDriver(seat,{profile,asset,fallback}){
    let k=karts.get(seat);
    if(k&&k.signature===profile.signature&&k.color===profile.color&&k.name===profile.name)return;
    if(!k){k={seat};karts.set(seat,k);}
    const token=Symbol();k.token=token;
    const avatar=await buildAvatar(asset,fallback);
    if(k.token!==token){avatar.dispose?.();return;}
    if(k.root)scene.remove(k.root);k.avatar?.dispose?.();
    const kart=makeKart(profile.color,seat+1),root=new THREE.Group(),body=new THREE.Group();
    root.add(body);body.add(kart.group);body.add(avatar.object);scene.add(root);
    const stars=new THREE.Group();for(let i=0;i<3;i++){const s=new THREE.Mesh(new THREE.OctahedronGeometry(.16),new THREE.MeshBasicMaterial({color:'#ffe066'}));s.position.set(Math.cos(i*2.1)*.6,0,Math.sin(i*2.1)*.6);stars.add(s);}stars.position.y=2.2;stars.visible=false;body.add(stars);
    const tag=nameTag(profile.name,profile.color);tag.position.y=2.75;root.add(tag);
    Object.assign(k,{root,body,kart,avatar,stars,tag,signature:profile.signature,color:profile.color,name:profile.name,kind:avatar.kind,spinVis:0,roll:0});
  }
  function removeDriver(seat){const k=karts.get(seat);if(k?.root)scene.remove(k.root);karts.delete(seat);}
  function makeSparks(){
    const N=600,geo=new THREE.BufferGeometry(),pos=new Float32Array(N*3),col=new Float32Array(N*3);
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    const points=new THREE.Points(geo,new THREE.PointsMaterial({size:.32,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));points.frustumCulled=false;
    const parts=Array.from({length:N},()=>({life:0,x:0,y:-99,z:0,vx:0,vy:0,vz:0,c:new THREE.Color()}));let next=0;
    return {points,emit(x,y,z,vx,vy,vz,color,life=.35){const p=parts[next];next=(next+1)%N;Object.assign(p,{x,y,z,vx,vy,vz,life});p.c.set(color);},
      update(dt){parts.forEach((p,i)=>{if(p.life>0){p.life-=dt;p.vy-=9*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;}const alive=p.life>0;pos[i*3]=p.x;pos[i*3+1]=alive?p.y:-99;pos[i*3+2]=p.z;col[i*3]=p.c.r;col[i*3+1]=p.c.g;col[i*3+2]=p.c.b;});geo.attributes.position.needsUpdate=true;geo.attributes.color.needsUpdate=true;}};
  }
  const cam={pos:new THREE.Vector3(),look:new THREE.Vector3(),init:false};
  let clock=0;
  function update({race,states,you,dt,phase}){
    clock+=dt;
    if(ceremony.active){for(const k of karts.values())if(k.root)k.root.visible=false;sync(hazards,[],()=>null,()=>{});sync(projectiles,[],()=>null,()=>{});sparks.update(dt);
      ceremony.update(dt);renderer.render(scene,camera);return;}
    for(const t of pads)t.offset.y-=dt*1.6;
    if(race)boxes.forEach((b,i)=>{b.visible=race.boxes[i]!==0;b.rotation.y+=dt*1.4;b.rotation.x=Math.sin(clock+i)*.25;b.position.y=T.at(track,track.boxes[Math.floor(i/3)],[-5,0,5][i%3]).y+1.1+Math.sin(clock*2+i)*.12;});
    else boxes.forEach(b=>{b.visible=true;b.rotation.y+=dt;});
    sync(hazards,race?.hazards||[],()=>banana(),(o,h)=>{o.position.set(h.x,h.y,h.z);});
    sync(projectiles,race?.projectiles||[],()=>yarnBall(),(o,p)=>{o.position.set(p.x,p.y+.6,p.z);o.rotation.x+=dt*12;});
    for(const [seat,k] of karts){
      const s=states?.[seat];if(!s||!k.root){if(k.root)k.root.visible=false;continue;}
      k.root.visible=true;
      k.root.position.set(s.x,s.y,s.z);k.root.rotation.y=s.yaw;
      k.spinVis=s.spin>0?k.spinVis+dt*14:k.spinVis*Math.pow(.001,dt);
      const driftYaw=s.drift?-s.driftDir*.38:0;k.body.rotation.y+=((driftYaw+k.spinVis)-k.body.rotation.y)*Math.min(1,dt*10);
      k.body.rotation.z=-(s.steer||0)*.05*Math.min(1,Math.abs(s.speed)/20);
      k.body.position.y=s.drift?Math.abs(Math.sin(clock*30))*.03:0;
      k.roll+=s.speed*dt/.33;
      for(const w of k.kart.wheels){w.tire.rotation.x=k.roll;if(w.front)w.pivot.rotation.y=-(s.steer||0)*.45;}
      k.kart.wheel.rotation.z=(s.steer||0)*.9;
      const boosting=s.boost>0;k.kart.flames.forEach(f=>{f.visible=boosting;f.scale.setScalar(.8+Math.random()*.5);f.material.color.set(s.boostKind==='orange'?'#ff8a2a':s.boostKind==='blue'?'#58b4ff':'#ffb347');});
      k.stars.visible=s.spin>0;k.stars.rotation.y+=dt*6;
      k.tag.visible=seat!==you;
      k.avatar.update(dt,{steer:s.steer||0,spin:s.spin||0,boost:s.boost,t:clock});
      // Particles: drift sparks by charge level, dust off-road, exhaust while boosting.
      const fx=Math.sin(s.yaw),fz=Math.cos(s.yaw),rx=-fz,rz=fx;
      if(s.drift&&Math.abs(s.speed)>8){const color=s.charge>=1.9?'#ff9d2e':s.charge>=.9?'#4fb3ff':'#fff3b0';
        for(const side of [-1,1])if(Math.random()<.9){const px=s.x-fx*.9+rx*side*.85,pz=s.z-fz*.9+rz*side*.85;sparks.emit(px,s.y+.15,pz,(Math.random()-.5)*3-fx*3,2+Math.random()*2,(Math.random()-.5)*3-fz*3,color);}}
      if(s.off&&Math.abs(s.speed)>6&&Math.random()<.6)sparks.emit(s.x-fx+rx*(Math.random()-.5),s.y+.2,s.z-fz+rz*(Math.random()-.5),-fx*2,1.5,-fz*2,'#b98c52',.5);
      if(boosting&&Math.random()<.8)sparks.emit(s.x-fx*1.7,s.y+.5,s.z-fz*1.7,-fx*6,.5,-fz*6,'#ffcc66',.25);
    }
    sparks.update(dt);
    // Chase camera on our kart; slow orbit when no kart is ours yet.
    let me=states?.[you];
    if(!me&&track&&karts.get(you)?.root){
      // Showcase turntable before the race: our kart parked on the grid, camera circling it.
      const g=T.at(track,track.N-12,0);me={x:g.x,y:g.y,z:g.z,yaw:g.yaw,speed:0,steer:Math.sin(clock*1.3)*.6,spin:0,boost:0};
      const k=karts.get(you);k.root.visible=true;k.root.position.set(me.x,me.y,me.z);k.root.rotation.y=me.yaw;k.body.rotation.set(0,0,0);k.tag.visible=false;
      k.kart.wheel.rotation.z=me.steer*.9;for(const w of k.kart.wheels)if(w.front)w.pivot.rotation.y=-me.steer*.45;k.avatar.update(dt,{steer:me.steer,spin:0,t:clock});
      for(const [seat,o] of karts)if(seat!==you&&o.root)o.root.visible=false;
      const a=me.yaw+Math.sin(clock*.35)*1.25,want=new THREE.Vector3(me.x+Math.sin(a)*4.4,me.y+1.9,me.z+Math.cos(a)*4.4);
      cam.pos.copy(want);cam.look.set(me.x,me.y+.9,me.z);cam.init=false;camera.fov=50;camera.updateProjectionMatrix();
      sun.position.set(me.x+40,me.y+90,me.z+25);sun.target.position.set(me.x,me.y,me.z);
      camera.position.copy(cam.pos);camera.lookAt(cam.look);renderer.render(scene,camera);return;
    }
    if(me){
      // Smooth only the heading, never the position: no rubber-band lag at speed.
      if(!cam.init)cam.yaw=me.yaw;let dy=me.yaw-cam.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));cam.yaw+=dy*Math.min(1,dt*(me.spin>0?2:6));cam.init=true;
      const back=phase==='results'?9:6.2,height=phase==='results'?4:2.6,orbit=phase==='results'?clock*.35:0;
      const ox=Math.sin(cam.yaw+orbit),oz=Math.cos(cam.yaw+orbit),fx=Math.sin(cam.yaw),fz=Math.cos(cam.yaw);
      cam.h=(cam.h??me.y)+(me.y-(cam.h??me.y))*Math.min(1,dt*5);
      cam.pos.set(me.x-ox*back,cam.h+height,me.z-oz*back);cam.look.set(me.x+fx*3,cam.h+1.1,me.z+fz*3);
      camera.fov+=((68+(me.boost>0?9:0)+Math.min(8,Math.abs(me.speed)*.18))-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();
      sun.position.set(me.x+40,me.y+90,me.z+25);sun.target.position.set(me.x,me.y,me.z);
    }else if(track){const a=clock*.08;cam.pos.set(Math.cos(a)*170,90,Math.sin(a)*170);cam.look.set(40,0,0);cam.init=false;sun.position.set(80,140,40);sun.target.position.set(0,0,0);}
    camera.position.copy(cam.pos);camera.lookAt(cam.look);
    renderer.render(scene,camera);
  }
  function sync(map,list,make,apply){
    const seen=new Set();
    for(const item of list){seen.add(item.id);let o=map.get(item.id);if(!o){o=make();map.set(item.id,o);scene.add(o);}apply(o,item);}
    for(const [id,o] of map)if(!seen.has(id)){scene.remove(o);map.delete(id);}
  }
  function resize(){const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  resize();addEventListener('resize',resize);
  function startCeremony(opts){cam.init=false;return ceremony.start({...opts,trackName:track?.name||''});}
  return {setTrack,setDriver,removeDriver,update,resize,renderer,startCeremony,
    stopCeremony:()=>{ceremony.stop();cam.init=false;},skipCeremony:()=>ceremony.skip(),get ceremonyDone(){return ceremony.done;},get ceremonyActive(){return ceremony.active;},
    set onCeremonySound(f){onCeremonySound=f;},
    diagnostics:()=>({ceremony:ceremony.diagnostics(),track:track?.id,drivers:[...karts].map(([seat,k])=>({seat,kind:k.kind,name:k.name,visible:!!k.root?.visible})),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}),
    destroy(){removeEventListener('resize',resize);renderer.dispose();}};
}
