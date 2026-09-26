// All sound is synthesized with WebAudio at runtime: no recordings, no files.
// Off by default; the context is created from a user click (autoplay policy).
export function createAudio(){
  let ctx=null,master=null,sfxOn=false,musicOn=false,engine=null,musicTimer=null,step=0;
  function ensure(){if(!ctx){ctx=new AudioContext();master=ctx.createGain();master.gain.value=.5;master.connect(ctx.destination);}if(ctx.state==='suspended')void ctx.resume();return ctx;}
  function tone(freq,dur,{type='square',gain=.12,slide=0,delay=0,dest}={}){
    if(!ctx)return;const t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*slide),t+dur);
    g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(dest||master);o.start(t);o.stop(t+dur+.02);
  }
  function noise(dur,{gain=.2,filter=1200,delay=0}={}){
    if(!ctx)return;const t=ctx.currentTime+delay,len=Math.floor(ctx.sampleRate*dur),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=buf;f.type='lowpass';f.frequency.value=filter;g.gain.value=gain;s.connect(f);f.connect(g);g.connect(master);s.start(t);
  }
  const SFX={
    countdown:()=>tone(523,.18,{type:'square',gain:.1}),
    go:()=>{tone(1046,.45,{type:'square',gain:.12});tone(784,.45,{type:'triangle',gain:.1});},
    box:()=>[660,880,1175].forEach((f,i)=>tone(f,.09,{type:'triangle',gain:.09,delay:i*.05})),
    boost:()=>{noise(.5,{gain:.25,filter:2400});tone(220,.5,{type:'sawtooth',gain:.06,slide:3});},
    hit:()=>{noise(.35,{gain:.3,filter:900});tone(600,.5,{type:'square',gain:.08,slide:.25});},
    drop:()=>tone(300,.12,{type:'triangle',gain:.12,slide:.6}),
    fire:()=>{tone(440,.25,{type:'sawtooth',gain:.07,slide:2});noise(.2,{gain:.12,filter:3000});},
    lap:()=>[784,988,1175,1568].forEach((f,i)=>tone(f,.14,{type:'triangle',gain:.1,delay:i*.08})),
    finish:()=>[523,659,784,1046,784,1046].forEach((f,i)=>tone(f,.22,{type:'square',gain:.09,delay:i*.13})),
    bump:()=>noise(.12,{gain:.2,filter:600}),
    drumroll:()=>{for(let i=0;i<22;i++)noise(.05,{gain:.05+i*.004,filter:900,delay:i*.03});},
    land:()=>{noise(.18,{gain:.25,filter:500});tone(392,.25,{type:'triangle',gain:.1});},
    champion:()=>{[523,659,784,1046,1318].forEach((f,i)=>tone(f,.3,{type:'square',gain:.08,delay:i*.1}));noise(.6,{gain:.12,filter:4000,delay:.1});},
    pop:()=>{noise(.25,{gain:.18,filter:2600});tone(1600,.2,{type:'sine',gain:.04,slide:.4,delay:.05});},
  };
  const BASS=[48,48,55,55,53,53,50,55],MEL=[72,76,79,76,74,77,81,79,72,76,79,84,83,79,76,74];
  const midi=n=>440*Math.pow(2,(n-69)/12);
  function beat(){if(!ctx||!musicOn)return;const bar=Math.floor(step/4)%8;if(step%2===0)tone(midi(BASS[bar]),.2,{type:'triangle',gain:.09});tone(midi(MEL[step%16]),.12,{type:'square',gain:.035});if(step%4===2)noise(.05,{gain:.05,filter:5000});step++;}
  return {
    get sfx(){return sfxOn;},get music(){return musicOn;},
    setSfx(on){sfxOn=on;if(on)ensure();if(!on&&engine){engine.g.gain.value=0;}},
    setMusic(on){musicOn=on;if(on){ensure();clearInterval(musicTimer);musicTimer=setInterval(beat,140);}else clearInterval(musicTimer);},
    play(name){if(sfxOn&&ctx)SFX[name]?.();},
    engine(speed,throttle,boost){
      if(!sfxOn||!ctx)return;
      if(!engine){const o=ctx.createOscillator(),o2=ctx.createOscillator(),f=ctx.createBiquadFilter(),g=ctx.createGain();o.type='sawtooth';o2.type='square';f.type='lowpass';f.frequency.value=700;g.gain.value=0;o.connect(f);o2.connect(f);f.connect(g);g.connect(master);o.start();o2.start();engine={o,o2,g};}
      const s=Math.abs(speed),f=55+s*4.2+(boost?40:0),t=ctx.currentTime;
      engine.o.frequency.setTargetAtTime(f,t,.05);engine.o2.frequency.setTargetAtTime(f*.502,t,.05);engine.g.gain.setTargetAtTime(.025+(throttle?.035:0)+Math.min(.03,s*.001),t,.08);
    },
    silence(){if(engine)engine.g.gain.value=0;},
    dispose(){clearInterval(musicTimer);void ctx?.close();},
  };
}
