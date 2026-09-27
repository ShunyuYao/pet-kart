// Per-track scenery and weather. Pure decoration placed outside the fences and the
// mountain embankments; it never touches the road or the rules.
import * as THREE from '../vendor/lib/three.module.js';
import T from '../game/track.cjs';

// Distance a decoration must keep from sample j: fence, plus the embankment footprint.
const footprint=(track,j)=>Math.max(track.fenceL[j],track.fenceR[j])+(track.theme.bank?track.y[j]*1.5+.5:0);
function bounds(track){let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(let i=0;i<track.N;i++){x0=Math.min(x0,track.x[i]);x1=Math.max(x1,track.x[i]);z0=Math.min(z0,track.z[i]);z1=Math.max(z1,track.z[i]);}return {x0,x1,z0,z1,cx:(x0+x1)/2,cz:(z0+z1)/2};}
// Many copies of one mesh in a single draw call.
function instanced(geometry,material,items,{shadow=true}={}){
  const m=new THREE.InstancedMesh(geometry,material,Math.max(1,items.length)),o=new THREE.Object3D();
  items.forEach((it,i)=>{o.position.set(it.x,it.y,it.z);o.rotation.set(it.rx||0,it.ry||0,it.rz||0);o.scale.set(it.sx??it.s??1,it.sy??it.s??1,it.sz??it.s??1);o.updateMatrix();m.setMatrixAt(i,o.matrix);});
  m.count=items.length;m.castShadow=shadow;m.receiveShadow=true;return m;
}
// Falling (or rising) particles in a box that follows the camera.
function weather(color,{count=1400,size=.35,fall=3.2,box=[140,60,140],opacity=.9,blending=THREE.NormalBlending}={}){
  const pos=new Float32Array(count*3),vel=new Float32Array(count);
  // Keep a clear column around the camera: a flake right at the lens renders as a big square.
  for(let i=0;i<count;i++){let x,z;do{x=(Math.random()-.5)*box[0];z=(Math.random()-.5)*box[2];}while(Math.hypot(x,z)<6);pos[i*3]=x;pos[i*3+1]=Math.random()*box[1];pos[i*3+2]=z;vel[i]=fall*(.6+Math.random()*.8);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const points=new THREE.Points(geo,new THREE.PointsMaterial({color,size,transparent:true,opacity,depthWrite:false,blending}));points.frustumCulled=false;
  return {object:points,update(dt,cam){points.position.set(cam.x,cam.y-box[1]*.35,cam.z);
    for(let i=0;i<count;i++){let y=pos[i*3+1]-vel[i]*dt;if(y<0)y+=box[1];if(y>box[1])y-=box[1];pos[i*3+1]=y;}
    geo.attributes.position.needsUpdate=true;}};
}

export function decorate(track,group,{canvasTex,noise}){
  let seed=track.N*7919;const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
  const clear=(x,z,m)=>{for(let j=0;j<track.N;j+=3)if(Math.hypot(track.x[j]-x,track.z[j]-z)<footprint(track,j)+m)return false;return true;};
  const b=bounds(track),spot=pad=>({x:b.x0-pad+rnd()*(b.x1-b.x0+2*pad),z:b.z0-pad+rnd()*(b.z1-b.z0+2*pad)});
  const updates=[];
  const style=track.theme.style;
  if(style==='cheese'||style==='yarn')classic(track,group,rnd);
  if(style==='snow'){
    // Snowy pines as instanced cones, snowmen, giant ice-cream cones, far peaks, snowfall.
    const pines=[];for(let n=0;n<2500&&pines.length<260;n++){const p=spot(90);if(clear(p.x,p.z,3))pines.push({...p,h:5+rnd()*7,ry:rnd()*6.28});}
    const trunkM=new THREE.MeshStandardMaterial({color:'#7a5238',roughness:1}),leafM=new THREE.MeshStandardMaterial({color:'#2f7d5b',roughness:.9,flatShading:true}),snowM=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.8,flatShading:true});
    group.add(instanced(new THREE.CylinderGeometry(.3,.45,1,7),trunkM,pines.map(p=>({x:p.x,y:p.h*.15,z:p.z,sx:1,sy:p.h*.3,sz:1}))));
    for(let k=0;k<3;k++){
      group.add(instanced(new THREE.ConeGeometry(1,1,8),leafM,pines.map(p=>({x:p.x,y:p.h*(.42+k*.2),z:p.z,ry:p.ry,sx:p.h*(.34-k*.07),sy:p.h*.42,sz:p.h*(.34-k*.07)}))));
      group.add(instanced(new THREE.ConeGeometry(1,1,8),snowM,pines.map(p=>({x:p.x,y:p.h*(.52+k*.2),z:p.z,ry:p.ry,sx:p.h*(.2-k*.04),sy:p.h*.22,sz:p.h*(.2-k*.04)}))));
    }
    const coneM=new THREE.MeshStandardMaterial({color:'#d99a55',roughness:.8,flatShading:true}),scoops=['#ffd1e8','#fff3c4','#c8f1ff','#e1d0ff'].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.6})),coal=new THREE.MeshStandardMaterial({color:'#222'}),carrot=new THREE.MeshStandardMaterial({color:'#ff8a2a'});
    let extra=0;for(let n=0;n<1200&&extra<44;n++){const p=spot(40);if(!clear(p.x,p.z,6))continue;extra++;const g=new THREE.Group();g.position.set(p.x,0,p.z);g.rotation.y=rnd()*6.28;
      if(extra%2){const s=1.2+rnd()*.6;for(const [r,y] of [[1.3,1.2],[.95,3],[.65,4.4]]){const ball=new THREE.Mesh(new THREE.SphereGeometry(r*s,14,10),snowM);ball.position.y=y*s;ball.castShadow=true;g.add(ball);}
        const nose=new THREE.Mesh(new THREE.ConeGeometry(.12*s,.6*s,8),carrot);nose.rotation.x=Math.PI/2;nose.position.set(0,4.4*s,.75*s);g.add(nose);for(const x of [-.22,.22]){const e=new THREE.Mesh(new THREE.SphereGeometry(.08*s,6,6),coal);e.position.set(x*s,4.6*s,.58*s);g.add(e);}}
      else{const s=1.6+rnd()*1.4,c=new THREE.Mesh(new THREE.ConeGeometry(1.1*s,3.2*s,10),coneM);c.rotation.x=Math.PI;c.position.y=1.6*s;c.castShadow=true;g.add(c);
        for(let k=0;k<2;k++){const sc=new THREE.Mesh(new THREE.SphereGeometry(1.05*s-k*.2*s,14,10),scoops[(n+k)%4]);sc.position.y=3.4*s+k*1.3*s;sc.castShadow=true;g.add(sc);}}
      group.add(g);}
    // Distant snow peaks ring the valley.
    const rockM=new THREE.MeshStandardMaterial({color:'#8fa3bf',roughness:1,flatShading:true}),capM=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.9,flatShading:true});
    const R=Math.max(b.x1-b.x0,b.z1-b.z0)*.5+180;
    for(let i=0;i<14;i++){const a=i/14*6.28+rnd()*.3,r=R+rnd()*120,h=90+rnd()*110,w=h*(.8+rnd()*.4);
      const m=new THREE.Mesh(new THREE.ConeGeometry(w,h,7),rockM);m.position.set(b.cx+Math.cos(a)*r,h/2-2,b.cz+Math.sin(a)*r);group.add(m);
      // Slightly wider than the rock underneath so the two surfaces never z-fight.
      const c=new THREE.Mesh(new THREE.ConeGeometry(w*.42*1.04,h*.42,7),capM);c.position.set(m.position.x,h-h*.21-2,m.position.z);group.add(c);}
    const snow=weather('#ffffff',{count:1600,size:.32,fall:3});group.add(snow.object);updates.push(snow.update);
  }
  if(style==='city'){
    // High-rise blocks with lit windows (a few instanced materials), neon arches, stars.
    const win=hue=>canvasTex(64,128,(c,w,h)=>{c.fillStyle='#121022';c.fillRect(0,0,w,h);for(let y=6;y<h;y+=12)for(let x=5;x<w;x+=12){const on=Math.random()<.55;c.fillStyle=on?hue:'#1e1b33';c.fillRect(x,y,7,7);}});
    const mats=['#ffd27a','#8fe9ff','#ff9be0','#fff3c8'].map(h=>{const t=win(h);return new THREE.MeshStandardMaterial({color:'#2a2742',map:t,emissive:'#ffffff',emissiveMap:t,emissiveIntensity:.9,roughness:.7});});
    const lots=mats.map(()=>[]);let count=0;
    for(let n=0;n<4000&&count<300;n++){const p=spot(70),w=8+rnd()*14,d=8+rnd()*14;if(!clear(p.x,p.z,Math.hypot(w,d)/2+2))continue;count++;
      const h=12+rnd()*rnd()*70;lots[n%mats.length].push({x:p.x,y:h/2,z:p.z,sx:w,sy:h,sz:d,ry:Math.round(rnd()*4)*Math.PI/2});}
    lots.forEach((items,i)=>group.add(instanced(new THREE.BoxGeometry(1,1,1),mats[i],items)));
    const neon=['#ff3ea5','#2de2ff','#b56bff'].map(c=>new THREE.MeshBasicMaterial({color:c})),postM=new THREE.MeshStandardMaterial({color:'#3a3656',roughness:.5,metalness:.4});
    for(let s=60,k=0;s<track.N-30;s+=140,k++){const c=T.at(track,s,0);
      // Skip arches that would hit a road passing overhead (the flyover).
      let low=true;for(let j=0;j<track.N;j+=3)if(track.y[j]>c.y+2&&Math.hypot(track.x[j]-c.x,track.z[j]-c.z)<track.wall+8){low=false;break;}if(!low)continue;
      const span=T.fence(track,s,1)+T.fence(track,s,-1)+1.6,arch=new THREE.Group();
      for(const side of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.6,7,.6),postM);p.position.set(side*span/2,3.5,0);arch.add(p);}
      const bar=new THREE.Mesh(new THREE.BoxGeometry(span,.5,.5),neon[k%3]);bar.position.y=7;arch.add(bar);
      const bar2=new THREE.Mesh(new THREE.BoxGeometry(span*.8,.25,.3),neon[(k+1)%3]);bar2.position.y=6.2;arch.add(bar2);
      const mid=(T.fence(track,s,1)-T.fence(track,s,-1))/2,p=T.at(track,s,mid);arch.position.set(p.x,p.y,p.z);arch.rotation.y=p.yaw;group.add(arch);}
    const starPos=new Float32Array(900*3);for(let i=0;i<900;i++){const a=rnd()*6.28,e=.08+rnd()*1.3,r=700;starPos[i*3]=b.cx+Math.cos(a)*Math.cos(e)*r;starPos[i*3+1]=Math.sin(e)*r;starPos[i*3+2]=b.cz+Math.sin(a)*Math.cos(e)*r;}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(starPos,3));const stars=new THREE.Points(sg,new THREE.PointsMaterial({color:'#ffffff',size:1.6,sizeAttenuation:false,fog:false}));group.add(stars);
  }
  if(style==='volcano'){
    // Basalt rocks, lava pools, the volcano itself with a glowing crater, rising embers.
    const rockM=new THREE.MeshStandardMaterial({color:'#2d272c',roughness:1,flatShading:true}),lavaM=new THREE.MeshBasicMaterial({color:'#ff6a1f'}),glowM=new THREE.MeshBasicMaterial({color:'#ffb347',transparent:true,opacity:.55});
    const rocks=[];for(let n=0;n<3000&&rocks.length<240;n++){const p=spot(80),s=1+rnd()*rnd()*6;if(clear(p.x,p.z,s+1))rocks.push({...p,y:s*.4,s,rx:rnd()*3,ry:rnd()*3});}
    group.add(instanced(new THREE.DodecahedronGeometry(1,0),rockM,rocks));
    const pools=[];for(let n=0;n<1500&&pools.length<36;n++){const p=spot(60),r=3+rnd()*9;if(clear(p.x,p.z,r+2))pools.push({...p,y:.04,s:r});}
    group.add(instanced(new THREE.CircleGeometry(1,24).rotateX(-Math.PI/2),lavaM,pools,{shadow:false}));
    group.add(instanced(new THREE.CircleGeometry(1.25,24).rotateX(-Math.PI/2),glowM,pools.map(p=>({...p,y:.02})),{shadow:false}));
    const L=track.theme.landmark;
    if(L){const coneT=canvasTex(256,256,(c,w,h)=>{noise(c,w,h,'#3a2f36',.18,5000,3);c.strokeStyle='rgba(255,110,40,.55)';c.lineWidth=3;for(let i=0;i<14;i++){c.beginPath();let x=Math.random()*w;c.moveTo(x,0);for(let y=0;y<h;y+=16){x+=(Math.random()-.5)*14;c.lineTo(x,y);}c.stroke();}},{repeat:[4,2]});
      const cone=new THREE.Mesh(new THREE.CylinderGeometry(L.top,L.r,L.h,40,1,true),new THREE.MeshStandardMaterial({map:coneT,roughness:1,side:THREE.DoubleSide}));cone.position.set(L.x,L.h/2-.5,L.z);cone.receiveShadow=true;group.add(cone);
      const crater=new THREE.Mesh(new THREE.CircleGeometry(L.top*.96,40).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:'#ff7a1f'}));crater.position.set(L.x,L.h-2.5,L.z);group.add(crater);
      const smokeM=new THREE.MeshStandardMaterial({color:'#4b3f47',roughness:1,transparent:true,opacity:.55,depthWrite:false});
      const puffs=[];for(let i=0;i<9;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(L.top*(.5+i*.12),14,10),smokeM);m.position.set(L.x+(rnd()-.5)*8,L.h+6+i*9,L.z+(rnd()-.5)*8);group.add(m);puffs.push({m,i});}
      // Puffs drift up from the crater and start again at the rim.
      let t=0;updates.push(dt=>{t+=dt;for(const p of puffs)p.m.position.y=L.h+6+(t*3+p.i*9)%80;});}
    const embers=weather('#ff8a3a',{count:900,size:.28,fall:-2.2,box:[140,50,140],opacity:.95,blending:THREE.AdditiveBlending});group.add(embers.object);updates.push(embers.update);
  }
  // Clouds for daytime tracks.
  if(!track.theme.night&&style!=='volcano'){const cloudM=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,transparent:true,opacity:.92});
    for(let i=0;i<18;i++){const c=new THREE.Group();for(let k=0;k<4;k++){const s=new THREE.Mesh(new THREE.SphereGeometry(6+rnd()*6,12,10),cloudM);s.position.set(k*7-10,rnd()*3,rnd()*4);c.add(s);}const a=rnd()*6.28,r=260+rnd()*200;c.position.set(b.cx+Math.cos(a)*r,60+rnd()*50,b.cz+Math.sin(a)*r);group.add(c);}}
  return {update(dt,cam){for(const u of updates)u(dt,cam);}};
}

// The original scenery of the first two tracks, unchanged.
function classic(track,group,rnd){
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
    group.add(g);
  }
}
