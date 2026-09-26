// Pure track geometry. Shared by the authoritative simulation, the guest's local
// prediction and the Three.js renderer so all three agree on the road.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.KartTrack=factory();})(globalThis,function(){
  'use strict';
  const TAU=Math.PI*2;
  // Control points are metres on the ground plane (x,z) plus optional height y.
  function figureEight(){
    const pts=[];
    for(let i=0;i<16;i++){const t=i/16*TAU;pts.push([118*Math.sin(t),2.6*(1-Math.cos(t)),78*Math.sin(2*t)]);}
    return pts;
  }
  const DEFS={
    cheese:{
      id:'cheese',name:'奶酪环岛',blurb:'长直道 + 连续 S 弯，适合练漂移',width:18,
      theme:{sky:['#7cc8ff','#dff3ff'],grass:'#7fcf6a',grass2:'#6bbd58',road:'#5c5f6b',curbA:'#ff5a5f',curbB:'#ffffff',accent:'#ffc93c'},
      points:[[0,0,-30],[0,0,40],[6,0,92],[40,0,124],[88,0,120],[112,0,86],[100,0,50],[72,0,34],[70,0,4],[98,0,-18],[124,0,-52],[118,0,-100],[80,0,-128],[30,0,-120],[4,0,-84]],
      boxes:[0.19,0.52,0.8],pads:[{s:0.36,lat:0,w:7},{s:0.66,lat:-3.5,w:6},{s:0.93,lat:3,w:6}],
    },
    yarn:{
      id:'yarn',name:'毛线八字桥',blurb:'8 字形立交，桥上桥下各一次交汇',width:16,
      theme:{sky:['#ffb3c7','#fff1dc'],grass:'#b7e07a',grass2:'#a2d162',road:'#6a5d78',curbA:'#8f6bff',curbB:'#fff6fb',accent:'#ff7fb0'},
      points:figureEight(),
      boxes:[0.14,0.43,0.66,0.9],pads:[{s:0.27,lat:0,w:7},{s:0.77,lat:0,w:7}],
    },
  };
  function catmull(p0,p1,p2,p3,t){
    const t2=t*t,t3=t2*t;
    return p1.map((_,k)=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3));
  }
  const cache=new Map();
  function build(id){
    if(cache.has(id))return cache.get(id);
    const def=DEFS[id];if(!def)throw Error('unknown_track');
    const P=def.points,n=P.length,dense=[];
    for(let i=0;i<n;i++)for(let j=0;j<60;j++)dense.push(catmull(P[(i-1+n)%n],P[i],P[(i+1)%n],P[(i+2)%n],j/60));
    // Arc-length resample to 1 m spacing so index ≈ metres along the road.
    const cum=[0];for(let i=1;i<=dense.length;i++){const a=dense[i-1],b=dense[i%dense.length];cum.push(cum[i-1]+Math.hypot(b[0]-a[0],b[2]-a[2]));}
    const length=cum[dense.length],N=Math.round(length),x=new Float64Array(N),y=new Float64Array(N),z=new Float64Array(N),tx=new Float64Array(N),tz=new Float64Array(N);
    let k=0;
    for(let i=0;i<N;i++){
      const s=i/N*length;while(cum[k+1]<s)k++;
      const a=dense[k],b=dense[(k+1)%dense.length],f=(s-cum[k])/Math.max(1e-9,cum[k+1]-cum[k]);
      x[i]=a[0]+(b[0]-a[0])*f;y[i]=a[1]+(b[1]-a[1])*f;z[i]=a[2]+(b[2]-a[2])*f;
    }
    for(let i=0;i<N;i++){const a=(i-1+N)%N,b=(i+1)%N,dx=x[b]-x[a],dz=z[b]-z[a],l=Math.hypot(dx,dz)||1;tx[i]=dx/l;tz[i]=dz/l;}
    const track={id,name:def.name,blurb:def.blurb,theme:def.theme,width:def.width,half:def.width/2,wall:def.width/2+5,N,length:N,x,y,z,tx,tz,
      boxes:def.boxes.map(f=>Math.round(f*N)),pads:def.pads.map(p=>({s:Math.round(p.s*N),lat:p.lat,w:p.w,len:7}))};
    cache.set(id,track);return track;
  }
  const wrap=(i,N)=>((i%N)+N)%N;
  // y is up and the chase camera looks along forward, so right = forward × up:
  // forward (0,1) -> right (-1,0); forward (1,0) -> right (0,1).
  const rightOf=(tx,tz)=>[-tz,tx];
  // Windowed nearest-sample search. `hint` keeps the figure-eight crossings on
  // the branch the kart is actually driving; -1 forces a global search.
  function locate(track,px,pz,hint=-1,window=45){
    const N=track.N;let best=-1,bestD=Infinity;
    const scan=(from,to)=>{for(let j=from;j<=to;j++){const i=wrap(j,N),dx=px-track.x[i],dz=pz-track.z[i],d=dx*dx+dz*dz;if(d<bestD){bestD=d;best=i;}}};
    if(hint<0)scan(0,N-1);else{scan(hint-window,hint+window);if(bestD>(track.wall*2.2)**2){bestD=Infinity;scan(0,N-1);}}
    const i=best,[rx,rz]=rightOf(track.tx[i],track.tz[i]),dx=px-track.x[i],dz=pz-track.z[i];
    const along=dx*track.tx[i]+dz*track.tz[i];
    return {i,s:wrap(i+along,N),lat:dx*rx+dz*rz,y:sampleY(track,i+along)};
  }
  function sampleY(track,s){const N=track.N,a=Math.floor(s),f=s-a;return track.y[wrap(a,N)]*(1-f)+track.y[wrap(a+1,N)]*f;}
  // Position of a point `s` metres along the centerline, offset `lat` to the right.
  function at(track,s,lat=0){
    const N=track.N,a=Math.floor(s),f=s-a,i=wrap(a,N),j=wrap(a+1,N);
    const cx=track.x[i]*(1-f)+track.x[j]*f,cz=track.z[i]*(1-f)+track.z[j]*f,cy=track.y[i]*(1-f)+track.y[j]*f;
    let tx=track.tx[i]*(1-f)+track.tx[j]*f,tz=track.tz[i]*(1-f)+track.tz[j]*f;const l=Math.hypot(tx,tz)||1;tx/=l;tz/=l;
    const [rx,rz]=rightOf(tx,tz);
    return {x:cx+rx*lat,y:cy,z:cz+rz*lat,tx,tz,yaw:Math.atan2(tx,tz)};
  }
  return {DEFS,ids:Object.keys(DEFS),build,locate,at,sampleY,rightOf,wrap};
});
