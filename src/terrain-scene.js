// Original toy scenery. All animated obstacle positions and warnings come from
// the exact same race-clock function as collision detection.
import * as THREE from '../vendor/lib/three.module.js';
import T from '../game/track.cjs';
import E from '../game/terrain.cjs';
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.6,...extra});
const mesh=(g,geometry,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
function label(text,color){
  const c=document.createElement('canvas');c.width=384;c.height=128;const g=c.getContext('2d');
  g.fillStyle='#242332';g.beginPath();g.roundRect(4,4,376,120,24);g.fill();g.strokeStyle=color;g.lineWidth=7;g.stroke();
  g.fillStyle='#fff';g.font='bold 43px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText(text,192,65);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t}));s.scale.set(6,2,1);return s;
}
function strip(track,f,height,color){
  const pos=[],idx=[];
  for(let d=0;d<=f.len;d++){const h=height*d/f.len;for(const lat of [f.lat-f.w/2,f.lat+f.w/2]){const p=T.at(track,f.s+d,lat);pos.push(p.x,p.y+h+.06,p.z);}if(d){const i=d*2;idx.push(i-2,i,i-1,i-1,i,i+1);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
  return new THREE.Mesh(geo,mat(color,{side:THREE.DoubleSide,metalness:height?0:.3,roughness:height?.7:.15}));
}
export function glider(color){
  const group=new THREE.Group();group.visible=false;
  const white=mat('#fff5de',{side:THREE.DoubleSide,emissive:'#fff5de',emissiveIntensity:.2}),paint=mat(color,{side:THREE.DoubleSide,emissive:color,emissiveIntensity:.25});
  for(let i=0;i<8;i++){
    const verts=[];for(const n of [i,i+1]){const x=-3+n*.75,y=3.3+Math.sqrt(Math.max(0,1-(x/3)**2))*.8;verts.push(x,y,-.9,x,y-.18,1.2);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex([0,2,1,1,2,3]);geo.computeVertexNormals();mesh(group,geo,i%2?white:paint);
  }
  const lines=[];for(const x of [-2.6,2.6])for(const z of [-.8,1])lines.push(x,3.5,z,Math.sign(x)*.6,.65,z*.4);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));group.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#f5f4e9'})));
  return group;
}
export function terrainScene(track,parent){
  const entries=[];
  for(const f of E.features(track)){
    const g=new THREE.Group(),p=T.at(track,f.s,f.lat);g.position.set(p.x,p.y,p.z);g.rotation.y=p.yaw;parent.add(g);
    let body=null,warning=null,sign;
    if(f.kind==='ramp'){
      parent.add(strip(track,f,f.h,f.glide?'#37bbd1':'#ffc442'));
      // Dashed launch chevrons follow the ramp surface rather than floating flat.
      for(const d of [2,5,8])for(const side of [-1,1]){const q=T.at(track,f.s+d,f.lat+side);const m=mesh(parent,new THREE.BoxGeometry(1.6,.06,.3),mat('#fff8d8'),q.x,q.y+f.h*d/f.len+.12,q.z);m.rotation.y=q.yaw+side*.55;}
      sign=label(f.glide?'滑翔 ↑':'飞跃 ↑',f.glide?'#6cecff':'#ffdf6b');
    }else if(f.kind==='ice'){
      parent.add(strip(track,f,0,'#a0e9ff'));sign=label('冰面 · 慢转弯','#a0e9ff');
      for(let i=0;i<6;i++){const q=T.at(track,f.s+i*f.len/6,f.lat+(i%2?1:-1));const m=mesh(parent,new THREE.BoxGeometry(.06,.05,2),mat('#eaffff'),q.x,q.y+.1,q.z);m.rotation.y=q.yaw+.6;}
    }else if(f.kind==='wind'){
      sign=label(f.lift?'上升气流 ↑':'侧风 ↔','#b6f9e5');body=new THREE.Group();g.add(body);
      for(let i=0;i<4;i++){const m=mesh(body,new THREE.TorusGeometry(1.5+i*.2,.06,5,24),mat('#b6f9e5',{emissive:'#278f82',transparent:true,opacity:.65}),0,2+i*1.4,i*4);m.rotation.x=Math.PI/2;}
    }else if(f.kind==='lava'){
      mesh(g,new THREE.CylinderGeometry(2.3,2.7,.4,12),mat('#392d39'),0,.12);
      warning=mesh(g,new THREE.TorusGeometry(2,.18,6,20),mat('#ffca51',{emissive:'#ff521b'}),0,.4);warning.rotation.x=Math.PI/2;
      body=mesh(g,new THREE.ConeGeometry(1.8,10,9),mat('#ffae32',{emissive:'#ff5411',emissiveIntensity:1.4}),0,5);
      sign=label('喷口 · 留意预警','#ff9c4e');
    }else if(f.kind==='gate'){
      body=new THREE.Group();g.add(body);mesh(body,new THREE.BoxGeometry(2.6,1.5,1.2),mat('#ff4ba6'),0,1);
      for(const x of [-.8,0,.8])mesh(body,new THREE.BoxGeometry(.3,1.25,1.23),mat('#fff3c3'),x,1).rotation.z=-.4;
      for(const x of [-1,1])mesh(body,new THREE.SphereGeometry(.3,8,6),mat('#28232e'),x,.3);
      sign=label('移动路障 ↔','#ff65bb');
    }else if(f.kind==='iceblock'){
      body=mesh(g,new THREE.IcosahedronGeometry(1.65,0),mat('#8cdbff',{metalness:.2,roughness:.15}),0,1.3);sign=label('冰块 · 绕行','#a0e9ff');
    }else{
      const color={cheese:'#ffd55c',yarn:'#ff8fb9',snowball:'#effaff'}[f.kind];body=mesh(g,new THREE.SphereGeometry(1.5,16,10),mat(color),0,1.5);
      for(let i=0;i<3;i++){const ring=mesh(body,new THREE.TorusGeometry(1.51,.045,5,20),mat(f.kind==='snowball'?'#a7dfff':'#fff0bc'));ring.rotation.set(i*.9,i*.7,0);}
      sign=label({cheese:'滚动奶酪 ↔',yarn:'毛线球 ↔',snowball:'滚雪球 ↔'}[f.kind],color);
    }
    if(sign){const q=T.at(track,f.s-9,-track.half-1.5);sign.position.set(q.x,q.y+3.6,q.z);parent.add(sign);}
    entries.push({f,g,body,warning,phase:'idle'});
  }
  return {
    update(time){for(const e of entries){const {f,g,body,warning}=e,p=E.sample(track,f,time);e.phase=p.phase;g.position.set(p.x,p.y,p.z);
      if(f.kind==='lava'){body.visible=p.phase==='active';body.scale.y=.8+.2*Math.sin(time/80);warning.material.emissiveIntensity=p.phase==='warning'?1.2+Math.sin(time/90):p.phase==='active'?2:.15;warning.scale.setScalar(p.phase==='warning'?1.12:1);}
      else if(f.kind==='wind'){body.children.forEach((m,i)=>{m.position.y=1.5+((time/750+i*1.5)%6);});}
      else if(body&&f.kind!=='gate'){body.rotation.z=time/350;}
    }},
    diagnostics:()=>entries.map(({f,g,phase})=>({id:f.id,kind:f.kind,x:g.position.x,y:g.position.y,z:g.position.z,phase})),
  };
}
