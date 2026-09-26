// Drivers that sit in a kart. Three kinds, same interface:
//   const a = await buildAvatar(asset); a.object (Group, y-up, faces +Z); a.update(dt,{steer,spin,boost,t})
// - doll3d: the pet-ragdoll-renderer rig (photo head + skinned garments), posed
//   seated with hands on the wheel. Physics is not simulated here; the rig is
//   driven kinematically, exactly like the renderer's authored idle clips.
// - sprite: a 2D image (current desktop pet or imported picture) as a billboard.
// - toy: a small procedural mascot, used for the computer rival and as a default.
import * as THREE from '../vendor/lib/three.module.js';
import * as CANNON from '../vendor/lib/cannon-es.js';
import {createRagdoll} from '../vendor/doll/ragdoll-adapter.js';
import {createWardrobe,dressPart} from '../vendor/doll/doll-appearance.js';
import {createGarments} from '../vendor/doll/garment-rig.js';

const V=(x=0,y=0,z=0)=>new CANNON.Vec3(x,y,z);
const axisQ=(axis,angle)=>{const q=new CANNON.Quaternion();q.setFromAxisAngle(axis,angle);return q;};
const X=V(1,0,0),Y=V(0,1,0),Z=V(0,0,1);
const add=(a,b)=>{const r=new CANNON.Vec3();a.vadd(b,r);return r;};
const sub=(a,b)=>{const r=new CANNON.Vec3();a.vsub(b,r);return r;};
const scale=(a,s)=>{const r=new CANNON.Vec3();a.scale(s,r);return r;};
const norm=v=>{const r=v.clone();r.normalize();return r;};
const between=(from,to)=>{const q=new CANNON.Quaternion();q.setFromVectors(norm(from),norm(to));return q;};

async function loadTexture(url){const t=await new THREE.TextureLoader().loadAsync(url);t.colorSpace=THREE.SRGBColorSpace;return t;}

// Seated driving pose in the rig's native frame (z up, facing -Y).
function seat(doll,steer=0,t=0,spin=0){
  const P=doll.parts,wheel=steer*.9;
  const lean=axisQ(Y,-steer*.18+Math.sin(spin*9)*.25*Math.min(1,spin)),back=axisQ(X,-.16),q=lean.mult(back);
  const bob=Math.sin(t*9)*.012;
  const pelvis=V(0,0,.34+bob);
  const place=(name,p,r)=>{P[name].position.copy(p);P[name].quaternion.copy(r);};
  place('pelvis',pelvis,q);
  const upper=add(pelvis,q.vmult(V(0,0,.49)));place('upperBody',upper,q);
  const shoulder=add(upper,q.vmult(V(0,0,.35))),head=add(shoulder,q.vmult(V(0,0,.35)));
  place('head',head,lean.mult(axisQ(X,-.05)).mult(axisQ(Y,-steer*.12)));
  // Hands on a wheel in front of the chest; the wheel turns with steering.
  const wc=add(shoulder,V(0,-.92,-.5));
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    // Legs forward along -Y (thigh near horizontal, shin angled down to the pedals).
    const hip=add(pelvis,q.vmult(V(sign*.18,0,-.14))),lq=axisQ(X,-1.42),kq=axisQ(X,-1.02);
    place('upper'+side+'Leg',add(hip,lq.vmult(V(0,0,-.42))),lq);
    const knee=add(hip,lq.vmult(V(0,0,-.84)));place('lower'+side+'Leg',add(knee,kq.vmult(V(0,0,-.39))),kq);
    const a=sign*.3,hand=add(wc,V(Math.cos(wheel)*a,0,Math.sin(wheel)*a*-1));
    const joint=add(shoulder,q.vmult(V(sign*.36,-.10,0)));
    const reach=sub(hand,joint),elbowDir=norm(add(norm(reach),V(sign*.55,0,-.45)));
    const uq=between(V(sign,0,0),elbowDir);
    place('upper'+side+'Arm',add(joint,scale(elbowDir,.31)),uq);
    const elbow=add(joint,scale(elbowDir,.62)),lowerDir=norm(sub(hand,elbow));
    place('lower'+side+'Arm',add(elbow,scale(lowerDir,.29)),between(V(sign,0,0),lowerDir));
  }
  for(const b of doll.bodies){b.visual.position.copy(b.position);b.visual.quaternion.copy(b.quaternion);}
  doll.garments.update();
}

// Standing celebration on the podium (rig frame: z up, facing -Y).
// style: 'jump' (both arms up, hopping), 'wave' (one arm waving), 'clap'.
function stand(doll,t=0,style='wave',cheer=1){
  const P=doll.parts,s=Math.sin(t*7),hop=style==='jump'?Math.max(0,Math.sin(t*6))*.28*cheer:0;
  const lean=axisQ(Y,style==='wave'?.05*Math.sin(t*3):0),q=lean;
  const pelvis=V(0,0,1.86+hop);
  const place=(name,p,r)=>{P[name].position.copy(p);P[name].quaternion.copy(r);};
  place('pelvis',pelvis,q);
  const upper=add(pelvis,q.vmult(V(0,0,.49)));place('upperBody',upper,q);
  const shoulder=add(upper,q.vmult(V(0,0,.35))),head=add(shoulder,q.vmult(V(0,0,.35)));
  place('head',head,lean.mult(axisQ(Y,.08*Math.sin(t*4)*cheer)).mult(axisQ(X,-.08)));
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    const tuck=hop>.05?.35:0,hip=add(pelvis,q.vmult(V(sign*.18,0,-.14))),lq=axisQ(X,tuck),kq=axisQ(X,-tuck*.1);
    place('upper'+side+'Leg',add(hip,lq.vmult(V(0,0,-.42))),lq);
    const knee=add(hip,lq.vmult(V(0,0,-.84)));place('lower'+side+'Leg',add(knee,kq.vmult(V(0,0,-.39))),kq);
    // Arm angle about Y: +sign*1.3 hangs down, -sign*.6 raises into a V.
    let armAngle=sign*1.25,elbow=sign*.08;
    if(style==='jump'){armAngle=-sign*(.55+.18*s*cheer);elbow=-sign*.45;}
    if(style==='wave'&&sign===-1){armAngle=.3;elbow=1.0+.45*Math.sin(t*9);}
    if(style==='clap'){armAngle=sign*.5;elbow=-sign*(1.15+.25*Math.max(0,Math.sin(t*12)));}
    const joint=add(shoulder,q.vmult(V(sign*.36,-.10,0)));
    let aq=q.mult(axisQ(Y,armAngle)),eq=q.mult(axisQ(Y,armAngle+elbow));
    if(style==='clap'){const fwd=axisQ(Z,sign*.9);aq=fwd.mult(aq);eq=fwd.mult(eq);}
    place('upper'+side+'Arm',add(joint,aq.vmult(V(sign*.31,0,0))),aq);
    const elbowP=add(joint,aq.vmult(V(sign*.62,0,0)));place('lower'+side+'Arm',add(elbowP,eq.vmult(V(sign*.29,0,0))),eq);
  }
  for(const b of doll.bodies){b.visual.position.copy(b.position);b.visual.quaternion.copy(b.quaternion);}
  doll.garments.update();
}

async function dollAvatar(asset,{standing=false}={}){
  const holder=new THREE.Group(),rig=new THREE.Group();
  // Build at identity so skinning bind matrices are captured in the rig frame.
  const texture=await loadTexture(asset.head);
  const garments={};
  for(const slot of ['top','bottom']){const g=asset.garments[slot];garments[slot]={kind:g.kind,assets:{front:g.front,back:g.back,frontBump:g.frontBump,backBump:g.backBump,shape:g.shape}};}
  const doll={id:asset.person,x:0,texture,garmentInputs:garments,wardrobe:createWardrobe(asset.person),...createRagdoll({angle:Math.PI*.62,angleShoulders:Math.PI*.8,twistAngle:Math.PI/3})};
  const picks=[];
  for(const b of doll.bodies){b.visual=dressPart(b,doll,picks);rig.add(b.visual);}
  doll.garments=await createGarments(doll,rig,picks);
  // Same head-scale anchoring as the renderer's appearance.mjs (chin stays put).
  const photo=doll.parts.head.visual.children.find(o=>o.userData.photoHead);
  if(photo&&asset.headScale!==1){
    const pos=photo.geometry.attributes.position,half=(photo.geometry.boundingBox.max.x-photo.geometry.boundingBox.min.x)*.025;let chin=Infinity;
    for(let i=0;i<pos.count;i++)if(Math.abs(pos.getX(i))<half)chin=Math.min(chin,pos.getY(i));
    const c=new THREE.Vector3(0,chin,0),anchor=c.clone().applyQuaternion(photo.quaternion).add(photo.position);
    photo.scale.setScalar(asset.headScale);photo.position.copy(anchor).sub(c.clone().multiplyScalar(asset.headScale).applyQuaternion(photo.quaternion));
  }
  rig.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;}});
  // z-up/-Y-forward rig → y-up/+Z-forward space.
  rig.rotation.x=-Math.PI/2;
  if(standing){stand(doll,0);rig.scale.setScalar(.5);rig.position.set(0,0,0);}
  else{seat(doll,0,0,0);rig.scale.setScalar(.6);rig.position.set(0,.33,-.5);}
  holder.add(rig);
  return {kind:'doll3d',object:holder,height:standing?1.9:1.4,
    update(dt,s){if(standing)stand(doll,s.t||0,s.style||'wave',s.cheer??1);else seat(doll,s.steer||0,s.t||0,s.spin||0);},dispose(){texture.dispose();}};
}

async function spriteAvatar(asset,{standing=false}={}){
  const textures=await Promise.all(asset.frames.map(loadTexture));
  const material=new THREE.SpriteMaterial({map:textures[0],transparent:true,alphaTest:.04,depthWrite:true});
  const sprite=new THREE.Sprite(material),h=1.55,w=Math.min(2.6,h*asset.aspect);
  // Sink the bottom ~22% (legs) into the cockpit so a standing picture reads as seated.
  if(standing){const hh=1.9,ww=Math.min(3,hh*asset.aspect);sprite.center.set(.5,0);sprite.scale.set(ww,ww/asset.aspect,1);sprite.position.set(0,0,0);}
  else{sprite.center.set(.5,.22);sprite.scale.set(w,w/asset.aspect,1);sprite.position.set(0,.5,-.35);}
  const holder=new THREE.Group();holder.add(sprite);
  let clock=0;
  return {kind:'sprite',object:holder,height:standing?1.9:1.5,update(dt,s){
    clock+=dt;if(asset.fps>0&&textures.length>1){const f=Math.floor(clock*asset.fps)%textures.length;if(material.map!==textures[f]){material.map=textures[f];}}
    if(standing){const t=s.t||0,hop=s.style==='jump'?Math.max(0,Math.sin(t*6))*.45:s.style==='wave'?Math.abs(Math.sin(t*4))*.12:Math.abs(Math.sin(t*6))*.06;
      sprite.position.y=hop*(s.cheer??1);material.rotation=s.style==='wave'?Math.sin(t*3)*.08:0;return;}
    material.rotation=s.spin>0?s.spin*12:-(s.steer||0)*.12;sprite.position.y=.5+Math.abs(Math.sin((s.t||0)*9))*.03;
  },dispose(){textures.forEach(t=>t.dispose());material.dispose();}};
}

function toyAvatar(asset,{standing=false}={}){
  const holder=new THREE.Group(),color=new THREE.Color(asset.color),mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.7});
  const fur=mat(color),light=mat(color.clone().lerp(new THREE.Color('#ffffff'),.55)),dark=mat('#2a2230'),pink=mat('#ff9fb8');
  const ball=(r,m,p,s=[1,1,1])=>{const o=new THREE.Mesh(new THREE.SphereGeometry(r,24,16),m);o.position.set(...p);o.scale.set(...s);o.castShadow=true;holder.add(o);return o;};
  const body=ball(.42,fur,[0,.72,-.4],[1,1.1,.9]);ball(.3,light,[0,.66,-.1],[1,1.1,.5]);
  const head=new THREE.Group();head.position.set(0,1.38,-.35);holder.add(head);
  const hb=(r,m,p,s)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(r,24,16),m);o.position.set(...p);if(s)o.scale.set(...s);o.castShadow=true;head.add(o);return o;};
  hb(.42,fur,[0,0,0],[1.08,.95,1]);hb(.07,dark,[-.15,.05,.37]);hb(.07,dark,[.15,.05,.37]);hb(.045,pink,[0,-.06,.41]);hb(.08,pink,[-.27,-.1,.3],[1,.6,.5]);hb(.08,pink,[.27,-.1,.3],[1,.6,.5]);
  if(asset.species==='mouse'){hb(.2,fur,[-.3,.34,0],[1,1,.35]);hb(.2,fur,[.3,.34,0],[1,1,.35]);hb(.13,pink,[-.3,.34,.05],[1,1,.3]);hb(.13,pink,[.3,.34,.05],[1,1,.3]);}
  if(asset.species==='cat')for(const s of [-1,1]){const e=new THREE.Mesh(new THREE.ConeGeometry(.14,.28,4),fur);e.position.set(s*.24,.38,0);e.rotation.z=-s*.35;head.add(e);}
  if(asset.species==='bunny')for(const s of [-1,1]){const e=hb(.1,fur,[s*.14,.55,-.02],[.9,2.6,.6]);e.rotation.z=-s*.15;hb(.06,pink,[s*.14,.55,.03],[.8,2.2,.4]);}
  const arms=[-1,1].map(s=>{const a=new THREE.Mesh(new THREE.CapsuleGeometry(.08,.42,4,8),fur);a.position.set(s*.34,.95,.05);a.rotation.x=Math.PI/2.4;a.rotation.z=s*.35;a.castShadow=true;holder.add(a);return a;});
  if(standing){holder.position.y=-.3;for(const a of arms)a.rotation.x=0;}
  const base=standing?-.3:0;
  return {kind:'toy',object:holder,height:1.6,update(dt,s){
    if(standing){const t=s.t||0,hop=s.style==='jump'?Math.max(0,Math.sin(t*6))*.45:Math.abs(Math.sin(t*5))*.1;holder.position.y=base+hop*(s.cheer??1);
      arms.forEach((a,i)=>{a.rotation.z=(i?1:-1)*(s.style==='jump'?2.4+Math.sin(t*8)*.3:s.style==='wave'&&i?2.2+Math.sin(t*9)*.5:.4);});head.rotation.z=Math.sin(t*4)*.12;return;}head.rotation.z=-(s.steer||0)*.2+(s.spin>0?Math.sin(s.spin*18)*.4:0);head.position.y=1.38+Math.abs(Math.sin((s.t||0)*8))*.03;body.rotation.z=-(s.steer||0)*.08;
    arms.forEach((a,i)=>{a.position.y=.95+(i?1:-1)*(s.steer||0)*.08;});},dispose(){}};
}

export async function buildAvatar(asset,fallback,opts={}){
  try{
    if(asset?.kind==='doll3d')return await dollAvatar(asset,opts);
    if(asset?.kind==='sprite')return await spriteAvatar(asset,opts);
  }catch(e){
    console.warn('avatar fallback',e);
    if(fallback)return buildAvatar(fallback,null,opts);
  }
  return toyAvatar(asset?.kind==='toy'?asset:{species:'mouse',color:'#ffc93c'},opts);
}
