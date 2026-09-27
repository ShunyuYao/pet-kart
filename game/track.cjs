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
  // Polyline with rounded corners: [x,y,z,r] vertices, r = corner radius in metres
  // (0 = pass straight through). Emits closely spaced points so the spline follows
  // the straights and arcs exactly. Corners stay level; height ramps along the straights.
  function rounded(verts,step=3){
    const n=verts.length,out=[],corner=[];
    const unit=(a,b)=>{const dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz);return [dx/l,dz/l,l];};
    for(let i=0;i<n;i++){
      const v=verts[i],r=v[3]||0,[ax,az,la]=unit(verts[(i-1+n)%n],v),[bx,bz,lb]=unit(v,verts[(i+1)%n]);
      const turn=Math.atan2(ax*bz-az*bx,ax*bx+az*bz),L=r*Math.tan(Math.abs(turn)/2);
      if(L>la/2+1e-6||L>lb/2+1e-6)throw Error('corner_too_tight:'+i);
      corner.push({L,turn,ax,az,bx,bz,r});
    }
    const push=(x,y,z)=>out.push([Math.round(x*100)/100,Math.round(y*100)/100,Math.round(z*100)/100]);
    for(let i=0;i<n;i++){
      const v=verts[i],c=corner[i],w=verts[(i+1)%n],d=corner[(i+1)%n];
      if(c.L>0){
        // Arc around vertex i from its entry tangent point to its exit tangent point.
        const sx=v[0]-c.ax*c.L,sz=v[2]-c.az*c.L,side=Math.sign(c.turn),nx=-c.az*side,nz=c.ax*side,cx=sx+nx*c.r,cz=sz+nz*c.r;
        const a0=Math.atan2(sx-cx,sz-cz),steps=Math.max(3,Math.ceil(Math.abs(c.turn)*c.r/2)),ex=v[0]+c.bx*c.L,ez=v[2]+c.bz*c.L;
        // Rotate whichever way lands on the exit tangent point.
        const end=g=>Math.hypot(cx+c.r*Math.sin(a0+g*c.turn)-ex,cz+c.r*Math.cos(a0+g*c.turn)-ez),g=end(1)<end(-1)?1:-1;
        for(let k=0;k<=steps;k++){const t=a0+g*c.turn*k/steps;push(cx+c.r*Math.sin(t),v[1],cz+c.r*Math.cos(t));}
      }else push(v[0],v[1],v[2]);
      // Straight from exit of i to entry of i+1.
      const len=unit(v,w)[2],from=c.L,to=len-d.L,m=Math.max(1,Math.floor((to-from)/step));
      for(let k=1;k<m;k++){const f=(from+(to-from)*k/m)/len;push(v[0]+(w[0]-v[0])*f,v[1]+(w[1]-v[1])*k/m,v[2]+(w[2]-v[2])*f);}
    }
    return out;
  }
  const LEVELS=['','入门','简单','进阶','困难','极难'];
  const DEFS={
    cheese:{
      id:'cheese',name:'奶酪环岛',blurb:'长直道 + 连续 S 弯，适合练漂移',width:18,level:1,
      theme:{style:'cheese',sky:['#7cc8ff','#dff3ff'],grass:'#7fcf6a',grass2:'#6bbd58',road:'#5c5f6b',curbA:'#ff5a5f',curbB:'#ffffff',accent:'#ffc93c'},
      points:[[0,0,-30],[0,0,40],[6,0,92],[40,0,124],[88,0,120],[112,0,86],[100,0,50],[72,0,34],[70,0,4],[98,0,-18],[124,0,-52],[118,0,-100],[80,0,-128],[30,0,-120],[4,0,-84]],
      boxes:[0.19,0.52,0.8],pads:[{s:0.36,lat:0,w:7},{s:0.66,lat:-3.5,w:6},{s:0.93,lat:3,w:6}],
    },
    yarn:{
      id:'yarn',name:'毛线八字桥',blurb:'8 字形立交，桥上桥下各一次交汇',width:16,level:2,
      theme:{style:'yarn',sky:['#ffb3c7','#fff1dc'],grass:'#b7e07a',grass2:'#a2d162',road:'#6a5d78',curbA:'#8f6bff',curbB:'#fff6fb',accent:'#ff7fb0'},
      points:figureEight(),
      boxes:[0.14,0.43,0.66,0.9],pads:[{s:0.27,lat:0,w:7},{s:0.77,lat:0,w:7}],
    },
    city:{
      id:'city',name:'霓虹夜城',blurb:'夜里的街区，直角弯接连不断，还有一段高架从起跑线头顶飞过',width:14,level:3,offMax:13,verge:3,
      theme:{style:'city',night:true,sky:['#0c0b2a','#3a1f6b','#7a3a8a'],fog:'#1d1540',grass:'#24233a',grass2:'#2b2a44',road:'#34343f',curbA:'#ff3ea5',curbB:'#2de2ff',accent:'#ff3ea5',
        midLine:'rgba(255,214,90,.9)',verge:'#4a4860',wallBase:'#1b1930',pillar:'#5a5678',light:{hemi:.7,sky:'#8a7dff',ground:'#1a1530',sun:.7,sunColor:'#aab8ff',exposure:1.15,fog:[90,480]}},
      points:rounded([[0,0,-60],[0,0,100,12],[70,0,100,9],[118,0,20,8],[160,0,140,10],[196,0,140,8],[210,0,116,8],[250,0,116,8],[264,0,140,8],[300,0,140,12],[300,0,-20,10],[130,5,-20],[0,7,-20],[-80,3,-20,10],[-80,0,-140,10],[20,0,-140,10],[20,0,-205,10],[200,0,-160,8],[0,0,-100,12]]),
      boxes:[.08,.36,.6,.82],pads:[{s:.24,lat:0,w:6},{s:.55,lat:-3,w:5},{s:.9,lat:3,w:5}],
    },
    snow:{
      id:'snow',name:'雪糕山道',blurb:'之字形爬坡上山顶，再一路长下坡冲回谷底',width:13,level:4,offMax:11,verge:2.5,grip:.8,
      theme:{style:'snow',bank:'#eef4fb',sky:['#9fd4ff','#f2fbff'],fog:'#eef6ff',grass:'#f4f8ff',grass2:'#e6eefb',road:'#5d6878',curbA:'#3aa0ff',curbB:'#ffffff',accent:'#7ad3ff',
        verge:'#dfe9f7',pillar:'#c9d6e8',light:{hemi:1.35,sun:2.2,sunColor:'#ffffff',exposure:1,fog:[140,600]}},
      points:rounded([[0,0,-130],[0,0,60,18],[-30,0,110,12],[20,1,160,12],[80,1,215,12],[140,1,175,12],[200,2,220,14],[260,3,190,14],[364,5,156,12],[208,16,91,8.5],[390,34,26,8.5],[208,48,-39,8.5],[377,52,-104,22],[312,52,-221,26],[130,32,-280,30],[-91,10,-299,12],[0,4,-221,18]]),
      boxes:[.1,.4,.62,.85],pads:[{s:.3,lat:0,w:6},{s:.7,lat:2,w:6}],
    },
    volcano:{
      id:'volcano',name:'熔岩火山',blurb:'路最窄：发卡弯爬上火山口，沿熔岩边缘绕行，再俯冲飞越起跑线',width:12,level:5,offMax:9.5,verge:2,grip:.9,
      theme:{style:'volcano',bank:'#3b3238',sky:['#3b1020','#ff8a4c','#ffd29a'],fog:'#7a3a30',grass:'#2e272c',grass2:'#28222a',cracks:'rgba(255,110,40,.85)',road:'#2a2a30',curbA:'#ff5a1f',curbB:'#ffd166',accent:'#ff5a1f',
        midLine:'rgba(255,140,60,.8)',verge:'#4a3b3a',wallBase:'#2a2226',pillar:'#4a3f44',landmark:{x:20,z:35,r:78,top:18,h:70},
        light:{hemi:.9,sky:'#ffb08a',ground:'#3a1f24',sun:1.7,sunColor:'#ffbe8a',exposure:1.05,fog:[120,560]}},
      points:rounded([[-60,0,240],[225,0,240,18],[225,4,170,12],[110,13,135,7.5],[240,22,87,7.5],[110,31,40,7.5],[230,40,-12,7.5],[120,49,-66,20],[-90,52,-80,16],[-180,47,-30,7.5],[-60,40,8,7.5],[-180,32,52,7.5],[-60,23,93,10],[0,13,165,20],[0,9,240],[0,3,340,16],[-180,0,340,18],[-180,0,240,18]]),
      boxes:[.06,.3,.55,.8],pads:[{s:.2,lat:0,w:5},{s:.62,lat:0,w:5},{s:.88,lat:-2,w:5}],
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
    const track={id,name:def.name,blurb:def.blurb,level:def.level,levelLabel:LEVELS[def.level],offMax:def.offMax||15,grip:def.grip||1,theme:def.theme,width:def.width,half:def.width/2,wall:def.width/2+(def.verge||5),N,length:N,x,y,z,tx,tz,
      boxes:def.boxes.map(f=>Math.round(f*N)),pads:def.pads.map(p=>({s:Math.round(p.s*N),lat:p.lat,w:p.w,len:7}))};
    // Fence distance per side. On the inside of a tight corner the fence cannot sit
    // further out than the corner radius, or the inside of a hairpin would become one
    // sand patch you could cut straight across.
    const radius=new Float64Array(N),fenceL=new Float64Array(N).fill(track.wall),fenceR=new Float64Array(N).fill(track.wall);
    for(let i=0;i<N;i++){const a=(i-1+N)%N,b=(i+1)%N;let d=Math.atan2(tx[b],tz[b])-Math.atan2(tx[a],tz[a]);d=Math.atan2(Math.sin(d),Math.cos(d));
      // Signed turning radius over 2 m; yaw falls when the road bends right (toward +lat).
      radius[i]=Math.abs(d)<1e-9?Infinity:-2/d;}
    for(let i=0;i<N;i++)for(let j=-6;j<=6;j++){const r=radius[(i+j+N)%N];if(!Number.isFinite(r))continue;
      const lim=Math.max(track.half+.5,Math.abs(r)*.92-.3);
      if(r>0)fenceR[i]=Math.min(fenceR[i],lim);else fenceL[i]=Math.min(fenceL[i],lim);}
    Object.assign(track,{fenceL,fenceR});
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
  // Lateral distance to the fence on the side of `lat` at sample i.
  const fence=(track,i,lat)=>(lat>0?track.fenceR:track.fenceL)[wrap(Math.round(i),track.N)];
  function sampleY(track,s){const N=track.N,a=Math.floor(s),f=s-a;return track.y[wrap(a,N)]*(1-f)+track.y[wrap(a+1,N)]*f;}
  // Position of a point `s` metres along the centerline, offset `lat` to the right.
  function at(track,s,lat=0){
    const N=track.N,a=Math.floor(s),f=s-a,i=wrap(a,N),j=wrap(a+1,N);
    const cx=track.x[i]*(1-f)+track.x[j]*f,cz=track.z[i]*(1-f)+track.z[j]*f,cy=track.y[i]*(1-f)+track.y[j]*f;
    let tx=track.tx[i]*(1-f)+track.tx[j]*f,tz=track.tz[i]*(1-f)+track.tz[j]*f;const l=Math.hypot(tx,tz)||1;tx/=l;tz/=l;
    const [rx,rz]=rightOf(tx,tz);
    return {x:cx+rx*lat,y:cy,z:cz+rz*lat,tx,tz,yaw:Math.atan2(tx,tz)};
  }
  return {DEFS,ids:Object.keys(DEFS),build,locate,at,sampleY,rightOf,wrap,fence};
});
